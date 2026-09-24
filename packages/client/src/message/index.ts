import {
  Duration,
  Message as ProtoMessage,
  QueueServiceTypes,
} from "@nzovu/proto";
import { Connection } from "../connection";
import { Logger, defaultLogger } from "../logger";
import { handleGrpcError, validateRequired } from "../utils/errors";

/** Maximum consecutive heartbeat failures before stopping heartbeat */
const MAX_HEARTBEAT_FAILURES = 3;

/** Default heartbeat jitter percentage (±5%) */
const HEARTBEAT_JITTER_PERCENT = 0.05;

/**
 * Health status information for an active heartbeat
 */
export interface HeartbeatHealth {
  isActive: boolean;
  consecutiveFailures: number;
  lastError?: Error;
  failedAt?: Date;
}

/**
 * Context for tracking active heartbeats
 */
interface HeartbeatContext {
  stopHeartbeat: () => void;
  workerId?: string;
  attemptId?: string;
  consecutiveFailures: number;
  lastError?: Error;
  failedAt?: Date;
  onHeartbeatFailure?: (
    messageId: string,
    error: Error,
    consecutiveFailures: number,
  ) => void;
}

/**
 * Message client for message operations
 */
export class MessageClient {
  // Track active heartbeats by messageId with their context
  private heartbeats: Map<string, HeartbeatContext> = new Map();

  /** Optional client-level workerId used for all message operations */
  private workerId?: string;

  /** Logger instance for SDK logging */
  private logger: Logger;

  constructor(
    private readonly connection: Connection,
    workerId?: string,
    logger?: Logger,
  ) {
    this.workerId = workerId;
    this.logger = logger || defaultLogger;
  }

  /**
   * Set the workerId for this client instance
   */
  setWorkerId(workerId: string): void {
    this.workerId = workerId;
  }

  /**
   * Get the current workerId for this client instance
   */
  getWorkerId(): string | undefined {
    return this.workerId;
  }

  /**
   * Calculate jittered interval for heartbeat to prevent thundering herd
   */
  private calculateJitteredInterval(intervalMs: number): number {
    const jitterRange = intervalMs * HEARTBEAT_JITTER_PERCENT;
    const jitter = (Math.random() * 2 - 1) * jitterRange; // Random between -jitterRange and +jitterRange
    return Math.max(100, Math.floor(intervalMs + jitter)); // Minimum 100ms
  }

