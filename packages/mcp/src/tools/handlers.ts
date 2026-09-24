/**
 * Tool execution handlers
 *
 * Implements the actual logic for each MCP tool
 */

import { NzovuClient, Message, Queue, timestampToISOString } from '@nzovu/client';
import { parseDuration } from '../config.js';
import {
  AcknowledgeMessageInput,
  CancelMessageInput,
  CreateQueueInput,
  CreateScheduleInput,
  DeleteFromDLQInput,
  DeleteQueueInput,
  DeleteScheduleInput,
  DeleteSchemaInput,
  GetDLQMessagesInput,
  GetDLQStatsInput,
  GetNextMessageInput,
  GetQueueStateInput,
  GetScheduleHistoryInput,
  GetScheduleInput,
  GetSchemaInput,
  ListQueuesInput,
  ListSchedulesInput,
  ListSchemasInput,
  PauseScheduleInput,
  PeekMessagesInput,
  PostMessageInput,
  PostMessagesBulkInput,
  PurgeDLQInput,
  RegisterSchemaInput,
  RenewMessageLeaseInput,
  RequeueFromDLQInput,
  ResumeScheduleInput,
  ValidatePayloadInput,
  validateToolInput,
} from './validation.js';

/**
 * Route tool calls to appropriate handlers with input validation
 */
