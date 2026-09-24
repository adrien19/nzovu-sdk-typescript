/**
 * Zod validation schemas for MCP tool inputs
 *
 * These schemas provide runtime validation and TypeScript type inference
 * for all MCP tool handler arguments.
 */

import { z } from 'zod';

// ============================================================================
// Shared Schema Components
// ============================================================================

/**
 * Duration string format (e.g., "30s", "5m", "1h")
 */
const durationSchema = z
  .string()
  .regex(
    /^\d+(?:\.\d+)?(?:ms|s|m|h)$/,
    'Duration must be a valid format (e.g., "30s", "5m", "1h", "100ms")'
  );

/**
 * Lease policy configuration
 */
const leasePolicySchema = z
  .object({
    base_lease: durationSchema.optional(),
    max_extension: durationSchema.optional(),
    heartbeat_timeout: durationSchema.optional(),
    extend_step: durationSchema.optional(),
    max_renewals: z.number().int().min(0).optional(),
  })
  .optional();

/**
 * Retention policy configuration
 */
const retentionPolicySchema = z
  .object({
    mode: z.enum(['delete_immediately', 'retain_duration', 'retain_forever']),
    retention_seconds: z.number().int().min(0).optional(),
  })
  .optional();

/**
 * Priority level (1-10)
 */
const prioritySchema = z.number().int().min(1).max(10).default(5);

// ============================================================================
// Queue Management Schemas
// ============================================================================

export const createQueueSchema = z
  .object({
    queue_name: z.string().min(1).optional(), // Optional when 'name' is provided
    name: z.string().min(1).optional(), // Alias for queue_name
    queue_type: z.enum(['simple', 'exclusive']).default('simple'),
    max_attempts: z.number().int().min(1).max(100).default(3),
    auto_create_dlq: z.boolean().default(true),
    dlq_name: z.string().optional(),
    exclusivity_key: z.string().optional(),
    lease_policy: leasePolicySchema,
    retention_policy: retentionPolicySchema,
    lease_duration: durationSchema.optional(), // Legacy, deprecated
  })
  .refine((data) => data.queue_name || data.name, {
    message: 'Either queue_name or name must be provided',
  })
  .transform((data) => ({
    ...data,
    queue_name: data.queue_name || data.name!, // Ensure queue_name is always set
  }));

export const deleteQueueSchema = z.object({
  queue_name: z.string().min(1, 'Queue name is required'),
});

export const listQueuesSchema = z.object({
  prefix: z.string().optional(),
});

export const getQueueStateSchema = z.object({
  queue_name: z.string().min(1, 'Queue name is required'),
});

// ============================================================================
// Message Operation Schemas
// ============================================================================

export const postMessageSchema = z.object({
  queue_name: z.string().min(1, 'Queue name is required'),
  message_id: z.string().min(1, 'Message ID is required'),
  payload: z.record(z.unknown()).or(z.array(z.unknown())).or(z.string()),
  priority: prioritySchema.optional(),
  lease_duration: durationSchema.optional(),
  schema_id: z.string().optional(),
  schema_version: z.number().int().min(0).optional(),
});

const bulkMessageSchema = z.object({
  message_id: z.string().min(1, 'Message ID is required'),
  payload: z.record(z.unknown()).or(z.array(z.unknown())).or(z.string()),
  priority: prioritySchema.optional(),
  lease_duration: durationSchema.optional(),
  schema_id: z.string().optional(),
  schema_version: z.number().int().min(0).optional(),
});

export const postMessagesBulkSchema = z.object({
  queue_name: z.string().min(1, 'Queue name is required'),
  messages: z
    .array(bulkMessageSchema)
    .min(1, 'At least one message is required')
    .max(1000, 'Maximum 1000 messages per bulk operation'),
  transaction_mode: z
    .union([z.literal(0), z.literal(1)])
    .optional()
    .default(0),
});