  /**
   * Post a message to a queue
   */
  async postMessage(
    queueName: string,
    message: ProtoMessage.Message,
  ): Promise<boolean> {
    validateRequired(queueName, "queueName");
    validateRequired(message, "message");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<boolean>((resolve, reject) => {
        const request: QueueServiceTypes.PostMessageRequest = {
          queueName,
          message,
        };

        client.postMessage(request, (error, response) => {
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
   *   { messageId: 'msg-1', metadata: { payload: { data: {...} }, priority: '10' } },
   *   { messageId: 'msg-2', metadata: { payload: { data: {...} }, priority: '5' } }
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

  /**
   * Get next message from a queue, with optional heartbeat monitoring
   *
   * @param queueName - Name of the queue to get message from
   * @param leaseDuration - Optional lease duration for the message
   * @param exclusivityKey - Optional exclusivity key for exclusive queues
   * @param enableHeartbeat - Whether to enable automatic heartbeat monitoring
   * @param heartbeatIntervalMs - Interval in ms for heartbeat (default: 1000)
   * @param workerId - Optional workerId override (defaults to client-level workerId)
   * @param onHeartbeatFailure - Optional callback invoked when heartbeat fails
   */
  async getNextMessage(
    queueName: string,
    leaseDuration?: Duration,
    exclusivityKey?: string,
    enableHeartbeat: boolean = false,
    heartbeatIntervalMs: number = 1000,
    workerId?: string,
    onHeartbeatFailure?: (
      messageId: string,
      error: Error,
      consecutiveFailures: number,
    ) => void,
  ): Promise<{
    message?: ProtoMessage.Message;
    workerId?: string;
    attemptId?: string;
    stopHeartbeat?: () => void;
  }> {
    validateRequired(queueName, "queueName");

    // Note: getNextMessage is NOT wrapped with retry because it modifies state (acquires lease)
    // Retrying could lead to multiple lease acquisitions
    const client = this.connection.getQueueServiceClient();
    // Use provided workerId, fall back to client-level workerId
    const effectiveWorkerId = workerId ?? this.workerId;

    return new Promise((resolve, reject) => {
      const request: QueueServiceTypes.GetNextMessageRequest = {
        queueName,
        leaseDuration,
        exclusivityKey: exclusivityKey || "",
        workerId: effectiveWorkerId,
      };

      client.getNextMessage(request, (error, response) => {
        if (error) {
          reject(handleGrpcError(error));
        } else {
          const message = response?.message;
          const responseWorkerId = response?.workerId;
          const responseAttemptId = response?.attemptId;
          let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
          let stopped = false;

          // Heartbeat logic
          const stopHeartbeat = () => {
            if (heartbeatTimer) {
              clearInterval(heartbeatTimer);
              heartbeatTimer = undefined;
              stopped = true;
            }
            // Remove from heartbeats map
            if (message?.messageId) {
              this.heartbeats.delete(message.messageId);
            }
          };

          if (enableHeartbeat && message && message.messageId) {
            // Start periodic heartbeat with jitter to prevent thundering herd
            const jitteredInterval =
              this.calculateJitteredInterval(heartbeatIntervalMs);
            heartbeatTimer = setInterval(() => {
              if (stopped) return;
              const heartbeatReq: QueueServiceTypes.SendMessageHeartBeatRequest =
                {
                  queueName,
                  messageId: message.messageId!,
                  workerId: responseWorkerId,
                  attemptId: responseAttemptId,
                };
              client.sendMessageHeartBeat(
                heartbeatReq,
                (err, heartbeatResponse) => {
                  if (err) {
                    // Get or initialize failure count
                    const context = this.heartbeats.get(message.messageId!);
                    if (!context) return; // Already stopped

                    context.consecutiveFailures++;
                    context.lastError = err;

                    if (context.consecutiveFailures === 1) {
                      context.failedAt = new Date();
                    }

                    // Classify error severity
                    const isFatalError = this.isFatalHeartbeatError(err);

                    // Log error with context
                    this.logger.error(
                      `Heartbeat error for messageId: ${message.messageId}`,
                      `(failure ${context.consecutiveFailures}/${MAX_HEARTBEAT_FAILURES})`,
                      err,
                    );

                    // Notify worker via callback
                    if (context.onHeartbeatFailure) {
                      try {
                        context.onHeartbeatFailure(
                          message.messageId!,
                          err,
                          context.consecutiveFailures,
                        );
                      } catch (callbackErr) {
                        this.logger.warn(
                          "Heartbeat failure callback threw error:",
                          callbackErr,
                        );
                      }
                    }

                    // Stop heartbeat on fatal errors or max failures
                    if (
                      isFatalError ||
                      context.consecutiveFailures >= MAX_HEARTBEAT_FAILURES
                    ) {
                      this.logger.warn(
                        `Stopping heartbeat for messageId: ${message.messageId} - ` +
                          (isFatalError
                            ? "fatal error"
                            : `${MAX_HEARTBEAT_FAILURES} consecutive failures`),
                      );
                      stopHeartbeat();
                    }

                    return;
                  }

                  // Reset failure count on success
                  const context = this.heartbeats.get(message.messageId!);
                  if (context) {
                    context.consecutiveFailures = 0;
                    context.lastError = undefined;
                    context.failedAt = undefined;
                  }

                  // Check if lease has expired (state changed to ERRORED or PENDING)
                  if (
                    heartbeatResponse?.state ===
                      ProtoMessage.Message_Metadata_State.ERRORED ||
                    heartbeatResponse?.state ===
                      ProtoMessage.Message_Metadata_State.PENDING
                  ) {
                    this.logger.warn(
                      `Lease expired for message ${message.messageId} - state changed to ${heartbeatResponse.state}`,
                    );
                    stopHeartbeat(); // Stop sending heartbeats
                    return;
                  }

                  // Log heartbeat success with remaining time
                  if (heartbeatResponse?.remainingTime) {
                    this.logger.debug(
                      `Heartbeat OK: ${heartbeatResponse.remainingTime.seconds}s remaining (state: ${heartbeatResponse.state})`,
                    );
                  }
                },
              );
            }, jitteredInterval);
            // Store heartbeat context in the map for this messageId
            this.heartbeats.set(message.messageId, {
              stopHeartbeat,
              workerId: responseWorkerId,
              attemptId: responseAttemptId,
              consecutiveFailures: 0,
              lastError: undefined,
              failedAt: undefined,
              onHeartbeatFailure,
            });
          }

          resolve({
            message,
            workerId: responseWorkerId,
            attemptId: responseAttemptId,
            stopHeartbeat: enableHeartbeat ? stopHeartbeat : undefined,
          });
        }
      });
    });
  }

  /**
   * Check if a message has an active heartbeat
   */
  hasActiveHeartbeat(messageId: string): boolean {
    return this.heartbeats.has(messageId);
  }

  /**
   * Get heartbeat context for a message (for internal use)
   */
  getHeartbeatContext(messageId: string): HeartbeatContext | undefined {
    return this.heartbeats.get(messageId);
  }

  /**
   * Acknowledge a message
   *
   * @param queueName - Name of the queue
   * @param messageId - Message ID to acknowledge
   * @param state - Final state (COMPLETED or ERRORED)
   * @param workerId - Optional workerId override
   * @param attemptId - Optional attemptId override
   */
  async acknowledgeMessage(
    queueName: string,
    messageId: string,
    state: ProtoMessage.Message_Metadata_State,
    workerId?: string,
    attemptId?: string,
  ): Promise<boolean> {
    validateRequired(queueName, "queueName");
    validateRequired(messageId, "messageId");
    validateRequired(state, "state");

    // Stop heartbeat for this message if active and retrieve context
    const heartbeatContext = this.heartbeats.get(messageId);
    if (heartbeatContext) {
      this.logger.debug("Stopping heartbeat for messageId:", messageId);
      heartbeatContext.stopHeartbeat();
      this.heartbeats.delete(messageId);

      // Use context values if not explicitly provided
      workerId = workerId ?? heartbeatContext.workerId;
      attemptId = attemptId ?? heartbeatContext.attemptId;
    }

    // Fall back to client-level workerId if not provided
    workerId = workerId ?? this.workerId;

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<boolean>((resolve, reject) => {
        const request: QueueServiceTypes.AcknowledgeMessageRequest = {
          queueName,
          messageId,
          state,
          workerId,
          attemptId,
        };

        client.acknowledgeMessage(request, (error, response) => {
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
   * Cancel a message before processing
   *
   * @param queueName - Name of the queue
   * @param messageId - Message ID to cancel
   * @param reason - Optional reason for cancellation (for audit/logging)
   */
  async cancelMessage(
    queueName: string,
    messageId: string,
    reason?: string,
  ): Promise<boolean> {
    validateRequired(queueName, "queueName");
    validateRequired(messageId, "messageId");

    // Stop heartbeat for this message if active
    const heartbeatContext = this.heartbeats.get(messageId);
    if (heartbeatContext) {
      this.logger.debug(
        "Stopping heartbeat for cancelled messageId:",
        messageId,
      );
      heartbeatContext.stopHeartbeat();
      this.heartbeats.delete(messageId);
    }

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<boolean>((resolve, reject) => {
        const request: QueueServiceTypes.CancelMessageRequest = {
          queueName,
          messageId,
          reason,
        };

        client.cancelMessage(request, (error, response) => {
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
   * Send a heartbeat for a message manually
   *
   * @param queueName - Name of the queue
   * @param messageId - Message ID to heartbeat
   * @param workerId - Optional workerId override
   * @param attemptId - Optional attemptId override
   */
  async sendHeartbeat(
    queueName: string,
    messageId: string,
    workerId?: string,
    attemptId?: string,
  ): Promise<{
    remainingTime?: Duration;
    state: ProtoMessage.Message_Metadata_State;
  }> {
    validateRequired(queueName, "queueName");
    validateRequired(messageId, "messageId");

    // Use heartbeat context values if available
    const heartbeatContext = this.heartbeats.get(messageId);
    if (heartbeatContext) {
      workerId = workerId ?? heartbeatContext.workerId;
      attemptId = attemptId ?? heartbeatContext.attemptId;
    }

    // Fall back to client-level workerId
    workerId = workerId ?? this.workerId;

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<{
        remainingTime?: Duration;
        state: ProtoMessage.Message_Metadata_State;
      }>((resolve, reject) => {
        const request: QueueServiceTypes.SendMessageHeartBeatRequest = {
          queueName,
          messageId,
          workerId,
          attemptId,
        };

        client.sendMessageHeartBeat(request, (error, response) => {
          if (error) {
            reject(handleGrpcError(error));
          } else {
            resolve({
              remainingTime: response?.remainingTime,
              state:
                response?.state || ProtoMessage.Message_Metadata_State.PENDING,
            });
          }
        });
      });
    });
  }

  /**
   * Renew message lease
   */
  async renewMessageLease(
    queueName: string,
    messageId: string,
    leaseDuration?: Duration,
  ): Promise<{
    remainingTime?: Duration;
    state: ProtoMessage.Message_Metadata_State;
  }> {
    validateRequired(queueName, "queueName");
    validateRequired(messageId, "messageId");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<{
        remainingTime?: Duration;
        state: ProtoMessage.Message_Metadata_State;
      }>((resolve, reject) => {
        const request: QueueServiceTypes.RenewMessageLeaseRequest = {
          queueName,
          messageId,
          leaseDuration,
        };

        client.renewMessageLease(request, (error, response) => {
          if (error) {
            reject(handleGrpcError(error));
          } else {
            resolve({
              remainingTime: response?.remainingTime,
              state:
                response?.state || ProtoMessage.Message_Metadata_State.PENDING,
            });
          }
        });
      });
    });
  }

  /**
   * Peek queue messages without consuming
   */
  async peekQueueMessages(
    queueName: string,
    limit: string,
  ): Promise<ProtoMessage.Message[]> {
    validateRequired(queueName, "queueName");
    validateRequired(limit, "limit");

    return this.connection.withRetry(async () => {
      const client = this.connection.getQueueServiceClient();

      return new Promise<ProtoMessage.Message[]>((resolve, reject) => {
        const request: QueueServiceTypes.PeekQueueMessagesRequest = {
          queueName,
          pageSize: Number(limit),
          pageToken: "",
          priorityRange: undefined,
        };

        client.peekQueueMessages(request, (error, response) => {
          if (error) {
            reject(handleGrpcError(error));
          } else {
            resolve(response?.messages || []);
          }
        });
      });
    });
  }

  /**
   * Stop all active heartbeats (for graceful shutdown)
   */
  stopAllHeartbeats(): void {
    this.logger.debug(`Stopping ${this.heartbeats.size} active heartbeats...`);

    // Create array copy to avoid modification during iteration
    const heartbeatEntries = Array.from(this.heartbeats.entries());

    // Clear map first to prevent new heartbeats from being added
    this.heartbeats.clear();

    // Then stop all timers
    for (const [messageId, context] of heartbeatEntries) {
      try {
        context.stopHeartbeat();
      } catch (err) {
        this.logger.warn(
          `Error stopping heartbeat for messageId ${messageId}:`,
          err,
        );
      }
    }

    this.logger.debug("All heartbeats stopped");
  }

  /**
   * Get heartbeat health status for a message
   * Returns undefined if no active heartbeat, otherwise status object
   */
  getHeartbeatHealth(messageId: string): HeartbeatHealth | undefined {
    const context = this.heartbeats.get(messageId);
    if (!context) return undefined;

    return {
      isActive: true,
      consecutiveFailures: context.consecutiveFailures,
      lastError: context.lastError,
      failedAt: context.failedAt,
    };
  }

  /**
   * Classify if a heartbeat error is fatal (should stop heartbeat immediately)
   */
  private isFatalHeartbeatError(error: any): boolean {
    // gRPC error codes that indicate connection failure
    const fatalGrpcCodes = [
      1, // CANCELLED - connection closed
      13, // INTERNAL - server internal error
      5, // NOT_FOUND - message/queue no longer exists
      7, // PERMISSION_DENIED - auth failure
      12, // UNIMPLEMENTED - server doesn't support heartbeat
    ];
    if (error.code && fatalGrpcCodes.includes(error.code)) {
      return true;
    }
    // Check error message patterns
    const fatalPatterns = [/channel.*closed/i, /connection.*closed/i];
    const errorMessage = error.message || error.toString();
    return fatalPatterns.some((pattern) => pattern.test(errorMessage));
  }
}