export async function handleToolCall(
  toolName: string,
  args: unknown,
  client: NzovuClient
): Promise<string> {
  switch (toolName) {
    // Queue Management
    case 'create_queue':
      return handleCreateQueue(validateToolInput<CreateQueueInput>(toolName, args), client);
    case 'delete_queue':
      return handleDeleteQueue(validateToolInput<DeleteQueueInput>(toolName, args), client);
    case 'list_queues':
      return handleListQueues(validateToolInput<ListQueuesInput>(toolName, args), client);
    case 'get_queue_state':
      return handleGetQueueState(validateToolInput<GetQueueStateInput>(toolName, args), client);

    // Message Operations
    case 'post_message':
      return handlePostMessage(validateToolInput<PostMessageInput>(toolName, args), client);
    case 'post_messages_bulk':
      return handlePostMessagesBulk(
        validateToolInput<PostMessagesBulkInput>(toolName, args),
        client
      );
    case 'get_next_message':
      return handleGetNextMessage(validateToolInput<GetNextMessageInput>(toolName, args), client);
    case 'peek_messages':
      return handlePeekMessages(validateToolInput<PeekMessagesInput>(toolName, args), client);
    case 'acknowledge_message':
      return handleAcknowledgeMessage(
        validateToolInput<AcknowledgeMessageInput>(toolName, args),
        client
      );
    case 'renew_message_lease':
      return handleRenewMessageLease(
        validateToolInput<RenewMessageLeaseInput>(toolName, args),
        client
      );
    case 'cancel_message':
      return handleCancelMessage(validateToolInput<CancelMessageInput>(toolName, args), client);

    // Scheduling
    case 'create_schedule':
      return handleCreateSchedule(validateToolInput<CreateScheduleInput>(toolName, args), client);
    case 'list_schedules':
      return handleListSchedules(validateToolInput<ListSchedulesInput>(toolName, args), client);
    case 'delete_schedule':
      return handleDeleteSchedule(validateToolInput<DeleteScheduleInput>(toolName, args), client);
    case 'get_schedule':
      return handleGetSchedule(validateToolInput<GetScheduleInput>(toolName, args), client);
    case 'pause_schedule':
      return handlePauseSchedule(validateToolInput<PauseScheduleInput>(toolName, args), client);
    case 'resume_schedule':
      return handleResumeSchedule(validateToolInput<ResumeScheduleInput>(toolName, args), client);
    case 'get_schedule_history':
      return handleGetScheduleHistory(
        validateToolInput<GetScheduleHistoryInput>(toolName, args),
        client
      );

    // Dead Letter Queue
    case 'get_dlq_messages':
      return handleGetDLQMessages(validateToolInput<GetDLQMessagesInput>(toolName, args), client);
    case 'requeue_from_dlq':
      return handleRequeueFromDLQ(validateToolInput<RequeueFromDLQInput>(toolName, args), client);
    case 'delete_from_dlq':
      return handleDeleteFromDLQ(validateToolInput<DeleteFromDLQInput>(toolName, args), client);
    case 'purge_dlq':
      return handlePurgeDLQ(validateToolInput<PurgeDLQInput>(toolName, args), client);
    case 'get_dlq_stats':
      return handleGetDLQStats(validateToolInput<GetDLQStatsInput>(toolName, args), client);

    // Schema Management
    case 'register_schema':
      return handleRegisterSchema(validateToolInput<RegisterSchemaInput>(toolName, args), client);
    case 'get_schema':
      return handleGetSchema(validateToolInput<GetSchemaInput>(toolName, args), client);
    case 'list_schemas':
      return handleListSchemas(validateToolInput<ListSchemasInput>(toolName, args), client);
    case 'delete_schema':
      return handleDeleteSchema(validateToolInput<DeleteSchemaInput>(toolName, args), client);
    case 'validate_payload':
      return handleValidatePayload(validateToolInput<ValidatePayloadInput>(toolName, args), client);

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// Queue Management Handlers

async function handleCreateQueue(args: CreateQueueInput, client: NzovuClient): Promise<string> {
  const queueName = args.queue_name || args.name;
  if (!queueName) {
    throw new Error('Queue name is required');
  }

  const queueType =
    args.queue_type === 'exclusive' ? Queue.QueueType.EXCLUSIVE : Queue.QueueType.SIMPLE;

  // Build LeasePolicy from args.lease_policy or fall back to legacy lease_duration
  let leasePolicy: any = undefined;
  if (args.lease_policy) {
    leasePolicy = {};
    if (args.lease_policy.base_lease) {
      const baseLeaseMs = parseDuration(args.lease_policy.base_lease);
      leasePolicy.baseLease = { seconds: Math.floor(baseLeaseMs / 1000).toString(), nanos: 0 };
    }
    if (args.lease_policy.max_extension) {
      const maxExtMs = parseDuration(args.lease_policy.max_extension);
      leasePolicy.maxExtension = { seconds: Math.floor(maxExtMs / 1000).toString(), nanos: 0 };
    }
    if (args.lease_policy.heartbeat_timeout) {
      const hbTimeoutMs = parseDuration(args.lease_policy.heartbeat_timeout);
      leasePolicy.heartbeatTimeout = {
        seconds: Math.floor(hbTimeoutMs / 1000).toString(),
        nanos: 0,
      };
    }
    if (args.lease_policy.extend_step) {
      const extStepMs = parseDuration(args.lease_policy.extend_step);
      leasePolicy.extendStep = { seconds: Math.floor(extStepMs / 1000).toString(), nanos: 0 };
    }
    if (args.lease_policy.max_renewals !== undefined) {
      leasePolicy.maxRenewals = args.lease_policy.max_renewals;
    }
  }

  // Build MessageRetentionPolicy from args.retention_policy
  let messageRetentionPolicy: any = undefined;
  if (args.retention_policy) {
    const modeMap: Record<string, number> = {
      delete_immediately: 0,
      retain_duration: 1,
      retain_forever: 2,
    };
    messageRetentionPolicy = {
      mode: modeMap[args.retention_policy.mode] ?? 0,
      retentionSeconds: args.retention_policy.retention_seconds
        ? BigInt(args.retention_policy.retention_seconds).toString()
        : '0',
    };
  }

  // Legacy lease_duration support (deprecated)
  let leaseDuration: any = undefined;
  if (!leasePolicy && args.lease_duration) {
    const leaseDurationSeconds = Math.floor(parseDuration(args.lease_duration) / 1000);
    leaseDuration = { seconds: leaseDurationSeconds.toString(), nanos: 0 };
  }

  const metadata: Queue.QueueMetadata = {
    type: queueType,
    defaultMaxAttempts: args.max_attempts || 3,
    leaseDuration: leaseDuration,
    exclusivityKey: args.exclusivity_key || '',
    deadLetterQueueName: args.dlq_name || `${queueName}-dlq`,
    autoCreateDlq: args.auto_create_dlq !== false,
    schemaId: '',
    schemaRequired: false,
    maxPayloadSize: 0,
    allowedContentTypes: [],
    priorityConfig: undefined,
    leasePolicy: leasePolicy,
    messageRetentionPolicy: messageRetentionPolicy,
  };

  await client.queues.createQueue(queueName, metadata);

  // Build result message
  let result = `✓ Queue created successfully

Queue: ${queueName}
Type: ${args.queue_type || 'simple'}
Max Attempts: ${args.max_attempts || 3}
Auto-create DLQ: ${args.auto_create_dlq !== false ? 'Yes' : 'No'}`;

  if (args.exclusivity_key) {
    result += `\nExclusivity Key: ${args.exclusivity_key}`;
  }

  // Show lease policy info
  if (leasePolicy && args.lease_policy) {
    result += `\n\nLease Policy:`;
    if (args.lease_policy.base_lease) {
      result += `\n  Base Lease: ${args.lease_policy.base_lease}`;
    }
    if (args.lease_policy.max_extension) {
      result += `\n  Max Extension: ${args.lease_policy.max_extension}`;
    }
    if (args.lease_policy.heartbeat_timeout) {
      result += `\n  Heartbeat Timeout: ${args.lease_policy.heartbeat_timeout}`;
    }
    if (args.lease_policy.extend_step) {
      result += `\n  Extend Step: ${args.lease_policy.extend_step}`;
    }
    if (args.lease_policy.max_renewals !== undefined) {
      result += `\n  Max Renewals: ${args.lease_policy.max_renewals}`;
    }
  } else if (args.lease_duration) {
    result += `\nLease Duration: ${args.lease_duration} (legacy)`;
  }

  // Show retention policy info
  if (messageRetentionPolicy && args.retention_policy) {
    result += `\n\nRetention Policy:`;
    result += `\n  Mode: ${args.retention_policy.mode}`;
    if (
      args.retention_policy.mode === 'retain_duration' &&
      args.retention_policy.retention_seconds
    ) {
      result += `\n  Retention: ${args.retention_policy.retention_seconds}s`;
    }
  }

  return result;
}

async function handleDeleteQueue(args: DeleteQueueInput, client: NzovuClient): Promise<string> {
  await client.queues.deleteQueue(args.queue_name);
  return `✓ Queue '${args.queue_name}' deleted successfully`;
}

async function handleListQueues(args: ListQueuesInput, client: NzovuClient): Promise<string> {
  const prefix = args.prefix || '';
  const { queues } = await client.queues.listQueues({ prefix });

  if (queues.length === 0) {
    return prefix ? `No queues found with prefix '${prefix}'` : 'No queues found';
  }

  let result = `📋 Queues (${queues.length} total)${prefix ? ` matching '${prefix}'` : ''}\n\n`;
  for (const queue of queues) {
    const metadata = queue.metadata;
    const isExclusive = metadata?.type === Queue.QueueType.EXCLUSIVE;
    result += `• ${queue.name}\n`;
    result += `  Type: ${isExclusive ? 'Exclusive' : 'Simple'}\n`;

    // Show lease policy if available, otherwise fall back to legacy leaseDuration
    if (metadata?.leasePolicy?.baseLease) {
      result += `  Base Lease: ${metadata.leasePolicy.baseLease.seconds}s\n`;
      if (metadata.leasePolicy.maxExtension) {
        result += `  Max Extension: ${metadata.leasePolicy.maxExtension.seconds}s\n`;
      }
      if (metadata.leasePolicy.heartbeatTimeout) {
        result += `  Heartbeat Timeout: ${metadata.leasePolicy.heartbeatTimeout.seconds}s\n`;
      }
    } else if (metadata?.leaseDuration) {
      result += `  Lease: ${metadata.leaseDuration.seconds}s\n`;
    }

    result += `  Max Attempts: ${metadata?.defaultMaxAttempts || 3}\n`;

    // Show retention policy if configured
    if (metadata?.messageRetentionPolicy) {
      const modes = ['delete_immediately', 'retain_duration', 'retain_forever'];
      const mode = modes[metadata.messageRetentionPolicy.mode] || 'delete_immediately';
      result += `  Retention: ${mode}`;
      if (mode === 'retain_duration' && metadata.messageRetentionPolicy.retentionSeconds) {
        result += ` (${metadata.messageRetentionPolicy.retentionSeconds}s)`;
      }
      result += '\n';
    }

    if (metadata?.deadLetterQueueName) {
      result += `  DLQ: ${metadata.deadLetterQueueName}\n`;
    }
    result += '\n';
  }

  return result;
}

async function handleGetQueueState(args: GetQueueStateInput, client: NzovuClient): Promise<string> {
  const response = await client.queues.getQueueState(args.queue_name);
  const stateCounts = response.stateCounts || {};

  return `📊 Queue State: ${args.queue_name}

Messages:
  • Pending:   ${stateCounts['PENDING'] || 0}
  • Running:   ${stateCounts['RUNNING'] || 0}
  • Completed: ${stateCounts['COMPLETED'] || 0}
  • Errored:   ${stateCounts['ERRORED'] || 0}`;
}

// Message Operation Handlers

async function handlePostMessage(args: PostMessageInput, client: NzovuClient): Promise<string> {
  // Parse lease_duration from string (e.g., "5m") to seconds
  let leaseDurationSeconds = 30;
  if (args.lease_duration) {
    leaseDurationSeconds = Math.floor(parseDuration(args.lease_duration) / 1000);
  }

  // Convert payload to object if it's a string
  const payloadData = typeof args.payload === 'string' ? JSON.parse(args.payload) : args.payload;

  const message: Message.Message = {
    messageId: args.message_id,
    metadata: {
      payload: {
        data: payloadData as { [key: string]: any }, // Use object for schema validation
        contentType: 'application/json',
        metadata: {},
        schemaId: args.schema_id || '',
        schemaVersion: args.schema_version || 0,
      },
      headers: [],
      state: Message.Message_Metadata_State.PENDING,
      attemptsLeft: 3,
      leaseDuration: {
        seconds: leaseDurationSeconds.toString(),
        nanos: 0,
      },
      leaseExpiry: '',
      leaseRenewalCount: 0,
      priority: (args.priority || 5).toString(),
      maxAttempts: 3,
      scheduledTime: undefined,
      priorityLevel: args.priority || 5,
    },
  };

  await client.messages.postMessage(args.queue_name, message);

  return `✓ Message posted successfully

Queue: ${args.queue_name}
Message ID: ${args.message_id}
Priority: ${args.priority || 5}
${args.schema_id ? `Schema: ${args.schema_id}${args.schema_version ? ` v${args.schema_version}` : ''}` : ''}`;
}

async function handlePostMessagesBulk(
  args: PostMessagesBulkInput,
  client: NzovuClient
): Promise<string> {
  const queueName = args.queue_name;
  const messagesInput = args.messages;
  const transactionMode = args.transaction_mode || 0; // Default: ALL_OR_NOTHING

  if (!queueName) {
    throw new Error('queue_name is required');
  }

  if (!messagesInput || !Array.isArray(messagesInput)) {
    throw new Error('messages must be an array');
  }

  if (messagesInput.length === 0) {
    throw new Error('messages array cannot be empty');
  }

  if (messagesInput.length > 1000) {
    throw new Error(`Too many messages: ${messagesInput.length} (max 1000)`);
  }

  // Build Message objects from input
  const messages: Message.Message[] = messagesInput.map((msgInput: any) => {
    let leaseDurationSeconds = 30;
    if (msgInput.lease_duration) {
      leaseDurationSeconds = Math.floor(parseDuration(msgInput.lease_duration) / 1000);
    }

    return {
      messageId: msgInput.message_id,
      metadata: {
        payload: {
          data: msgInput.payload,
          contentType: 'application/json',
          metadata: {},
          schemaId: msgInput.schema_id || '',
          schemaVersion: msgInput.schema_version || 0,
        },
        headers: [],
        state: Message.Message_Metadata_State.PENDING,
        attemptsLeft: 3,
        leaseDuration: {
          seconds: leaseDurationSeconds.toString(),
          nanos: 0,
        },
        leaseExpiry: '',
        leaseRenewalCount: 0,
        priority: (msgInput.priority || 5).toString(),
        maxAttempts: 3,
        scheduledTime: undefined,
        priorityLevel: msgInput.priority || 5,
      },
    };
  });

  // Call the SDK method
  const response = await client.messages.postMessagesBulk(queueName, messages, transactionMode);

  // Format response
  const modeStr = transactionMode === 0 ? 'ALL_OR_NOTHING' : 'BEST_EFFORT';
  let output = `✓ Bulk message post completed

Queue: ${queueName}
Mode: ${modeStr}
Success: ${response.success}
Successful: ${response.successfulCount} / ${messagesInput.length}
Failed: ${response.failedCount} / ${messagesInput.length}
`;

  // Show failed messages if any
  if (response.failedCount > 0 && response.results) {
    output += '\nFailed Messages:\n';
    const failedResults = response.results.filter((r) => !r.success);
    failedResults.forEach((result) => {
      const errorCodeName = getErrorCodeName(result.errorCode);
      output += `  ✗ ${result.messageId}: ${errorCodeName} - ${result.error}\n`;
    });
  }

  // Show successful message IDs (limit to first 10 if many)
  if (response.successfulCount > 0 && response.results) {
    const successfulResults = response.results.filter((r) => r.success);
    const displayCount = Math.min(10, successfulResults.length);
    output += `\nSuccessful Messages (showing ${displayCount} of ${successfulResults.length}):\n`;
    successfulResults.slice(0, displayCount).forEach((result) => {
      output += `  ✓ ${result.messageId}\n`;
    });
    if (successfulResults.length > 10) {
      output += `  ... and ${successfulResults.length - 10} more\n`;
    }
  }

  return output;
}

// Helper function to convert error code enum to string
function getErrorCodeName(errorCode: number): string {
  const errorCodeNames: Record<number, string> = {
    0: 'SUCCESS',
    1: 'VALIDATION_FAILED',
    2: 'DUPLICATE_MESSAGE_ID',
    3: 'SCHEMA_MISMATCH',
    4: 'INTERNAL_ERROR',
    5: 'QUEUE_NOT_FOUND',
  };
  return errorCodeNames[errorCode] || 'UNKNOWN';
}

async function handleGetNextMessage(
  args: GetNextMessageInput,
  client: NzovuClient
): Promise<string> {
  // Parse lease_duration if provided
  let leaseDurationSeconds = 30;
  if (args.lease_duration) {
    leaseDurationSeconds = Math.floor(parseDuration(args.lease_duration) / 1000);
  }
  const leaseDuration = { seconds: leaseDurationSeconds.toString(), nanos: 0 };

  const response = await client.messages.getNextMessage(
    args.queue_name,
    leaseDuration,
    args.exclusivity_key,
    false, // No automatic heartbeat in MCP context
    1000,
    args.worker_id
  );

  if (!response || !response.message) {
    return `No messages available in queue '${args.queue_name}'`;
  }

  const { message, workerId, attemptId } = response;
  const metadata = message.metadata;

  // Extract payload data and metadata
  // The data field is already a google.protobuf.Struct (converted to JS object by protobuf library)
  const payloadData = metadata?.payload?.data || null;
  const payloadMetadata = metadata?.payload?.metadata || null;
  const contentType = metadata?.payload?.contentType || 'N/A';
  const schemaId = metadata?.payload?.schemaId;
  const schemaVersion = metadata?.payload?.schemaVersion;

  let result = `📨 Message Retrieved

Queue: ${args.queue_name}
Message ID: ${message.messageId}
Priority: ${metadata?.priority || 'N/A'}
Attempts Left: ${metadata?.attemptsLeft || 0}
Max Attempts: ${metadata?.maxAttempts || 0}
Worker ID: ${workerId || 'N/A'}
Attempt ID: ${attemptId || 'N/A'}
Lease Expiry: ${metadata?.leaseExpiry || 'N/A'}
Content Type: ${contentType}`;

  if (schemaId) {
    result += `\nSchema: ${schemaId}${schemaVersion ? ` v${schemaVersion}` : ''}`;
  }

  // Show payload data (the actual business data)
  if (payloadData) {
    result += `\n\nPayload Data:\n${JSON.stringify(payloadData, null, 2)}`;
  } else {
    result += '\n\nPayload Data: (empty)';
  }

  // Show payload metadata if present (custom key-value pairs for routing/filtering)
  if (payloadMetadata && Object.keys(payloadMetadata).length > 0) {
    result += `\n\nPayload Metadata:\n${JSON.stringify(payloadMetadata, null, 2)}`;
  }

  result += `\n\n⚠️  Remember to acknowledge this message after processing using:\n   acknowledge_message with worker_id: ${workerId || 'N/A'} and attempt_id: ${attemptId || 'N/A'}`;

  return result;
}

async function handlePeekMessages(args: PeekMessagesInput, client: NzovuClient): Promise<string> {
  const limit = args.limit || 10;
  const { messages } = await client.messages.peekQueueMessages(args.queue_name, {
    pageSize: limit,
  });

  if (messages.length === 0) {
    return `No messages in queue '${args.queue_name}'`;
  }

  let result = `👀 Peeking at ${messages.length} message(s) from '${args.queue_name}'\n\n`;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const metadata = message.metadata;

    // Extract payload data (google.protobuf.Struct already converted to JS object)
    const payloadData = metadata?.payload?.data || null;
    const contentType = metadata?.payload?.contentType || 'N/A';

    result += `${i + 1}. Message ID: ${message.messageId}\n`;
    result += `   Priority: ${metadata?.priority || 'N/A'}\n`;
    result += `   Attempts Left: ${metadata?.attemptsLeft || 0}\n`;
    result += `   Content Type: ${contentType}\n`;

    if (payloadData) {
      const payloadPreview = JSON.stringify(payloadData).substring(0, 100);
      result += `   Payload: ${payloadPreview}${payloadPreview.length >= 100 ? '...' : ''}\n\n`;
    } else {
      result += `   Payload: (empty)\n\n`;
    }
  }

  return result;
}

async function handleAcknowledgeMessage(
  args: AcknowledgeMessageInput,
  client: NzovuClient
): Promise<string> {
  const stateMap = {
    completed: Message.Message_Metadata_State.COMPLETED,
    errored: Message.Message_Metadata_State.ERRORED,
  };

  await client.messages.acknowledgeMessage(
    args.queue_name,
    args.message_id,
    stateMap[args.status as 'completed' | 'errored'] || Message.Message_Metadata_State.COMPLETED,
    args.worker_id,
    args.attempt_id
  );

  const statusEmoji = args.status === 'completed' ? '✅' : '❌';
  return `${statusEmoji} Message acknowledged as ${args.status}

Queue: ${args.queue_name}
Message ID: ${args.message_id}
Status: ${args.status}`;
}

async function handleRenewMessageLease(
  args: RenewMessageLeaseInput,
  client: NzovuClient
): Promise<string> {
  // Parse lease_duration from string to seconds if provided
  let leaseDurationSeconds: number | undefined;
  if (args.lease_duration) {
    leaseDurationSeconds = Math.floor(parseDuration(args.lease_duration) / 1000);
  }

  const duration = { seconds: (leaseDurationSeconds || 30).toString(), nanos: 0 };
  const response = await client.messages.renewMessageLease(
    args.queue_name,
    args.message_id,
    duration,
    args.worker_id,
    args.attempt_id
  );

  const remainingSeconds = response.remainingTime?.seconds
    ? parseInt(response.remainingTime.seconds, 10)
    : 0;
  return `✓ Message lease renewed

Queue: ${args.queue_name}
Message ID: ${args.message_id}
Remaining Time: ${remainingSeconds}s`;
}

// Schedule Handlers

async function handleCreateSchedule(
  args: CreateScheduleInput,
  client: NzovuClient
): Promise<string> {
  if (!args.schedule_type) {
    throw new Error('schedule_type is required');
  }

  // Build metadata object
  const metadata: any = {
    payload: {
      metadata: {},
      data: args.payload, // Pass as object, not string
      contentType: 'application/json',
      schemaId: '',
      schemaVersion: 0,
    },
    state: 0, // SCHEDULED
    queueName: args.queue_name,
    messageIds: [],
    headers: [],
    stateMessage: '',
    priority: String(args.priority || 5),
    hasMaxMessages: false,
    maxMessages: '0',
    timezone: args.timezone || 'UTC',
    nextRuns: [],
  };

  if (args.schedule_type === 'cron') {
    if (!args.cron_expression) {
      throw new Error('cron_expression is required for cron schedules');
    }
    metadata.cronSchedule = args.cron_expression;
  } else if (args.schedule_type === 'calendar') {
    if (!args.calendar_type || !args.times_of_day) {
      throw new Error('calendar_type and times_of_day are required for calendar schedules');
    }
    const rule: any = {
      executionTimes: args.times_of_day.map((time: string) => {
        const [hour, minute] = time.split(':').map(Number);
        return { hour, minute: minute || 0, second: 0 };
      }),
    };

    if (args.calendar_type === 'daily') {
      rule.daily = {
        dayInterval: 1,
        weekdaysOnly: false,
      };
    } else if (args.calendar_type === 'weekly' && args.days_of_week) {
      rule.weekly = {
        daysOfWeek: args.days_of_week,
        weekInterval: 1,
      };
    } else if (args.calendar_type === 'business_days') {
      rule.businessDays = {
        businessCalendarId: args.business_calendar_id || '',
        dayOffset: 0,
      };
    }

    metadata.calendarSchedule = {
      type:
        args.calendar_type === 'daily'
          ? 2
          : args.calendar_type === 'weekly'
            ? 1
            : args.calendar_type === 'business_days'
              ? 4
              : 2,
      rules: [rule],
      timezone: args.timezone || 'UTC',
      exceptions: [],
    };
  }

  // If enabled is false, set state to PAUSED (3)
  if (args.enabled === false) {
    metadata.state = 3;
  }

  const schedule = {
    scheduleId: args.schedule_id,
    metadata,
  };

  await client.schedules.createSchedule(schedule);

  let scheduleInfo = '';
  if (args.schedule_type === 'cron') {
    scheduleInfo = `Cron: ${args.cron_expression}`;
  } else {
    const times = args.times_of_day?.join(', ') || 'Not specified';
    scheduleInfo = `Calendar: ${args.calendar_type}, Times: ${times}`;
  }

  return `✓ Schedule created successfully

Schedule ID: ${args.schedule_id}
Queue: ${args.queue_name}
Type: ${args.schedule_type}
${scheduleInfo}
Enabled: ${args.enabled !== false ? 'Yes' : 'No'}`;
}

async function handleListSchedules(args: ListSchedulesInput, client: NzovuClient): Promise<string> {
  const prefix = args.prefix || '';
  const { schedules } = await client.schedules.listSchedules({ prefix });

  if (schedules.length === 0) {
    return prefix ? `No schedules found with prefix '${prefix}'` : 'No schedules found';
  }

  let result = `📅 Schedules (${schedules.length} total)${prefix ? ` matching '${prefix}'` : ''}\n\n`;

  for (const schedule of schedules) {
    const metadata = schedule.metadata;
    result += `• ${schedule.scheduleId}\n`;
    result += `  Queue: ${metadata?.queueName || 'N/A'}\n`;

    if (metadata?.cronSchedule) {
      result += `  Cron: ${metadata.cronSchedule}\n`;
    } else if (metadata?.calendarSchedule) {
      result += `  Calendar: Business schedule\n`;
    }

    result += `  State: ${metadata?.state || 'UNKNOWN'}\n`;
    result += `  Created: ${timestampToISOString(metadata?.createdAt) || 'N/A'}\n\n`;
  }

  return result;
}

async function handleDeleteSchedule(
  args: DeleteScheduleInput,
  client: NzovuClient
): Promise<string> {
  await client.schedules.deleteSchedule(args.schedule_id);
  return `✓ Schedule '${args.schedule_id}' deleted successfully`;
}

// Schema Management Handlers

async function handleRegisterSchema(
  args: RegisterSchemaInput,
  client: NzovuClient
): Promise<string> {
  const response = await client.schemas.registerSchema(args.schema_id, args.content, {
    name: args.name,
    description: args.description,
    contentType: args.content_type || 'json-schema',
    metadata: args.metadata || {},
  });

  return `✓ Schema registered successfully

Schema ID: ${response.schemaId}
Version: ${response.version}
Content Type: ${args.content_type || 'json-schema'}
Created: ${response.createdAt}`;
}

// Message Cancel Handler

async function handleCancelMessage(args: CancelMessageInput, client: NzovuClient): Promise<string> {
  await client.messages.cancelMessage(args.queue_name, args.message_id, args.reason || '');

  return `✓ Message cancelled successfully

Queue: ${args.queue_name}
Message ID: ${args.message_id}${args.reason ? `\nReason: ${args.reason}` : ''}`;
}

// Additional Schedule Handlers

async function handleGetSchedule(args: GetScheduleInput, client: NzovuClient): Promise<string> {
  const schedule = await client.schedules.getSchedule(args.schedule_id);

  if (!schedule) {
    return `Schedule '${args.schedule_id}' not found`;
  }

  const metadata = schedule.metadata;
  let result = `📅 Schedule: ${schedule.scheduleId}\n\n`;
  result += `Queue: ${metadata?.queueName || 'N/A'}\n`;
  result += `State: ${metadata?.state || 'UNKNOWN'}\n`;

  if (metadata?.cronSchedule) {
    result += `Type: Cron\n`;
    result += `Expression: ${metadata.cronSchedule}\n`;
  } else if (metadata?.calendarSchedule) {
    result += `Type: Calendar\n`;
    result += `Timezone: ${metadata.calendarSchedule.timezone || 'UTC'}\n`;
  }

  if (metadata?.nextRun) {
    result += `Next Run: ${timestampToISOString(metadata.nextRun)}\n`;
  }
  if (metadata?.lastRun) {
    result += `Last Run: ${timestampToISOString(metadata.lastRun)}\n`;
  }
  result += `Created: ${timestampToISOString(metadata?.createdAt) || 'N/A'}\n`;

  return result;
}

async function handlePauseSchedule(args: PauseScheduleInput, client: NzovuClient): Promise<string> {
  await client.schedules.pauseSchedule(args.schedule_id);
  return `✓ Schedule '${args.schedule_id}' paused successfully`;
}

async function handleResumeSchedule(
  args: ResumeScheduleInput,
  client: NzovuClient
): Promise<string> {
  await client.schedules.resumeSchedule(args.schedule_id);
  return `✓ Schedule '${args.schedule_id}' resumed successfully`;
}

async function handleGetScheduleHistory(
  args: GetScheduleHistoryInput,
  client: NzovuClient
): Promise<string> {
  const { scheduleHistory: history } = await client.schedules.getScheduleHistory(args.schedule_id, {
    pageSize: args.limit ?? 0,
  });

  if (!history) {
    return `No history found for schedule '${args.schedule_id}'`;
  }

  let result = `📅 Schedule History: ${history.scheduleId}\n\n`;
  result += `Messages Created: ${history.messages?.length || 0}\n`;

  if (history.nextRun) {
    result += `Next Run: ${timestampToISOString(history.nextRun)}\n`;
  }
  if (history.lastRun) {
    result += `Last Run: ${timestampToISOString(history.lastRun)}\n`;
  }
  if (history.createdAt) {
    result += `Created: ${timestampToISOString(history.createdAt)}\n`;
  }
  if (history.updatedAt) {
    result += `Updated: ${timestampToISOString(history.updatedAt)}\n`;
  }

  if (history.messages && history.messages.length > 0) {
    result += `\nRecent Messages:\n`;
    history.messages.slice(0, 10).forEach((msg, idx) => {
      result += `${idx + 1}. ${msg.messageId}\n`;
    });
    if (history.messages.length > 10) {
      result += `... and ${history.messages.length - 10} more\n`;
    }
  }

  return result;
}

// Dead Letter Queue Handlers

async function handleGetDLQMessages(
  args: GetDLQMessagesInput,
  client: NzovuClient
): Promise<string> {
  const { messages } = await client.dlq.getDLQMessages(args.dlq_name, {
    pageSize: args.limit ?? 0,
  });

  if (messages.length === 0) {
    return `No messages in DLQ '${args.dlq_name}'`;
  }

  let result = `📨 DLQ Messages from '${args.dlq_name}' (${messages.length} total)\n\n`;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const metadata = message.metadata;

    result += `${i + 1}. Message ID: ${message.messageId}\n`;
    result += `   Priority: ${metadata?.priority || 'N/A'}\n`;
    result += `   Attempts: ${(metadata?.maxAttempts || 0) - (metadata?.attemptsLeft || 0)}/${metadata?.maxAttempts || 0}\n`;

    if (metadata?.payload?.data) {
      try {
        const payloadData = JSON.parse(metadata.payload.data.toString());
        result += `   Payload: ${JSON.stringify(payloadData).substring(0, 100)}...\n`;
      } catch {
        result += `   Payload: ${metadata.payload.data.toString().substring(0, 100)}...\n`;
      }
    }
    result += '\n';
  }

  return result;
}

