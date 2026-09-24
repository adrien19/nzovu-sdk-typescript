import {
  Duration,
  Message as ProtoMessage,
  QueueServiceTypes,
} from "@nzovu/proto";
import {
  Connection,
  CallbackClient,
  RpcMethod,
  Request,
  Response,
} from "../connection";
import { Logger, defaultLogger } from "../logger";
import { NzovuError, ErrorCode } from "../types";
import { handleGrpcError, validateRequired } from "../utils/errors";
import {
  PageOptions,
  page,
  priority,
  duration,
  message as validateMessage,
  integer,
  text,
} from "../utils/contracts";

export interface LeaseClaim {
  readonly queueName: string;
  readonly messageId: string;
  readonly workerId: string;
  readonly attemptId: string;
}
export interface HeartbeatHealth {
  isActive: boolean;
  consecutiveFailures: number;
  lastError?: Error;
  failedAt?: Date;
}
interface ManagedClaim extends HeartbeatHealth {
  claim: LeaseClaim;
  timer?: ReturnType<typeof setTimeout>;
  controller?: AbortController;
  heartbeatPromise?: Promise<QueueServiceTypes.SendMessageHeartBeatResponse>;
  onFailure?: (messageId: string, error: Error, failures: number) => void;
}

export class MessageClient {
  private readonly claims = new Map<string, ManagedClaim>();
  private readonly operations = new Set<Promise<unknown>>();
  private readonly controllers = new Set<AbortController>();
  private reservations = 0;
  private epoch = 0;

