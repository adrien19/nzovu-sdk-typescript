import { z } from 'zod';

const name = z.string().min(1);
const int32 = z.number().int().min(-2147483648).max(2147483647);
const nonnegative = int32.min(0);
const int64 = z
  .string()
  .regex(/^-?\d+$/)
  .refine(
    (value) =>
      /^-?\d+$/.test(value) &&
      BigInt(value) >= -9223372036854775808n &&
      BigInt(value) <= 9223372036854775807n,
    'int64 out of range'
  );
export const durationSchema = z
  .object({
    seconds: z
      .string()
      .regex(/^\d+$/)
      .refine(
        (value) => /^\d+$/.test(value) && BigInt(value) <= 315576000000n,
        'duration out of range'
      ),
    nanos: z.number().int().min(0).max(999999999).default(0),
  })
  .strict();
const timestamp = z
  .object({
    seconds: int64.refine(
      (value) =>
        /^-?\d+$/.test(value) && BigInt(value) >= -62135596800n && BigInt(value) <= 253402300799n,
      'timestamp out of range'
    ),
    nanos: z.number().int().min(0).max(999999999).default(0),
  })
  .strict();
const priority = z.enum(['0', '1', '2', '3', '4']);
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const json: z.ZodType<Json> = z.lazy(() =>
  z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(json)])
);
const base64 = z
  .string()
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
  .refine(
    (value) => Buffer.from(value, 'base64').length <= 4096,
    'header value exceeds 4096 bytes'
  );
const headers = z
  .array(
    z
      .object({
        key: name
          .regex(/^[a-z0-9-]+$/)
          .refine((key) => !/^(x-nzovu-|x-internal-|x-system-)/.test(key), 'reserved header key'),
        value: base64,
      })
      .strict()
  )
  .refine(
    (values) =>
      values.reduce(
        (total, header) =>
          total + Buffer.byteLength(header.key) + Buffer.from(header.value, 'base64').length,
        0
      ) <= 32768,
    'headers exceed 32768 bytes'
  );
const leasePolicy = z
  .object({
    baseLease: durationSchema.optional(),
    maxExtension: durationSchema.optional(),
    heartbeatTimeout: durationSchema.optional(),
    extendStep: durationSchema.optional(),
    maxRenewals: nonnegative.optional(),
  })
  .strict();
const payload = z
  .object({
    data: z.record(json).optional(),
    metadata: z.record(json).optional(),
    contentType: z.string().optional(),
    schemaId: z.string().optional(),
    schemaVersion: nonnegative.optional(),
  })
  .strict();
const message = z
  .object({
    messageId: name.regex(/^[a-zA-Z0-9_-]{1,256}$/),
    metadata: z
      .object({
        payload: payload.optional(),
        priority: priority.default('0'),
        maxAttempts: int32.min(-1).optional(),
        leaseDuration: durationSchema.optional(),
        leasePolicy: leasePolicy.optional(),
        scheduledTime: timestamp.optional(),
        headers: headers.optional(),
      })
      .strict(),
  })
  .strict();
