/**
 * Nzovu Client - Main entry point
 */

export { NzovuClient } from "./client";
export { Connection, ConnectionState } from "./connection";
export { DLQClient, type DLQStats } from "./dlq";
export { MessageClient } from "./message";
export type { HeartbeatHealth, LeaseClaim } from "./message";
export { QueueClient } from "./queue";
export { ScheduleClient } from "./schedule";
export { SchemaClient } from "./schema";
export {
  NzovuError,
  ClientConfig,
  ConnectionOptions,
  ErrorCode,
  type HealthCheckOptions,
  type RetryOptions,
  type RpcOptions,
} from "./types";

// Re-export logger types
export {
  ConsoleLogger,
  defaultLogger,
  LogLevel,
  SilentLogger,
  type Logger,
} from "./logger";

// Re-export retry utilities
export {
  calculateBackoff,
  isRetryableError,
  retryOperation,
  type RetryConfig,
} from "./utils/retry";

// Re-export duration utilities
export { durationToMs, msToDuration, parseDuration } from "./utils/duration";

// Re-export proto types for convenience
export {
  Message,
  Queue,
  QueueServiceTypes,
  QueueService,
  Schedule,
  Schema,
} from "@nzovu/proto";
export type { Duration, LeasePolicy, Timestamp } from "@nzovu/proto";

// Re-export Queue-specific types for easier access
// MessageRetentionPolicy and MessageRetentionPolicy_Mode are available via Queue namespace
// Example: Queue.MessageRetentionPolicy, Queue.MessageRetentionPolicy_Mode

// Re-export Bulk Message Posting types for easier access
export {
  PostMessagesBulkResponse_MessagePostResult_ErrorCode as BulkMessageErrorCode,
  PostMessagesBulkRequest_TransactionMode as TransactionMode,
} from "@nzovu/proto";
export type {
  PostMessagesBulkResponse_MessagePostResult as MessagePostResult,
  PostMessagesBulkRequest,
  PostMessagesBulkResponse,
} from "@nzovu/proto";

// Re-export error utilities
export {
  validateNonNegative,
  validatePositive,
  validateRange,
  validateRequired,
} from "./utils/errors";

export type { PageOptions, ListOptions } from "./utils/contracts";

export { timestampToISOString } from "./utils/timestamp";
