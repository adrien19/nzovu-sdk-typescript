/**
 * @nzovu/proto
 *
 * Internal package containing compiled protobuf definitions for Nzovu.
 * This package is not intended for direct use by external applications.
 * Use @nzovu/client instead.
 */

// Export all generated proto types with namespaces to avoid conflicts
export * as Common from "./generated/proto/common/v1/common";
export * as Message from "./generated/proto/message/v1/message";
export * as Queue from "./generated/proto/queue/v1/queue";
export * as QueueServiceTypes from "./generated/proto/queueservice/v1/request_response";
export * as QueueService from "./generated/proto/queueservice/v1/service";
export * as Schedule from "./generated/proto/schedule/v1/schedule";
export * as Schema from "./generated/proto/schema/v1/schema";

// Re-export commonly used types directly for convenience
export type { LeasePolicy, Payload } from "./generated/proto/common/v1/common";

// Re-export Google API annotations
export * as GoogleApiAnnotations from "./generated/proto/google/api/annotations";
export * as GoogleApiFieldBehavior from "./generated/proto/google/api/field_behavior";
export * as GoogleApiHttp from "./generated/proto/google/api/http";

// Re-export Google protobuf types
export type { Duration } from "./generated/google/protobuf/duration";
export type { Timestamp } from "./generated/google/protobuf/timestamp";

export {
  PostMessagesBulkResponse_MessagePostResult_ErrorCode,
  PostMessagesBulkRequest_TransactionMode,
} from "./generated/proto/queueservice/v1/request_response";
export type {
  PostMessagesBulkResponse_MessagePostResult,
  PostMessagesBulkRequest,
  PostMessagesBulkResponse,
} from "./generated/proto/queueservice/v1/request_response";