async function handleRequeueFromDLQ(
  args: RequeueFromDLQInput,
  client: NzovuClient
): Promise<string> {
  const messageIds = args.message_ids;

  const results = [];
  for (const messageId of messageIds) {
    try {
      await client.dlq.requeueFromDLQ(args.dlq_name, messageId, args.target_queue);
      results.push(`✓ ${messageId}`);
    } catch (err: any) {
      results.push(`✗ ${messageId}: ${err.message}`);
    }
  }

  return `📤 Requeue Results from DLQ '${args.dlq_name}'\n\n${results.join('\n')}${args.target_queue ? `\n\nTarget Queue: ${args.target_queue}` : ''}`;
}

async function handleDeleteFromDLQ(args: DeleteFromDLQInput, client: NzovuClient): Promise<string> {
  const messageIds = args.message_ids;

  const results = [];
  for (const messageId of messageIds) {
    try {
      await client.dlq.deleteFromDLQ(args.dlq_name, messageId);
      results.push(`✓ ${messageId}`);
    } catch (err: any) {
      results.push(`✗ ${messageId}: ${err.message}`);
    }
  }

  return `🗑️  Delete Results from DLQ '${args.dlq_name}'\n\n${results.join('\n')}`;
}

async function handlePurgeDLQ(args: PurgeDLQInput, client: NzovuClient): Promise<string> {
  await client.dlq.purgeDLQ(args.dlq_name);
  return `✓ DLQ '${args.dlq_name}' purged successfully\n\nAll messages have been removed from the Dead Letter Queue.`;
}