  constructor(
    private readonly connection: Connection,
    private workerId?: string,
    private readonly logger: Logger = defaultLogger,
    private readonly maxManagedClaims = 1000,
  ) {
    integer(maxManagedClaims, "maxManagedClaims", 1);
    connection.onDisconnect?.(() => this.stopAllHeartbeats());
  }
  setWorkerId(workerId: string): void {
    text(workerId, "workerId");
    this.workerId = workerId;
  }
  getWorkerId(): string | undefined {
    return this.workerId;
  }
  private key(claim: LeaseClaim): string {
    return JSON.stringify([
      claim.queueName,
      claim.messageId,
      claim.workerId,
      claim.attemptId,
    ]);
  }
  private claim(
    queueName: string,
    messageId: string,
    workerId?: string,
    attemptId?: string,
  ): LeaseClaim {
    text(queueName, "queueName");
    text(messageId, "messageId");
    text(workerId, "workerId");
    text(attemptId, "attemptId");
    return Object.freeze({ queueName, messageId, workerId, attemptId });
  }
  private rpc<K extends RpcMethod>(
    method: K,
    request: Request<K>,
    controller = new AbortController(),
  ): Promise<Response<K>> {
    this.controllers.add(controller);
    const promise = new Promise<Response<K>>((resolve, reject) => {
      let done = false;
      let handle: { cancel(): void } | undefined;
      const finish = (error: Error | null, response?: Response<K>) => {
        if (done) return;
        done = true;
        controller.signal.removeEventListener("abort", abort);
        this.controllers.delete(controller);
        if (error) reject(handleGrpcError(error));
        else if (response == null)
          reject(
            new NzovuError(ErrorCode.DATA_LOSS, "Empty response from server"),
          );
        else resolve(response);
      };
      const abort = () => {
        finish(
          new NzovuError(ErrorCode.CANCELLED, "Claim operation cancelled"),
        );
        handle?.cancel();
      };
      controller.signal.addEventListener("abort", abort, { once: true });
      if (controller.signal.aborted) {
        abort();
        return;
      }
      try {
        const call = this.connection.getQueueServiceClient()[
          method
        ] as CallbackClient[K];
        handle = (
          call as (
            request: Request<K>,
            callback: (error: Error | null, response: Response<K>) => void,
          ) => { cancel(): void }
        )(request, finish);
      } catch (error) {
        finish(error as Error);
      }
    });
    this.operations.add(promise);
    void promise.then(
      () => this.operations.delete(promise),
      () => this.operations.delete(promise),
    );
    return promise;
  }
  /**
   * Post a message to a queue
   */
  async postMessage(
    queueName: string,
    message: ProtoMessage.Message,
  ): Promise<boolean> {
    validateRequired(queueName, "queueName");
    validateMessage(message);

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<boolean>((resolve, reject) => {
        const request: QueueServiceTypes.PostMessageRequest = {
          queueName,
          message,
        };

        client.postMessage(request, (error, response) => {
          if (!error && response == null) {
            reject(new Error("Empty response from server"));
            return;
          }
          if (error) {
            reject(handleGrpcError(error));
          } else {
            resolve(response?.success || false);
          }
        });
      });
    });
  }

  /**
   * Post multiple messages to a queue in bulk
   *
   * @param queueName - Name of the queue to post messages to
   * @param messages - Array of messages to post (1-1000 messages)
   * @param transactionMode - Transaction mode (ALL_OR_NOTHING or BEST_EFFORT), default: ALL_OR_NOTHING
   * @returns PostMessagesBulkResponse with success counts and per-message results
   *
   * @throws {NzovuError} If messages array is empty or exceeds 1000
   * @throws {NzovuError} If queueName is empty
   * @throws {Error} For other gRPC errors
   *
   * @example
   * ```typescript
   * const messages = [
   *   { messageId: 'msg-1', metadata: { payload: { data: {...} }, priority: '4' } },
   *   { messageId: 'msg-2', metadata: { payload: { data: {...} }, priority: '2' } }
   * ];
   *
   * // Post with ALL_OR_NOTHING (default) - all succeed or all fail
   * const response = await client.messages.postMessagesBulk('my-queue', messages);
   *
   * // Post with BEST_EFFORT - partial success allowed
   * const response = await client.messages.postMessagesBulk(
   *   'my-queue',
   *   messages,
   *   QueueServiceTypes.PostMessagesBulkRequest_TransactionMode.BEST_EFFORT
   * );
   *
   * console.log(`Success: ${response.successfulCount}, Failed: ${response.failedCount}`);
   * ```
   */
  async postMessagesBulk(
    queueName: string,
    messages: ProtoMessage.Message[],
    transactionMode: QueueServiceTypes.PostMessagesBulkRequest_TransactionMode = QueueServiceTypes
      .PostMessagesBulkRequest_TransactionMode.ALL_OR_NOTHING,
  ): Promise<QueueServiceTypes.PostMessagesBulkResponse> {
    validateRequired(queueName, "queueName");
    validateRequired(messages, "messages");

    integer(transactionMode, "transactionMode", 0, 1);
    // Validate messages array
    if (!Array.isArray(messages)) {
      throw new Error("messages must be an array");
    }
    if (messages.length === 0) {
      throw new Error("messages array cannot be empty");
    }
    if (messages.length > 1000) {
      throw new Error(`too many messages: ${messages.length} (max 1000)`);
    }

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<QueueServiceTypes.PostMessagesBulkResponse>(
        (resolve, reject) => {
          const request: QueueServiceTypes.PostMessagesBulkRequest = {
            queueName,
            messages,
            transactionMode,
          };

          client.postMessagesBulk(request, (error, response) => {
            if (!error && response == null) {
              reject(new Error("Empty response from server"));
              return;
            }
            if (error) {
              reject(handleGrpcError(error));
            } else if (response) {
              resolve(response);
            } else {
              reject(new Error("Empty response from server"));
            }
          });
        },
      );
    });
  }

  async getNextMessage(
    queueName: string,
    leaseDuration?: Duration,
    exclusivityKey?: string,
    enableHeartbeat = false,
    heartbeatIntervalMs = 1000,
    workerId?: string,
    onHeartbeatFailure?: (
      messageId: string,
      error: Error,
      failures: number,
    ) => void,
    attemptId?: string,
  ): Promise<
    QueueServiceTypes.GetNextMessageResponse & {
      claim?: LeaseClaim;
      stopHeartbeat?: () => void;
    }
  > {
    text(queueName, "queueName");
    duration(leaseDuration, "leaseDuration");
    integer(heartbeatIntervalMs, "heartbeatIntervalMs", 100);
    if (workerId !== undefined) text(workerId, "workerId");
    if (attemptId !== undefined) text(attemptId, "attemptId");
    if (this.claims.size + this.reservations >= this.maxManagedClaims)
      throw new NzovuError(
        ErrorCode.RESOURCE_EXHAUSTED,
        "Maximum managed claims reached",
      );
    const epoch = this.epoch;
    this.reservations++;
    try {
      const response = await this.rpc("getNextMessage", {
        queueName,
        leaseDuration,
        exclusivityKey: exclusivityKey ?? "",
        workerId: workerId ?? this.workerId,
        attemptId,
      });
      if (epoch !== this.epoch)
        throw new NzovuError(ErrorCode.CANCELLED, "Acquisition cancelled");
      if (!response.message) return response;
      if (!response.workerId || !response.attemptId)
        throw new NzovuError(
          ErrorCode.DATA_LOSS,
          "Acquisition response lacks lease ownership",
        );
      const claim = this.claim(
        queueName,
        response.message.messageId,
        response.workerId,
        response.attemptId,
      );
      const key = this.key(claim);
      let context = this.claims.get(key);
      if (!context) {
        context = {
          claim,
          isActive: enableHeartbeat,
          consecutiveFailures: 0,
          onFailure: onHeartbeatFailure,
        };
        this.claims.set(key, context);
        if (enableHeartbeat)
          this.scheduleHeartbeat(context, heartbeatIntervalMs);
      }
      return {
        ...response,
        claim,
        stopHeartbeat: enableHeartbeat
          ? () => this.stopHeartbeat(claim)
          : undefined,
      };
    } finally {
      this.reservations--;
    }
  }

  async acknowledgeMessage(
    queueName: string,
    messageId: string,
    state: ProtoMessage.Message_Metadata_State,
    workerId?: string,
    attemptId?: string,
  ): Promise<boolean> {
    const claim = this.claim(queueName, messageId, workerId, attemptId);
    if (
      state !== ProtoMessage.Message_Metadata_State.COMPLETED &&
      state !== ProtoMessage.Message_Metadata_State.ERRORED
    )
      throw new NzovuError(
        ErrorCode.INVALID_ARGUMENT,
        "ACK state must be COMPLETED or ERRORED",
      );
    try {
      const response = await this.rpc("acknowledgeMessage", {
        ...claim,
        state,
      });
      if (response.success) this.releaseClaim(claim);
      return response.success;
    } catch (error) {
      this.handleClaimError(claim, error as Error);
      throw error;
    }
  }
  async cancelMessage(
    queueName: string,
    messageId: string,
    reason?: string,
  ): Promise<boolean> {
    text(queueName, "queueName");
    text(messageId, "messageId");
    const response = await this.rpc("cancelMessage", {
      queueName,
      messageId,
      reason,
    });
    if (response.success)
      for (const context of this.claims.values())
        if (
          context.claim.queueName === queueName &&
          context.claim.messageId === messageId
        )
          this.releaseClaim(context.claim);
    return response.success;
  }
  async sendHeartbeat(
    queueName: string,
    messageId: string,
    workerId?: string,
    attemptId?: string,
  ): Promise<QueueServiceTypes.SendMessageHeartBeatResponse> {
    return this.heartbeat(
      this.claim(queueName, messageId, workerId, attemptId),
    );
  }
  private heartbeat(
    claim: LeaseClaim,
  ): Promise<QueueServiceTypes.SendMessageHeartBeatResponse> {
    const context = this.claims.get(this.key(claim));
    if (context?.heartbeatPromise) return context.heartbeatPromise;
    const controller = new AbortController();
    if (context) context.controller = controller;
    const operation = this.rpc("sendMessageHeartBeat", claim, controller)
      .then(
        (response) => {
          if (response.state !== ProtoMessage.Message_Metadata_State.RUNNING)
            this.releaseClaim(claim);
          return response;
        },
        (error) => {
          this.handleClaimError(claim, error);
          throw error;
        },
      )
      .finally(() => {
        if (context?.controller === controller) {
          context.controller = undefined;
          context.heartbeatPromise = undefined;
        }
      });
    if (context) context.heartbeatPromise = operation;
    return operation;
  }
  async renewMessageLease(
    queueName: string,
    messageId: string,
    leaseDuration?: Duration,
    workerId?: string,
    attemptId?: string,
  ): Promise<QueueServiceTypes.RenewMessageLeaseResponse> {
    const claim = this.claim(queueName, messageId, workerId, attemptId);
    duration(leaseDuration, "leaseDuration");
    try {
      return await this.rpc("renewMessageLease", { ...claim, leaseDuration });
    } catch (error) {
      this.handleClaimError(claim, error as Error);
      throw error;
    }
  }
  private handleClaimError(claim: LeaseClaim, error: Error): void {
    const normalized = handleGrpcError(error);
    // The server prefixes ownership errors with the RPC operation.
    const reason = normalized.message.replace(
      /^failed to (?:acknowledge message|renew message lease|send message heartbeat): /,
      "",
    );
    // Renewal exhaustion leaves the current claim valid.
    if (
      normalized.code === ErrorCode.NOT_FOUND ||
      (normalized.code === ErrorCode.FAILED_PRECONDITION &&
        [
          "message is not running",
          "message is owned by another attempt",
          "message state changed during the operation",
        ].includes(reason)) ||
      (normalized.code === ErrorCode.DEADLINE_EXCEEDED &&
        reason === "message lease has expired")
    )
      this.releaseClaim(claim);
  }
  private scheduleHeartbeat(context: ManagedClaim, interval: number): void {
    if (
      !context.isActive ||
      this.claims.get(this.key(context.claim)) !== context
    )
      return;
    context.timer = setTimeout(
      async () => {
        context.timer = undefined;
        if (!context.isActive) return;
        try {
          await this.heartbeat(context.claim);
          context.consecutiveFailures = 0;
          context.lastError = undefined;
          context.failedAt = undefined;
        } catch (error) {
          if (!context.isActive) return;
          context.consecutiveFailures++;
          context.lastError = error as Error;
          context.failedAt ??= new Date();
          try {
            context.onFailure?.(
              context.claim.messageId,
              error as Error,
              context.consecutiveFailures,
            );
          } catch {
            this.logger.warn("Heartbeat failure callback threw");
          }
          if (context.consecutiveFailures >= 3)
            this.stopHeartbeat(context.claim);
        } finally {
          this.scheduleHeartbeat(context, interval);
        }
      },
      Math.max(100, Math.floor(interval * (0.95 + Math.random() * 0.1))),
    );
  }
  hasActiveHeartbeat(claim: LeaseClaim): boolean {
    return this.claims.get(this.key(claim))?.isActive ?? false;
  }
  getHeartbeatHealth(claim: LeaseClaim): HeartbeatHealth | undefined {
    const context = this.claims.get(this.key(claim));
    if (!context) return undefined;
    return {
      isActive: context.isActive,
      consecutiveFailures: context.consecutiveFailures,
      lastError: context.lastError,
      failedAt: context.failedAt,
    };
  }
  stopHeartbeat(claim: LeaseClaim): void {
    const context = this.claims.get(this.key(claim));
    if (!context) return;
    context.isActive = false;
    if (context.timer) clearTimeout(context.timer);
    context.timer = undefined;
    context.controller?.abort();
  }
  releaseClaim(claim: LeaseClaim): void {
    this.stopHeartbeat(claim);
    this.claims.delete(this.key(claim));
  }
  stopAllHeartbeats(): void {
    ++this.epoch;
    for (const context of this.claims.values())
      this.stopHeartbeat(context.claim);
    this.claims.clear();
    for (const controller of [...this.controllers]) controller.abort();
  }
  async drain(): Promise<void> {
    await Promise.allSettled([...this.operations]);
  }
  /**
   * Peek queue messages without consuming
   */
  async peekQueueMessages(
    queueName: string,
    options: PageOptions & {
      priorityRange?: QueueServiceTypes.PeekQueueMessagesRequest_PriorityRange;
    } = {},
  ): Promise<QueueServiceTypes.PeekQueueMessagesResponse> {
    validateRequired(queueName, "queueName");
    const paging = page(options);
    if (options.priorityRange) {
      priority(options.priorityRange.min);
      priority(options.priorityRange.max);
      if (BigInt(options.priorityRange.min) > BigInt(options.priorityRange.max))
        throw new Error("priority range is reversed");
    }

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<QueueServiceTypes.PeekQueueMessagesResponse>(
        (resolve, reject) => {
          const request: QueueServiceTypes.PeekQueueMessagesRequest = {
            queueName,
            ...paging,
            priorityRange: options.priorityRange,
          };

          client.peekQueueMessages(request, (error, response) => {
            if (!error && response == null) {
              reject(new Error("Empty response from server"));
              return;
            }
            if (error) {
              reject(handleGrpcError(error));
            } else {
              resolve(response);
            }
          });
        },
      );
    });
  }
}