export const getNextMessageSchema = z.object({
  queue_name: z.string().min(1, 'Queue name is required'),
  lease_duration: durationSchema.optional(),
  exclusivity_key: z.string().optional(),
  worker_id: z.string().optional(),
});

export const peekMessagesSchema = z.object({
  queue_name: z.string().min(1, 'Queue name is required'),
  limit: z.number().int().min(1).max(100).default(10),
  priority_min: z.number().int().min(1).max(10).optional(),
  priority_max: z.number().int().min(1).max(10).optional(),
});

export const acknowledgeMessageSchema = z.object({
  queue_name: z.string().min(1, 'Queue name is required'),
  message_id: z.string().min(1, 'Message ID is required'),
  status: z.enum(['completed', 'errored']),
  worker_id: z.string().optional(),
  attempt_id: z.string().optional(),
});

export const renewMessageLeaseSchema = z.object({
  worker_id: z.string().min(1),
  attempt_id: z.string().min(1),
  queue_name: z.string().min(1, 'Queue name is required'),
  message_id: z.string().min(1, 'Message ID is required'),
  lease_duration: durationSchema.optional(),
});

export const cancelMessageSchema = z.object({
  queue_name: z.string().min(1, 'Queue name is required'),
  message_id: z.string().min(1, 'Message ID is required'),
  reason: z.string().optional(),
});

// ============================================================================
// Schedule Schemas
// ============================================================================

export const createScheduleSchema = z
  .object({
    schedule_id: z.string().min(1, 'Schedule ID is required'),
    queue_name: z.string().min(1, 'Queue name is required'),
    schedule_type: z.enum(['cron', 'calendar']),
    payload: z.record(z.unknown()).or(z.array(z.unknown())),
    priority: prioritySchema.optional(),
    enabled: z.boolean().default(true),
    timezone: z.string().optional(), // IANA timezone (e.g., "America/New_York")
    // Cron schedule fields
    cron_expression: z.string().optional(),
    // Calendar schedule fields
    calendar_type: z.enum(['once', 'weekly', 'daily', 'business_days']).optional(),
    times_of_day: z
      .array(z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'))
      .optional(),
    days_of_week: z.array(z.number().int().min(1).max(7)).optional(),
    business_calendar_id: z.string().optional(), // For business_days calendar type
  })
  .refine(
    (data) => {
      if (data.schedule_type === 'cron') {
        return !!data.cron_expression;
      }
      return true;
    },
    { message: 'cron_expression is required for cron schedule type' }
  )
  .refine(
    (data) => {
      if (data.schedule_type === 'calendar') {
        return !!data.calendar_type;
      }
      return true;
    },
    { message: 'calendar_type is required for calendar schedule type' }
  );

export const getScheduleSchema = z.object({
  schedule_id: z.string().min(1, 'Schedule ID is required'),
});

export const listSchedulesSchema = z.object({
  prefix: z.string().optional(),
});

export const deleteScheduleSchema = z.object({
  schedule_id: z.string().min(1, 'Schedule ID is required'),
});

export const pauseScheduleSchema = z.object({
  schedule_id: z.string().min(1, 'Schedule ID is required'),
});

export const resumeScheduleSchema = z.object({
  schedule_id: z.string().min(1, 'Schedule ID is required'),
});

export const getScheduleHistorySchema = z.object({
  schedule_id: z.string().min(1, 'Schedule ID is required'),
  limit: z.number().int().min(1).max(1000).optional(),
});

// ============================================================================
// DLQ Schemas
// ============================================================================

// Helper to normalize dlq_name from either dlq_name or queue_name input
const dlqNamePreprocess = z.preprocess(
  (input: unknown) => {
    if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>;
      // Ensure dlq_name is set from either field
      if (!obj.dlq_name && obj.queue_name) {
        return { ...obj, dlq_name: obj.queue_name };
      }
    }
    return input;
  },
  z.object({
    dlq_name: z.string().min(1, 'DLQ name is required'),
    queue_name: z.string().optional(), // Keep for backward compat
    limit: z.number().int().min(1).max(100).default(10),
  })
);