async function handleGetDLQStats(args: GetDLQStatsInput, client: NzovuClient): Promise<string> {
  const stats = await client.dlq.getDLQStats(args.dlq_name);

  return `📊 DLQ Statistics: ${stats.name}\n\nMessage Count: ${stats.messageCount}\nCreated: ${stats.createdAt}\nLast Updated: ${stats.updatedAt}`;
}

// Additional Schema Handlers

async function handleGetSchema(args: GetSchemaInput, client: NzovuClient): Promise<string> {
  const schema = await client.schemas.getSchema(args.schema_id, args.version);

  if (!schema) {
    return `Schema '${args.schema_id}'${args.version ? ` v${args.version}` : ''} not found`;
  }

  return `📋 Schema: ${schema.schemaId}

Version: ${schema.version}
Name: ${schema.name || 'N/A'}
Content Type: ${schema.contentType || 'json-schema'}
Description: ${schema.description || 'N/A'}

Content:
${(() => {
  try {
    return JSON.stringify(JSON.parse(schema.content), null, 2);
  } catch {
    return schema.content;
  }
})()}`;
}

async function handleListSchemas(args: ListSchemasInput, client: NzovuClient): Promise<string> {
  const { schemas } = await client.schemas.listSchemas({
    prefix: args.prefix,
    activeOnly: !args.include_all_versions,
  });

  if (!schemas || schemas.length === 0) {
    return args.prefix ? `No schemas found with prefix '${args.prefix}'` : 'No schemas found';
  }

  let result = `📋 Schemas (${schemas.length} total)${args.prefix ? ` matching '${args.prefix}'` : ''}\n\n`;

  for (const schema of schemas) {
    result += `• ${schema.schemaId} (v${schema.latestVersion})\n`;
    result += `  Name: ${schema.name || 'N/A'}\n`;
    result += `  Versions: ${schema.versionCount}\n`;
    if (schema.description) {
      result += `  Description: ${schema.description}\n`;
    }
    result += `  Active: ${schema.isActive ? 'Yes' : 'No'}\n`;
    result += '\n';
  }

  return result;
}

async function handleDeleteSchema(args: DeleteSchemaInput, client: NzovuClient): Promise<string> {
  await client.schemas.deleteSchema(args.schema_id, args.version);

  return `✓ Schema deleted successfully

Schema ID: ${args.schema_id}${args.version ? `\nVersion: ${args.version}` : '\nAll versions deleted'}`;
}

async function handleValidatePayload(
  args: ValidatePayloadInput,
  client: NzovuClient
): Promise<string> {
  const result = await client.schemas.validatePayload(
    args.schema_id,
    args.payload,
    args.version || 0
  );

  let output = `📋 Validation Result\n\nSchema: ${result.schemaId} (v${result.schemaVersion})\nValid: ${result.valid ? '✅ Yes' : '❌ No'}\n`;

  if (!result.valid && result.errors.length > 0) {
    output += `\nErrors (${result.errors.length}):\n`;
    result.errors.forEach((error, idx) => {
      output += `\n${idx + 1}. Field: ${error.field}\n`;
      output += `   Code: ${error.errorCode}\n`;
      output += `   Message: ${error.message}\n`;
      if (error.details && Object.keys(error.details).length > 0) {
        output += `   Details: ${JSON.stringify(error.details)}\n`;
      }
    });
  }

  return output;
}
