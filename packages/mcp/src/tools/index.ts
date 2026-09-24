import { QueueServiceTypes as R, NzovuClient } from '@nzovu/client';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { toolSchemas, ToolName } from './validation.js';

type Definition = {
  rpc: string;
  description: string;
  readOnly: boolean;
  destructive?: boolean;
  execute: (client: NzovuClient, args: any) => Promise<unknown>;
};
const success = async (operation: Promise<boolean>) => ({ success: await operation });
export const definitions: Record<ToolName, Definition> = {
  create_queue: {
    rpc: 'createQueue',
    description: 'Create a queue with optional metadata.',
    readOnly: false,
    execute: (c, a) =>
      success(c.queues.createQueue(a.name, R.CreateQueueRequest.fromJSON(a).metadata)),
  },
  delete_queue: {
    rpc: 'deleteQueue',
    description: 'Delete a queue.',
    readOnly: false,
    destructive: true,
    execute: (c, a) => success(c.queues.deleteQueue(a.name)),
  },
  get_queue_state: {
    rpc: 'getQueueState',
    description: 'Get queue counts and earliest deadline.',
    readOnly: true,
    execute: (c, a) => c.queues.getQueueState(a.queueName),
  },
  list_queues: {
    rpc: 'listQueues',
    description: 'Read one queue page and continuation token.',
    readOnly: true,
    execute: (c, a) => c.queues.listQueues(a),
  },
  post_message: {
    rpc: 'postMessage',
    description: 'Post a message. Priority 0–4, headers use base64 bytes.',
    readOnly: false,
    execute: (c, a) =>
      success(c.messages.postMessage(a.queueName, R.PostMessageRequest.fromJSON(a).message!)),
  },
  post_messages_bulk: {
    rpc: 'postMessagesBulk',
    description:
      'Post 1–1000 messages. Mode 0 atomic, 1 best effort. Returns all per-item results.',
    readOnly: false,
    execute: (c, a) =>
      c.messages.postMessagesBulk(
        a.queueName,
        R.PostMessagesBulkRequest.fromJSON(a).messages,
        a.transactionMode
      ),
  },
  get_next_message: {
    rpc: 'getNextMessage',
    description:
      'Acquire a message. Save the returned workerId/attemptId for ownership operations.',
    readOnly: false,
    execute: async (c, a) => {
      const result = await c.messages.getNextMessage(
        a.queueName,
        a.leaseDuration,
        a.exclusivityKey,
        false,
        1000,
        a.workerId,
        undefined,
        a.attemptId
      );
      return { message: result.message, workerId: result.workerId, attemptId: result.attemptId };
    },
  },
  acknowledge_message: {
    rpc: 'acknowledgeMessage',
    description: 'ACK the exact claim: state 3 COMPLETED or 5 ERRORED.',
    readOnly: false,
    destructive: true,
    execute: (c, a) =>
      success(
        c.messages.acknowledgeMessage(a.queueName, a.messageId, a.state, a.workerId, a.attemptId)
      ),
  },
  cancel_message: {
    rpc: 'cancelMessage',
    description: 'Cancel a message before processing.',
    readOnly: false,
    destructive: true,
    execute: (c, a) => success(c.messages.cancelMessage(a.queueName, a.messageId, a.reason)),
  },
  send_message_heartbeat: {
    rpc: 'sendMessageHeartBeat',
    description: 'Heartbeat the exact acquired claim.',
    readOnly: false,
    execute: (c, a) => c.messages.sendHeartbeat(a.queueName, a.messageId, a.workerId, a.attemptId),
  },
  renew_message_lease: {
    rpc: 'renewMessageLease',
    description: 'Extend the exact acquired claim.',
    readOnly: false,
    execute: (c, a) =>
      c.messages.renewMessageLease(
        a.queueName,
        a.messageId,
        a.leaseDuration,
        a.workerId,
        a.attemptId
      ),
  },
  peek_messages: {
    rpc: 'peekQueueMessages',
    description: 'Read one message page without acquiring leases.',
    readOnly: true,
    execute: (c, a) => c.messages.peekQueueMessages(a.queueName, a),
  },
  create_schedule: {
    rpc: 'createSchedule',
    description: 'Create a cron or calendar schedule.',
    readOnly: false,
    execute: (c, a) =>
      success(c.schedules.createSchedule(R.CreateScheduleRequest.fromJSON(a).schedule!)),
  },
  get_schedule: {
    rpc: 'getSchedule',
    description: 'Read complete schedule details.',
    readOnly: true,
    execute: async (c, a) => ({ schedule: await c.schedules.getSchedule(a.scheduleId) }),
  },
  delete_schedule: {
    rpc: 'deleteSchedule',
    description: 'Delete a schedule.',
    readOnly: false,
    destructive: true,
    execute: (c, a) => success(c.schedules.deleteSchedule(a.scheduleId)),
  },
  pause_schedule: {
    rpc: 'pauseSchedule',
    description: 'Pause a schedule.',
    readOnly: false,
    execute: (c, a) => success(c.schedules.pauseSchedule(a.scheduleId)),
  },
  resume_schedule: {
    rpc: 'resumeSchedule',
    description: 'Resume a paused schedule.',
    readOnly: false,
    execute: (c, a) => success(c.schedules.resumeSchedule(a.scheduleId)),
  },
  list_schedules: {
    rpc: 'listSchedules',
    description: 'Read one schedule page and continuation token.',
    readOnly: true,
    execute: (c, a) => c.schedules.listSchedules(a),
  },
  get_schedule_history: {
    rpc: 'getScheduleHistory',
    description: 'Read one durable execution-history page.',
    readOnly: true,
    execute: (c, a) => c.schedules.getScheduleHistory(a.scheduleId, a),
  },
  validate_calendar_schedule: {
    rpc: 'validateCalendarSchedule',
    description: 'Validate a calendar and return every issue.',
    readOnly: true,
    execute: (c, a) =>
      c.schedules.validateCalendarSchedule(
        R.ValidateCalendarScheduleRequest.fromJSON(a).calendarSchedule!
      ),
  },
  preview_calendar_schedule: {
    rpc: 'previewCalendarSchedule',
    description: 'Preview calendar executions with exact timestamps.',
    readOnly: true,
    execute: (c, a) =>
      c.schedules.previewCalendarSchedule(
        R.PreviewCalendarScheduleRequest.fromJSON(a).calendarSchedule!,
        a.count
      ),
  },
  get_dlq_messages: {
    rpc: 'getDlqMessages',
    description: 'Read one DLQ message page.',
    readOnly: true,
    execute: (c, a) => c.dlq.getDLQMessages(a.dlqName, a),
  },
  requeue_from_dlq: {
    rpc: 'requeueFromDlq',
    description: 'Move a DLQ message to the required destination queue.',
    readOnly: false,
    destructive: true,
    execute: (c, a) => success(c.dlq.requeueFromDLQ(a.dlqName, a.messageId, a.targetQueue)),
  },
  delete_from_dlq: {
    rpc: 'deleteFromDlq',
    description: 'Permanently delete a DLQ message.',
    readOnly: false,
    destructive: true,
    execute: (c, a) => success(c.dlq.deleteFromDLQ(a.dlqName, a.messageId)),
  },
  purge_dlq: {
    rpc: 'purgeDlq',
    description: 'Permanently purge every DLQ message.',
    readOnly: false,
    destructive: true,
    execute: (c, a) => success(c.dlq.purgeDLQ(a.dlqName)),
  },
  get_dlq_stats: {
    rpc: 'getDlqStats',
    description: 'Read exact DLQ counts and timestamps.',
    readOnly: true,
    execute: (c, a) => c.dlq.getDLQStats(a.dlqName),
  },
  register_schema: {
    rpc: 'registerSchema',
    description: 'Register a named JSON Schema version.',
    readOnly: false,
    execute: (c, a) => c.schemas.registerSchema(a.schemaId, a.content, a),
  },
  get_schema: {
    rpc: 'getSchema',
    description: 'Read a schema version; zero selects latest.',
    readOnly: true,
    execute: async (c, a) => ({ schema: await c.schemas.getSchema(a.schemaId, a.version) }),
  },
  delete_schema: {
    rpc: 'deleteSchema',
    description: 'Deactivate versions; zero selects all. Returns deactivation count.',
    readOnly: false,
    destructive: true,
    execute: (c, a) => c.schemas.deleteSchema(a.schemaId, a.version),
  },
  list_schemas: {
    rpc: 'listSchemas',
    description: 'Read one schema-family page, total family count and continuation token.',
    readOnly: true,
    execute: (c, a) => c.schemas.listSchemas(a),
  },
  validate_payload: {
    rpc: 'validatePayload',
    description: 'Validate JSON against a schema version and return every error.',
    readOnly: true,
    execute: (c, a) => c.schemas.validatePayload(a.schemaId, JSON.stringify(a.payload), a.version),
  },
};
export const allTools: Tool[] = (Object.keys(definitions) as ToolName[]).map((name) => ({
  name,
  description: definitions[name].description,
  inputSchema: toJsonSchemaCompat(toolSchemas[name], {
    target: 'jsonSchema7',
  }) as Tool['inputSchema'],
  annotations: {
    readOnlyHint: definitions[name].readOnly,
    destructiveHint: definitions[name].destructive ?? false,
    idempotentHint: definitions[name].readOnly,
    openWorldHint: true,
  },
}));
