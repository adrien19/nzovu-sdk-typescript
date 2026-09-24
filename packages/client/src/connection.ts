import { AsyncLocalStorage } from "node:async_hooks";
import { QueueService } from "@nzovu/proto";
import * as grpc from "@grpc/grpc-js";
import { NzovuError, ConnectionOptions, ErrorCode, RpcOptions } from "./types";
import { RetryConfig, calculateBackoff } from "./utils/retry";
import { handleGrpcError } from "./utils/errors";
import { integer, invalid, text } from "./utils/contracts";

type Service = typeof QueueService.QueueServiceService;
export type RpcMethod = keyof Service;
export type Request<K extends RpcMethod> = ReturnType<
  Service[K]["requestDeserialize"]
>;
export type Response<K extends RpcMethod> = ReturnType<
  Service[K]["responseDeserialize"]
>;
export type CallbackClient = {
  [K in RpcMethod]: (
    request: Request<K>,
    callback: (error: Error | null, response: Response<K>) => void,
    options?: RpcOptions,
  ) => { cancel(): void };
};
const READ_ONLY = new Set<RpcMethod>([
  "getQueueState",
  "listQueues",
  "peekQueueMessages",
  "getSchedule",
  "listSchedules",
  "getScheduleHistory",
  "getDlqMessages",
  "getDlqStats",
  "validateCalendarSchedule",
  "previewCalendarSchedule",
  "getSchema",
  "listSchemas",
  "validatePayload",
]);

export enum ConnectionState {
  DISCONNECTED = "DISCONNECTED",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  RECONNECTING = "RECONNECTING",
}

export class Connection {
  private readonly callContext = new AsyncLocalStorage<RpcOptions>();
  runWithOptions<T>(
    options: RpcOptions,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.callContext.run(options, operation);
  }
  private client?: InstanceType<typeof QueueService.QueueServiceClient>;
  private state = ConnectionState.DISCONNECTED;
  private connecting?: Promise<void>;
  private cancelConnect?: () => void;
  private epoch = 0;
  private healthTimer?: ReturnType<typeof setInterval>;
  private healthy = false;
  private readonly pending = new Set<() => void>();
  private readonly shutdownHooks = new Set<() => void>();
  private readonly credentials: grpc.ChannelCredentials;
  private readonly retry: Required<NonNullable<ConnectionOptions["retry"]>>;
  private readonly facade: CallbackClient;

  constructor(
    private readonly options: ConnectionOptions,
    private readonly requestTimeout = 30000,
  ) {
    text(options.address, "address");
    integer(options.timeout ?? 10000, "timeout", 1);
    integer(requestTimeout, "requestTimeout", 1);
    integer(options.maxInFlight ?? 1000, "maxInFlight", 1);
    if (options.insecure !== undefined && typeof options.insecure !== "boolean")
      invalid("insecure must be boolean");
    if (
      options.credentials &&
      (options.insecure !== undefined || options.tls !== undefined)
    )
      invalid("credentials cannot be combined with insecure/tls");
    if (options.insecure && options.tls)
      invalid("plaintext cannot use TLS options");
    if (Boolean(options.tls?.cert) !== Boolean(options.tls?.key))
      invalid("TLS cert and key must be provided together");
    for (const buffer of Object.values(options.tls ?? {}))
      if (!Buffer.isBuffer(buffer) || buffer.length === 0)
        invalid("TLS values must be nonempty PEM buffers");
    if (
      options.apiKey !== undefined &&
      (typeof options.apiKey !== "string" ||
        !/^[\x21-\x7e]+$/.test(options.apiKey))
    )
      invalid("apiKey must be nonempty printable ASCII");
    this.credentials =
      options.credentials ??
      (options.insecure
        ? grpc.credentials.createInsecure()
        : grpc.credentials.createSsl(
            options.tls?.ca,
            options.tls?.key,
            options.tls?.cert,
          ));
    this.retry = {
      enabled: true,
      maxRetries: options.maxRetries ?? 3,
      baseDelay: options.retryDelay ?? 100,
      maxDelay: 10000,
      ...options.retry,
    };
    integer(this.retry.maxRetries, "maxRetries", 0, 100);
    integer(this.retry.baseDelay, "baseDelay", 1);
    integer(this.retry.maxDelay, "maxDelay", 1);
    if (typeof this.retry.enabled !== "boolean")
      invalid("retry.enabled must be boolean");
    integer(
      options.healthCheck?.intervalMs ?? 30000,
      "healthCheck.intervalMs",
      1,
    );
    this.facade = Object.fromEntries(
      Object.keys(QueueService.QueueServiceService ?? {}).map((method) => [
        method,
        (
          request: Request<RpcMethod>,
          callback: (
            error: Error | null,
            response?: Response<RpcMethod>,
          ) => void,
          rpcOptions?: RpcOptions,
        ) => {
          const controller = new AbortController();
          const abort = () => controller.abort();
          rpcOptions?.signal?.addEventListener("abort", abort, { once: true });
          if (rpcOptions?.signal?.aborted) abort();
          void this.invoke(method as RpcMethod, request, {
            ...rpcOptions,
            signal: controller.signal,
          })
            .then(
              (result) => callback(null, result),
              (error) => callback(error),
            )
            .finally(() =>
              rpcOptions?.signal?.removeEventListener("abort", abort),
            );
          return { cancel: abort };
        },
      ]),
    ) as CallbackClient;
  }