export const getDLQMessagesSchema = dlqNamePreprocess;

export const requeueFromDLQSchema = z.preprocess(
  (input: unknown) => {
    if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>;
      const result = { ...obj };
      // Normalize dlq_name
      if (!result.dlq_name && result.queue_name) {
        result.dlq_name = result.queue_name;
      }
      // Normalize message_ids
      if (!result.message_ids && result.message_id) {
        result.message_ids = [result.message_id as string];
      } else if (typeof result.message_ids === 'string') {
        result.message_ids = [result.message_ids];
      }
      return result;
    }
    return input;
  },
  z.object({
    dlq_name: z.string().min(1, 'DLQ name is required'),
    queue_name: z.string().optional(),
    message_id: z.string().optional(),
    message_ids: z.array(z.string()).min(1, 'At least one message ID is required'),
    target_queue: z.string().min(1),
  })
);

export const deleteFromDLQSchema = z.preprocess(
  (input: unknown) => {
    if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>;
      const result = { ...obj };
      // Normalize dlq_name
      if (!result.dlq_name && result.queue_name) {
        result.dlq_name = result.queue_name;
      }
      // Normalize message_ids
      if (!result.message_ids && result.message_id) {
        result.message_ids = [result.message_id as string];
      } else if (typeof result.message_ids === 'string') {
        result.message_ids = [result.message_ids];
      }
      return result;
    }
    return input;
  },
  z.object({
    dlq_name: z.string().min(1, 'DLQ name is required'),
    queue_name: z.string().optional(),
    message_id: z.string().optional(),
    message_ids: z.array(z.string()).min(1, 'At least one message ID is required'),
  })
);

export const purgeDLQSchema = z.preprocess(
  (input: unknown) => {
    if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>;
      if (!obj.dlq_name && obj.queue_name) {
        return { ...obj, dlq_name: obj.queue_name };
      }
    }
    return input;
  },
  z.object({
    dlq_name: z.string().min(1, 'DLQ name is required'),
    queue_name: z.string().optional(),
  })
);

export const getDLQStatsSchema = z.preprocess(
  (input: unknown) => {
    if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>;
      if (!obj.dlq_name && obj.queue_name) {
        return { ...obj, dlq_name: obj.queue_name };
      }
    }
    return input;
  },
  z.object({
    dlq_name: z.string().min(1, 'DLQ name is required'),
    queue_name: z.string().optional(),
  })
);

// ============================================================================
// Schema Management Schemas
// ============================================================================

export const registerSchemaInputSchema = z.object({
  schema_id: z.string().min(1, 'Schema ID is required'),
  name: z.string().min(1, 'Schema name is required'),
  content: z.string().min(1, 'Schema content is required'),
  description: z.string().optional(),
  content_type: z.string().default('json-schema'),
  metadata: z.record(z.string()).optional(),
});

export const getSchemaSchema = z.object({
  schema_id: z.string().min(1, 'Schema ID is required'),
  version: z.number().int().min(0).default(0), // 0 = latest
});

export const listSchemasSchema = z.object({
  prefix: z.string().optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  active_only: z.boolean().optional(),
  include_all_versions: z.boolean().optional(),
});

export const deleteSchemaSchema = z.object({
  schema_id: z.string().min(1, 'Schema ID is required'),
  version: z.number().int().min(0).optional(), // 0 = all versions
});

export const validatePayloadSchema = z.object({
  schema_id: z.string().min(1, 'Schema ID is required'),
  payload: z.string().min(1, 'Payload is required'),
  version: z.number().int().min(0).default(0),
});

// ============================================================================
// Type Exports (inferred from schemas)
// ============================================================================

export type CreateQueueInput = z.infer<typeof createQueueSchema>;
export type DeleteQueueInput = z.infer<typeof deleteQueueSchema>;
export type ListQueuesInput = z.infer<typeof listQueuesSchema>;
export type GetQueueStateInput = z.infer<typeof getQueueStateSchema>;