const bulkMessage = message.extend({
  messageId: z.string(),
  metadata: message.shape.metadata
    .extend({
      priority: int64.optional(),
      payload: payload.extend({ schemaVersion: int32.optional() }).optional(),
      headers: z
        .array(
          z
            .object({
              key: z.string(),
              value: z
                .string()
                .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
            })
            .strict()
        )
        .optional(),
    })
    .optional(),
});
const time = z.object({ hour: int32, minute: int32.optional(), second: int32.optional() }).strict();
const holidayRule = z
  .object({
    fixed: z.object({ month: int32, day: int32 }).strict().optional(),
    relative: z.object({ month: int32, weekday: int32, occurrence: int32 }).strict().optional(),
    easterOffset: z.object({ daysOffset: int32 }).strict().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length === 1, 'one holiday rule required');
const calendarRule = z
  .object({
    monthly: z
      .object({
        dayType: int32,
        dayValue: int32.optional(),
        occurrence: int32.optional(),
        months: z.array(int32).optional(),
      })
      .strict()
      .optional(),
    weekly: z
      .object({
        daysOfWeek: z.array(int32),
        weekInterval: int32.optional(),
        startWeek: timestamp.optional(),
      })
      .strict()
      .optional(),
    daily: z
      .object({
        dayInterval: int32.optional(),
        weekdaysOnly: z.boolean().optional(),
        startDate: timestamp.optional(),
      })
      .strict()
      .optional(),
    yearly: z
      .object({ month: int32, day: int32, adjustForLeapYear: z.boolean().optional() })
      .strict()
      .optional(),
    businessDays: z
      .object({ businessCalendarId: z.string().optional(), dayOffset: int32.optional() })
      .strict()
      .optional(),
    custom: z
      .object({
        expression: z.string().optional(),
        ruleType: z.string().optional(),
        parameters: z.record(z.string()).optional(),
      })
      .strict()
      .optional(),
    executionTimes: z.array(time).optional(),
    validFrom: timestamp.optional(),
    validUntil: timestamp.optional(),
  })
  .strict()
  .refine(
    (value) =>
      ['monthly', 'weekly', 'daily', 'yearly', 'businessDays', 'custom'].filter(
        (key) => key in value
      ).length <= 1,
    'calendar rule variants are mutually exclusive'
  );
export const calendarSchema = z
  .object({
    type: int32,
    rules: z.array(calendarRule),
    timezone: z.string(),
    businessCalendar: z
      .object({
        calendarId: z.string().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        timezone: z.string().optional(),
        weekendDays: z.array(int32).optional(),
        holidays: z
          .array(
            z
              .object({
                name: z.string(),
                date: timestamp.optional(),
                recurringYearly: z.boolean().optional(),
                rule: holidayRule.optional(),
              })
              .strict()
          )
          .optional(),
      })
      .strict()
      .optional(),
    exceptions: z
      .array(
        z
          .object({
            date: timestamp,
            type: int32,
            rescheduleTo: timestamp.optional(),
            extraTimes: z.array(time).optional(),
            reason: z.string().optional(),
          })
          .strict()
      )
      .optional(),
  })
  .strict();
const queueMetadata = z
  .object({
    type: z.number().int().min(0).max(1).optional(),
    defaultMaxAttempts: int32.min(-1).optional(),
    leaseDuration: durationSchema.optional(),
    exclusivityKey: z.string().optional(),
    deadLetterQueueName: z.string().optional(),
    autoCreateDlq: z.boolean().optional(),
    schemaId: z.string().optional(),
    schemaRequired: z.boolean().optional(),
    maxPayloadSize: nonnegative.optional(),
    allowedContentTypes: z.array(z.string()).optional(),
    priorityConfig: z
      .object({
        policy: z.number().int().min(0).max(2),
        priorityWeights: z.record(z.enum(['0', '2', '4']), int32.min(1)).optional(),
        ageBoostThreshold: durationSchema.optional(),
        ageBoostMultiplier: int32.min(0).optional(),
      })
      .strict()
      .optional(),
    leasePolicy: leasePolicy.optional(),
    messageRetentionPolicy: z
      .object({ mode: z.number().int().min(0).max(2), retentionSeconds: int64.optional() })
      .strict()
      .optional(),
  })
  .strict();
const schedule = z
  .object({
    scheduleId: name,
    metadata: z
      .object({
        queueName: name,
        payload: payload.optional(),
        priority: priority.default('0'),
        cronSchedule: name.optional(),
        calendarSchedule: calendarSchema.optional(),
        hasMaxMessages: z.boolean().optional(),
        maxMessages: int64.optional(),
        leaseDuration: durationSchema.optional(),
        timezone: z.string().optional(),
        headers: headers.optional(),
      })
      .strict()
      .refine(
        (value) =>
          Number(value.cronSchedule !== undefined) +
            Number(value.calendarSchedule !== undefined) ===
          1,
        'exactly one schedule configuration required'
      ),
  })
  .strict();
const page = {
  pageSize: z.number().int().min(0).max(1000).optional(),
  pageToken: z.string().optional(),
};
const list = { prefix: z.string().optional(), ...page };
const queue = { queueName: name };
const messageId = { ...queue, messageId: name };
const owner = { ...messageId, workerId: name, attemptId: name };
const scheduleId = { scheduleId: name };
const schemaId = { schemaId: name, version: nonnegative.optional() };
const dlq = { dlqName: name };
const object = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
export const toolSchemas = {
  create_queue: object({ name, metadata: queueMetadata.optional() }),
  delete_queue: object({ name }),
  get_queue_state: object(queue),
  list_queues: object(list),
  post_message: object({ ...queue, message }),
  post_messages_bulk: object({
    ...queue,
    messages: z.array(bulkMessage).min(1).max(1000),
    transactionMode: z.union([z.literal(0), z.literal(1)]).optional(),
  }),
  get_next_message: object({
    ...queue,
    leaseDuration: durationSchema.optional(),
    exclusivityKey: z.string().optional(),
    workerId: name.optional(),
    attemptId: name.optional(),
  }),
  acknowledge_message: object({ ...owner, state: z.union([z.literal(3), z.literal(5)]) }),
  cancel_message: object({ ...messageId, reason: z.string().optional() }),
  send_message_heartbeat: object(owner),
  renew_message_lease: object({ ...owner, leaseDuration: durationSchema.optional() }),
  peek_messages: object({
    ...queue,
    ...page,
    priorityRange: z
      .object({ min: priority, max: priority })
      .strict()
      .refine((value) => Number(value.min) <= Number(value.max), 'priority range is reversed')
      .optional(),
  }),
  create_schedule: object({ schedule }),
  get_schedule: object(scheduleId),
  delete_schedule: object(scheduleId),
  pause_schedule: object(scheduleId),
  resume_schedule: object(scheduleId),
  list_schedules: object(list),
  get_schedule_history: object({ ...scheduleId, ...page }),
  validate_calendar_schedule: object({ calendarSchedule: calendarSchema }),
  preview_calendar_schedule: object({
    calendarSchedule: calendarSchema,
    count: nonnegative.optional(),
  }),
  get_dlq_messages: object({ ...dlq, ...page }),
  requeue_from_dlq: object({ ...dlq, messageId: name, targetQueue: name }),
  delete_from_dlq: object({ ...dlq, messageId: name }),
  purge_dlq: object(dlq),
  get_dlq_stats: object(dlq),
  register_schema: object({
    schemaId: name,
    name,
    content: name,
    description: z.string().optional(),
    contentType: z.literal('json-schema').optional(),
    metadata: z.record(z.string()).optional(),
  }),
  get_schema: object(schemaId),
  delete_schema: object(schemaId),
  list_schemas: object({ ...list, activeOnly: z.boolean().optional() }),
  validate_payload: object({ ...schemaId, payload: json }),
};
export type ToolName = keyof typeof toolSchemas;
export function validateToolInput(name: ToolName, input: unknown): any {
  return toolSchemas[name].parse(input);
}
