/**
 * Agent Worker Types
 *
 * Defines task types and interfaces for the agent orchestration system.
 * Tasks are posted to Nzovu and consumed by agent workers.
 */

/**
 * Task types that can be processed by the agent worker
 */
export enum TaskType {
  /** Execute a shell command */
  SHELL_COMMAND = "shell_command",
  /** Make an HTTP request */
  HTTP_REQUEST = "http_request",
  /** Process and transform data */
  DATA_TRANSFORM = "data_transform",
  /** Send a notification */
  NOTIFICATION = "notification",
  /** Aggregate results from multiple tasks */
  AGGREGATION = "aggregation",
  /** Custom task with arbitrary handler */
  CUSTOM = "custom",
}

/**
 * Task status for tracking execution
 */
export enum TaskStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

/**
 * Base interface for all task payloads
 */
export interface BaseTaskPayload {
  /** Unique task identifier */
  taskId: string;
  /** Type of task to execute */
  taskType: TaskType;
  /** Human-readable description */
  description?: string;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Timestamp when task was created */
  createdAt: string;
  /** Optional timeout in milliseconds */
  timeoutMs?: number;
  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    backoffMs: number;
  };
}

/**
 * Shell command task payload
 */
export interface ShellCommandTask extends BaseTaskPayload {
  taskType: TaskType.SHELL_COMMAND;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * HTTP request task payload
 */
export interface HttpRequestTask extends BaseTaskPayload {
  taskType: TaskType.HTTP_REQUEST;
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: unknown;
  expectedStatus?: number[];
}

/**
 * Data transformation task payload
 */
export interface DataTransformTask extends BaseTaskPayload {
  taskType: TaskType.DATA_TRANSFORM;
  inputData: unknown;
  transformations: Array<{
    type: "map" | "filter" | "reduce" | "sort" | "custom";
    expression: string;
  }>;
}

/**
 * Notification task payload
 */
export interface NotificationTask extends BaseTaskPayload {
  taskType: TaskType.NOTIFICATION;
  channel: "email" | "slack" | "webhook" | "console";
  recipient: string;
  subject: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Aggregation task payload
 */
export interface AggregationTask extends BaseTaskPayload {
  taskType: TaskType.AGGREGATION;
  sourceTaskIds: string[];
  aggregationType: "merge" | "sum" | "concat" | "custom";
}

/**
 * Custom task payload
 */
export interface CustomTask extends BaseTaskPayload {
  taskType: TaskType.CUSTOM;
  handlerName: string;
  params: Record<string, unknown>;
}

/**
 * Union type for all task payloads
 */
export type AgentTaskPayload =
  | ShellCommandTask
  | HttpRequestTask
  | DataTransformTask
  | NotificationTask
  | AggregationTask
  | CustomTask;

/**
 * Result of task execution
 */
export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  output?: unknown;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Worker configuration
 */
export interface WorkerConfig {
  /** Worker unique identifier */
  workerId: string;
  /** Queue to consume from */
  queueName: string;
  /** Nzovu server address */
  serverAddress: string;
  /** Maximum concurrent tasks */
  concurrency: number;
  /** Polling interval when queue is empty (ms) */
  pollIntervalMs: number;
  /** Whether to enable heartbeat for long-running tasks */
  enableHeartbeat: boolean;
  /** Heartbeat interval (ms) */
  heartbeatIntervalMs: number;
  /** Graceful shutdown timeout (ms) */
  shutdownTimeoutMs: number;
}

/**
 * Worker statistics
 */
export interface WorkerStats {
  workerId: string;
  startedAt: string;
  tasksProcessed: number;
  tasksSucceeded: number;
  tasksFailed: number;
  currentTasks: number;
  avgProcessingTimeMs: number;
  lastTaskAt?: string;
}