export type PostMessageInput = z.infer<typeof postMessageSchema>;
export type PostMessagesBulkInput = z.infer<typeof postMessagesBulkSchema>;
export type GetNextMessageInput = z.infer<typeof getNextMessageSchema>;
export type PeekMessagesInput = z.infer<typeof peekMessagesSchema>;
export type AcknowledgeMessageInput = z.infer<typeof acknowledgeMessageSchema>;
export type RenewMessageLeaseInput = z.infer<typeof renewMessageLeaseSchema>;
export type CancelMessageInput = z.infer<typeof cancelMessageSchema>;

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type GetScheduleInput = z.infer<typeof getScheduleSchema>;
export type ListSchedulesInput = z.infer<typeof listSchedulesSchema>;
export type DeleteScheduleInput = z.infer<typeof deleteScheduleSchema>;
export type PauseScheduleInput = z.infer<typeof pauseScheduleSchema>;
export type ResumeScheduleInput = z.infer<typeof resumeScheduleSchema>;
export type GetScheduleHistoryInput = z.infer<typeof getScheduleHistorySchema>;

export type GetDLQMessagesInput = z.infer<typeof getDLQMessagesSchema>;
export type RequeueFromDLQInput = z.infer<typeof requeueFromDLQSchema>;
export type DeleteFromDLQInput = z.infer<typeof deleteFromDLQSchema>;
export type PurgeDLQInput = z.infer<typeof purgeDLQSchema>;
export type GetDLQStatsInput = z.infer<typeof getDLQStatsSchema>;

export type RegisterSchemaInput = z.infer<typeof registerSchemaInputSchema>;
export type GetSchemaInput = z.infer<typeof getSchemaSchema>;
export type ListSchemasInput = z.infer<typeof listSchemasSchema>;
export type DeleteSchemaInput = z.infer<typeof deleteSchemaSchema>;
export type ValidatePayloadInput = z.infer<typeof validatePayloadSchema>;

// ============================================================================
// Schema Registry for Dynamic Lookup
// ============================================================================

/**
 * Map of tool names to their validation schemas
 */
export const toolSchemas: Record<string, z.ZodSchema> = {
  // Queue Management
  create_queue: createQueueSchema,
  delete_queue: deleteQueueSchema,
  list_queues: listQueuesSchema,
  get_queue_state: getQueueStateSchema,

  // Message Operations
  post_message: postMessageSchema,
  post_messages_bulk: postMessagesBulkSchema,
  get_next_message: getNextMessageSchema,
  peek_messages: peekMessagesSchema,
  acknowledge_message: acknowledgeMessageSchema,
  renew_message_lease: renewMessageLeaseSchema,
  cancel_message: cancelMessageSchema,

  // Scheduling
  create_schedule: createScheduleSchema,
  get_schedule: getScheduleSchema,
  list_schedules: listSchedulesSchema,
  delete_schedule: deleteScheduleSchema,
  pause_schedule: pauseScheduleSchema,
  resume_schedule: resumeScheduleSchema,
  get_schedule_history: getScheduleHistorySchema,

  // Dead Letter Queue
  get_dlq_messages: getDLQMessagesSchema,
  requeue_from_dlq: requeueFromDLQSchema,
  delete_from_dlq: deleteFromDLQSchema,
  purge_dlq: purgeDLQSchema,
  get_dlq_stats: getDLQStatsSchema,

  // Schema Management
  register_schema: registerSchemaInputSchema,
  get_schema: getSchemaSchema,
  list_schemas: listSchemasSchema,
  delete_schema: deleteSchemaSchema,
  validate_payload: validatePayloadSchema,
};

/**
 * Validate tool input and return typed result
 *
 * @throws Error with validation details if input is invalid
 */
export function validateToolInput<T>(toolName: string, input: unknown): T {
  const schema = toolSchemas[toolName];
  if (!schema) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  const result = schema.safeParse(input);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new Error(`Validation failed: ${errors}`);
  }

  return result.data as T;
}
