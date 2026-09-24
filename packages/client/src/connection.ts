import { QueueService } from "@nzovu/proto";
import * as grpc from "@grpc/grpc-js";
import {
  NzovuError,
  ConnectionOptions,
  ErrorCode,
  HealthCheckOptions,
  RetryOptions,
} from "./types";
import { RetryConfig, retryOperation } from "./utils/retry";

type QueueServiceClient = InstanceType<typeof QueueService.QueueServiceClient>;

/** Default retry configuration */
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 100,
  maxDelay: 10000,
  enabled: true,
};

/** Default health check configuration */
const DEFAULT_HEALTH_CHECK_OPTIONS: Required<HealthCheckOptions> = {
  enabled: false,
  intervalMs: 30000,
  autoReconnect: true,
  onHealthChange: () => {},
};

/**
 * Connection state for monitoring
 */
export enum ConnectionState {
  DISCONNECTED = "DISCONNECTED",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  RECONNECTING = "RECONNECTING",
}

/**
 * Manages gRPC connection and service clients with retry, health monitoring, and auto-reconnection
 */
export class Connection {
  private readonly address: string;
  private readonly credentials: grpc.ChannelCredentials;
  private readonly channelOptions: grpc.ChannelOptions;
  private readonly timeout: number;
  private readonly retryOptions: Required<RetryOptions>;
  private readonly healthCheckOptions: Required<HealthCheckOptions>;

  private queueServiceClient?: QueueServiceClient;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private lastHealthy: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 10;

  constructor(options: ConnectionOptions) {
    this.address = options.address;
    this.credentials = options.credentials || grpc.credentials.createInsecure();
    this.channelOptions = options.channelOptions || {};
    this.timeout = options.timeout || 10000;

    // Merge retry options with defaults
    this.retryOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      ...(options.retry || {}),
      // Support legacy options
      maxRetries:
        options.retry?.maxRetries ??
        options.maxRetries ??
        DEFAULT_RETRY_OPTIONS.maxRetries,
      baseDelay:
        options.retry?.baseDelay ??
        options.retryDelay ??
        DEFAULT_RETRY_OPTIONS.baseDelay,
    };

    // Merge health check options with defaults
    this.healthCheckOptions = {
      ...DEFAULT_HEALTH_CHECK_OPTIONS,
      ...(options.healthCheck || {}),
    };
  }

  /**
   * Connect to Nzovu server
   */
  async connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTED) {
      return;
    }

    this.state = ConnectionState.CONNECTING;

    try {
      // Create service client (Nzovu uses a single unified QueueService)
      this.queueServiceClient = new QueueService.QueueServiceClient(
        this.address,
        this.credentials,
        this.channelOptions,
      );

      // Wait for channel to be ready
      await this.waitForReady(this.queueServiceClient);

      this.state = ConnectionState.CONNECTED;
      this.lastHealthy = true;
      this.reconnectAttempts = 0;

      // Start health check if enabled
      if (this.healthCheckOptions.enabled) {
        this.startHealthCheck();
      }
    } catch (error) {
      this.state = ConnectionState.DISCONNECTED;
      throw new NzovuError(
        ErrorCode.CONNECTION_FAILED,
        `Failed to connect to ${this.address}: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * Wait for gRPC channel to be ready
   */
  private async waitForReady(client: grpc.Client): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + this.timeout);

      client.waitForReady(deadline, (error) => {
        if (error) {
          reject(
            new NzovuError(
              ErrorCode.CONNECTION_TIMEOUT,
              `Connection timeout after ${this.timeout}ms`,
              error,
            ),
          );
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Disconnect from Nzovu server
   */
  async disconnect(): Promise<void> {
    this.stopHealthCheck();

    if (this.state === ConnectionState.DISCONNECTED) {
      return;
    }

    this.queueServiceClient?.close();
    this.queueServiceClient = undefined;
    this.state = ConnectionState.DISCONNECTED;
    this.lastHealthy = false;
  }

  /**
   * Get QueueService client
   */
  getQueueServiceClient(): QueueServiceClient {
    this.ensureConnected();
    return this.queueServiceClient!;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get retry configuration for use by clients
   */
  getRetryConfig(): RetryConfig {
    return {
      maxRetries: this.retryOptions.maxRetries,
      baseDelay: this.retryOptions.baseDelay,
      maxDelay: this.retryOptions.maxDelay,
    };
  }

  /**
   * Check if retry is enabled
   */
  isRetryEnabled(): boolean {
    return this.retryOptions.enabled;
  }

  /**
   * Execute an operation with retry logic
   */
  async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.retryOptions.enabled) {
      return operation();
    }

    return retryOperation(operation, this.getRetryConfig());
  }

  /**
   * Start health check monitoring
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      return;
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.healthCheckOptions.intervalMs);
  }

  /**
   * Stop health check monitoring
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Perform a health check on the connection
   */
  private async performHealthCheck(): Promise<void> {
    if (!this.queueServiceClient) {
      this.handleUnhealthy(new Error("No client available"));
      return;
    }

    try {
      // Check gRPC channel connectivity state
      const channel = this.queueServiceClient.getChannel();
      const state = channel.getConnectivityState(false);

      const isHealthy = state === grpc.connectivityState.READY;

      if (isHealthy && !this.lastHealthy) {
        // Recovered
        this.lastHealthy = true;
        this.reconnectAttempts = 0;
        this.healthCheckOptions.onHealthChange(true);
      } else if (!isHealthy && this.lastHealthy) {
        // Became unhealthy
        this.handleUnhealthy(new Error(`Channel state: ${state}`));
      }
    } catch (error) {
      this.handleUnhealthy(error as Error);
    }
  }

  /**
   * Handle unhealthy connection state
   */
  private handleUnhealthy(error: Error): void {
    if (this.lastHealthy) {
      this.lastHealthy = false;
      this.healthCheckOptions.onHealthChange(false, error);
    }

    if (this.healthCheckOptions.autoReconnect) {
      this.attemptReconnect();
    }
  }

  /**
   * Attempt to reconnect to the server
   */
  private async attemptReconnect(): Promise<void> {
    if (this.state === ConnectionState.RECONNECTING) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.state = ConnectionState.RECONNECTING;
    this.reconnectAttempts++;

    try {
      // Close existing connection
      this.queueServiceClient?.close();
      this.queueServiceClient = undefined;

      // Exponential backoff for reconnection
      const delay = Math.min(
        this.retryOptions.baseDelay * Math.pow(2, this.reconnectAttempts - 1),
        this.retryOptions.maxDelay,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));

      // Attempt to reconnect
      this.queueServiceClient = new QueueService.QueueServiceClient(
        this.address,
        this.credentials,
        this.channelOptions,
      );

      await this.waitForReady(this.queueServiceClient);

      this.state = ConnectionState.CONNECTED;
      this.lastHealthy = true;
      this.reconnectAttempts = 0;
      this.healthCheckOptions.onHealthChange(true);
    } catch (_error) {
      this.state = ConnectionState.DISCONNECTED;
      // Will retry on next health check
    }
  }

  /**
   * Check connection health synchronously
   */
  checkHealth(): { healthy: boolean; state: ConnectionState } {
    return {
      healthy: this.lastHealthy && this.state === ConnectionState.CONNECTED,
      state: this.state,
    };
  }

  /**
   * Ensure connection is established
   */
  private ensureConnected(): void {
    if (this.state !== ConnectionState.CONNECTED) {
      throw new NzovuError(
        ErrorCode.CONNECTION_FAILED,
        "Not connected to Nzovu server. Call connect() first.",
      );
    }
  }
}