  connect(): Promise<void> {
    if (this.isConnected()) return Promise.resolve();
    if (this.connecting) return this.connecting;
    const epoch = ++this.epoch;
    this.state = ConnectionState.CONNECTING;
    const client = new QueueService.QueueServiceClient(
      this.options.address,
      this.credentials,
      {
        ...this.options.channelOptions,
        "grpc.enable_retries": 0,
      },
    );
    this.client = client;
    const ready = new Promise<void>((resolve, reject) => {
      let finished = false;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        this.cancelConnect = undefined;
        if (error || epoch !== this.epoch) {
          client.close();
          if (this.client === client) this.client = undefined;
          this.state = ConnectionState.DISCONNECTED;
          reject(
            error ??
              new NzovuError(ErrorCode.CANCELLED, "Connection cancelled"),
          );
        } else {
          this.state = ConnectionState.CONNECTED;
          this.healthy = true;
          this.startHealthCheck();
          resolve();
        }
      };
      this.cancelConnect = () =>
        finish(new NzovuError(ErrorCode.CANCELLED, "Connection cancelled"));
      client.waitForReady(
        Date.now() + (this.options.timeout ?? 10000),
        (error) =>
          finish(
            error
              ? new NzovuError(
                  ErrorCode.CONNECTION_TIMEOUT,
                  "Connection timeout",
                  error,
                )
              : undefined,
          ),
      );
    });
    this.connecting = ready.finally(() => {
      if (epoch === this.epoch) this.connecting = undefined;
    });
    return this.connecting;
  }

  async disconnect(): Promise<void> {
    ++this.epoch;
    this.state = ConnectionState.DISCONNECTED;
    this.healthy = false;
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = undefined;
    for (const hook of this.shutdownHooks) hook();
    this.cancelConnect?.();
    this.connecting = undefined;
    for (const cancel of [...this.pending]) cancel();
    this.client?.close();
    this.client = undefined;
    await Promise.resolve();
  }

  onDisconnect(hook: () => void): () => void {
    this.shutdownHooks.add(hook);
    return () => this.shutdownHooks.delete(hook);
  }
  getQueueServiceClient(): CallbackClient {
    if (!this.isConnected())
      throw new NzovuError(
        ErrorCode.CONNECTION_FAILED,
        "Not connected to Nzovu server. Call connect() first.",
      );
    return this.facade;
  }
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }
  getState(): ConnectionState {
    return this.state;
  }
  checkHealth(): { healthy: boolean; state: ConnectionState } {
    return { healthy: this.healthy && this.isConnected(), state: this.state };
  }
  getRetryConfig(): RetryConfig {
    return {
      maxRetries: this.retry.maxRetries,
      baseDelay: this.retry.baseDelay,
      maxDelay: this.retry.maxDelay,
    };
  }
  isRetryEnabled(): boolean {
    return this.retry.enabled;
  }
  /** Retries are selected centrally by RPC semantics; arbitrary closures run once. */
  withRetry<T>(operation: () => Promise<T>): Promise<T> {
    return operation();
  }

  invoke<K extends RpcMethod>(
    method: K,
    request: Request<K>,
    options: RpcOptions = {},
  ): Promise<Response<K>> {
    const context = this.callContext.getStore();
    const signals = [context?.signal, options.signal].filter(
      (signal): signal is AbortSignal => signal !== undefined,
    );
    options = { ...context, ...options };
    const timeout = options.timeoutMs ?? this.requestTimeout;
    integer(timeout, "timeoutMs", 1);
    if (!this.isConnected() || !this.client)
      return Promise.reject(
        new NzovuError(
          ErrorCode.CONNECTION_FAILED,
          "Not connected to Nzovu server",
        ),
      );
    if (this.pending.size >= (this.options.maxInFlight ?? 1000))
      return Promise.reject(
        new NzovuError(
          ErrorCode.RESOURCE_EXHAUSTED,
          "Maximum in-flight RPCs reached",
        ),
      );
    const client = this.client;
    const deadline = Date.now() + timeout;
    return new Promise((resolve, reject) => {
      let done = false;
      let call: grpc.ClientUnaryCall | undefined;
      let retryTimer: ReturnType<typeof setTimeout> | undefined;
      let attempt = 0;
      const finish = (error?: Error, response?: Response<K>) => {
        if (done) return;
        done = true;
        clearTimeout(deadlineTimer);
        if (retryTimer) clearTimeout(retryTimer);
        this.pending.delete(cancel);
        for (const signal of signals)
          signal.removeEventListener("abort", cancel);
        if (error) reject(handleGrpcError(error));
        else resolve(response!);
      };
      const cancel = () => {
        finish(new NzovuError(ErrorCode.CANCELLED, "RPC cancelled"));
        call?.cancel();
      };
      const deadlineTimer = setTimeout(() => {
        finish(
          new NzovuError(ErrorCode.DEADLINE_EXCEEDED, "RPC deadline exceeded"),
        );
        call?.cancel();
      }, timeout);
      this.pending.add(cancel);
      for (const signal of signals)
        signal.addEventListener("abort", cancel, { once: true });
      const run = () => {
        if (done) return;
        const metadata = new grpc.Metadata();
        if (this.options.apiKey) metadata.set("api-key", this.options.apiKey);
        const callback = (
          error: grpc.ServiceError | null,
          response?: Response<K>,
        ) => {
          if (done) return;
          call = undefined;
          if (
            error &&
            this.retry.enabled &&
            READ_ONLY.has(method) &&
            error.code === grpc.status.UNAVAILABLE &&
            attempt < this.retry.maxRetries
          ) {
            const delay = calculateBackoff(attempt++, this.getRetryConfig());
            if (Date.now() + delay < deadline) {
              retryTimer = setTimeout(run, delay);
              return;
            }
          }
          finish(
            error ??
              (response == null
                ? new NzovuError(
                    ErrorCode.DATA_LOSS,
                    "Empty response from server",
                  )
                : undefined),
            response,
          );
        };
        try {
          const unary = client[method] as unknown as (
            request: Request<K>,
            metadata: grpc.Metadata,
            options: grpc.CallOptions,
            handler: typeof callback,
          ) => grpc.ClientUnaryCall;
          call = unary.call(client, request, metadata, { deadline }, callback);
        } catch (error) {
          finish(error as Error);
        }
      };
      if (signals.some((signal) => signal.aborted)) cancel();
      else run();
    });
  }

  private startHealthCheck(): void {
    if (!this.options.healthCheck?.enabled) return;
    this.healthTimer = setInterval(() => {
      if (!this.client || !this.isConnected()) return;
      const healthy =
        this.client
          .getChannel()
          .getConnectivityState(
            this.options.healthCheck?.autoReconnect !== false,
          ) === grpc.connectivityState.READY;
      if (healthy === this.healthy) return;
      this.healthy = healthy;
      try {
        if (healthy) this.options.healthCheck?.onHealthChange?.(true);
        else
          this.options.healthCheck?.onHealthChange?.(
            false,
            new Error("Channel unavailable"),
          );
      } catch {
        /* User callbacks cannot interrupt connection lifecycle. */
      }
    }, this.options.healthCheck.intervalMs ?? 30000);
  }
}
