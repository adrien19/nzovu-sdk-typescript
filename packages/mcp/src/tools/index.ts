/**
 * Tool registry - defines all available MCP tools for Nzovu
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

// Queue Management Tools
export const createQueueTool: Tool = {
  name: 'create_queue',
  description: 'Create a new Nzovu queue with specified configuration',
  inputSchema: {
    type: 'object',
    properties: {
      queue_name: {
        type: 'string',
        description: 'Name of the queue to create',
      },
      queue_type: {
        type: 'string',
        enum: ['simple', 'exclusive'],
        description: 'Queue type (default: simple)',
      },
      max_attempts: {
        type: 'number',
        description: 'Maximum dequeue attempts before moving to DLQ (default: 3)',
        default: 3,
      },
      auto_create_dlq: {
        type: 'boolean',
        description: 'Automatically create dead letter queue (default: true)',
        default: true,
      },
      dlq_name: {
        type: 'string',
        description: 'Custom dead letter queue name',
      },
      exclusivity_key: {
        type: 'string',
        description: 'Exclusivity key for exclusive queues (required for exclusive queue type)',
      },
      // LeasePolicy fields (preferred over legacy lease_duration)
      lease_policy: {
        type: 'object',
        description: 'Lease policy configuration for message processing timeouts',
        properties: {
          base_lease: {
            type: 'string',
            description: 'Initial lease duration (e.g., "30s", "5m"). Default: 30s',
          },
          max_extension: {
            type: 'string',
            description: 'Maximum additional time via heartbeats (e.g., "10m")',
          },
          heartbeat_timeout: {
            type: 'string',
            description:
              'Maximum gap between heartbeats (e.g., "10s"). If unset, heartbeat timeout disabled',
          },
          extend_step: {
            type: 'string',
            description: 'Time to extend lease per heartbeat (e.g., "5s")',
          },
          max_renewals: {
            type: 'number',
            description: 'Maximum lease renewals allowed. 0 = unlimited',
          },
        },
      },
      // MessageRetentionPolicy fields
      retention_policy: {
        type: 'object',
        description: 'Message retention policy after processing',
        properties: {
          mode: {
            type: 'string',
            enum: ['delete_immediately', 'retain_duration', 'retain_forever'],
            description:
              'Retention mode: delete_immediately (default), retain_duration, or retain_forever',
          },
          retention_seconds: {
            type: 'number',
            description:
              'Retention duration in seconds (for retain_duration mode). E.g., 2592000 for 30 days',
          },
        },
      },
      // Legacy field (deprecated, use lease_policy instead)
      lease_duration: {
        type: 'string',
        description:
          '[DEPRECATED: Use lease_policy.base_lease instead] Default message lease duration (e.g., "30s", "5m")',
      },
    },
    required: ['queue_name'],
  },
};

export const deleteQueueTool: Tool = {
  name: 'delete_queue',
  description: 'Delete an existing queue',
  inputSchema: {
    type: 'object',
    properties: {
      queue_name: {
        type: 'string',
        description: 'Name of the queue to delete',
      },
    },
    required: ['queue_name'],
  },
};

export const listQueuesTool: Tool = {
  name: 'list_queues',
  description: 'List all queues in the system',
  inputSchema: {
    type: 'object',
    properties: {
      prefix: {
        type: 'string',
        description: 'Filter queues by name prefix',
      },
    },
  },
};

export const getQueueStateTool: Tool = {
  name: 'get_queue_state',
  description: 'Get current state and statistics for a queue',
  inputSchema: {
    type: 'object',
    properties: {
      queue_name: {
        type: 'string',
        description: 'Name of the queue to inspect',
      },
    },
    required: ['queue_name'],
  },
};

// Message Operation Tools
export const postMessageTool: Tool = {
  name: 'post_message',
  description: 'Post a message to a queue',
  inputSchema: {
    type: 'object',
    properties: {
      queue_name: {
        type: 'string',
        description: 'Name of the queue',
      },
      message_id: {
        type: 'string',
        description: 'Unique message identifier',
      },
      payload: {
        type: 'object',
        description: 'Message payload as JSON object',
      },
      priority: {
        type: 'number',
        minimum: 1,
        maximum: 10,
        description: 'Message priority (1-10, default: 5)',
      },
      lease_duration: {
        type: 'string',
        description: 'Override default lease duration (e.g., "5m")',
      },
      schema_id: {
        type: 'string',
        description: 'Schema ID for validation (e.g., "user.profile.v1")',
      },
      schema_version: {
        type: 'number',
        description: 'Schema version number for validation',
      },
    },
    required: ['queue_name', 'message_id', 'payload'],
  },
};

export const postMessagesBulkTool: Tool = {
  name: 'post_messages_bulk',
  description:
    'Post multiple messages to a queue in bulk (up to 1000 messages). Supports two transaction modes: ALL_OR_NOTHING (default, atomic operation) or BEST_EFFORT (partial success allowed)',
  inputSchema: {
    type: 'object',
    properties: {
      queue_name: {
        type: 'string',
        description: 'Name of the queue',
      },
      messages: {
        type: 'array',
        description: 'Array of messages to post (1-1000 messages)',
        minItems: 1,
        maxItems: 1000,
        items: {
          type: 'object',
          properties: {
            message_id: {
              type: 'string',
              description: 'Unique message identifier',
            },
            payload: {
              type: 'object',
              description: 'Message payload as JSON object',
            },
            priority: {
              type: 'number',
              minimum: 1,
              maximum: 10,
              description: 'Message priority (1-10, default: 5)',
            },
            lease_duration: {
              type: 'string',
              description: 'Override default lease duration (e.g., "5m")',
            },
            schema_id: {
              type: 'string',
              description: 'Schema ID for validation (e.g., "user.profile.v1")',
            },
            schema_version: {
              type: 'number',
              description: 'Schema version number for validation',
            },
          },
          required: ['message_id', 'payload'],
        },
      },
      transaction_mode: {
        type: 'number',
        enum: [0, 1],
        description:
          'Transaction mode: 0 = ALL_OR_NOTHING (default, all succeed or all fail), 1 = BEST_EFFORT (partial success allowed)',
        default: 0,
      },
    },
    required: ['queue_name', 'messages'],
  },
};

export const getNextMessageTool: Tool = {
  name: 'get_next_message',
  description: 'Retrieve the next message from a queue for processing',
  inputSchema: {
    type: 'object',
    properties: {
      queue_name: {
        type: 'string',
        description: 'Name of the queue',
      },
      lease_duration: {
        type: 'string',
        description: 'Lease duration for the message (e.g., "30s", "5m"). Default: 30s',
      },
      exclusivity_key: {
        type: 'string',
        description: 'Exclusivity key for exclusive queues',
      },
      worker_id: {
        type: 'string',
        description: 'Optional stable identifier for the worker/consumer',
      },
    },
    required: ['queue_name'],
  },
};

export const peekMessagesTool: Tool = {
  name: 'peek_messages',
  description: 'Preview messages in a queue without consuming them',
  inputSchema: {
    type: 'object',
    properties: {
      queue_name: {
        type: 'string',
        description: 'Name of the queue',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of messages to peek (default: 10)',
      },
      priority_min: {
        type: 'number',
        description: 'Minimum priority filter (1-10)',
      },
      priority_max: {
        type: 'number',
        description: 'Maximum priority filter (1-10)',
      },
    },
    required: ['queue_name'],
  },
};

export const acknowledgeMessageTool: Tool = {
  name: 'acknowledge_message',
  description: 'Acknowledge message processing completion or failure',
  inputSchema: {
    type: 'object',
    properties: {
      queue_name: {
        type: 'string',
        description: 'Name of the queue',
      },
      message_id: {
        type: 'string',
        description: 'Message identifier',
      },
      status: {
        type: 'string',
        enum: ['completed', 'errored'],
        description: 'Processing status',
      },
      worker_id: {
        type: 'string',
        description: 'Worker ID that processed the message (from get_next_message)',
      },
      attempt_id: {
        type: 'string',
        description: 'Attempt ID for this processing attempt (from get_next_message)',
      },
    },
    required: ['queue_name', 'message_id', 'status'],
  },
};

export const renewMessageLeaseTool: Tool = {
  name: 'renew_message_lease',
  description: 'Extend the lease time for a message being processed',
  inputSchema: {
    type: 'object',
    properties: {
      queue_name: {
        type: 'string',
        description: 'Name of the queue',
      },
      message_id: {
        type: 'string',
        description: 'Message identifier',
      },
      worker_id: { type: 'string', description: 'Worker returned by message acquisition' },
      attempt_id: { type: 'string', description: 'Attempt returned by message acquisition' },
      lease_duration: {
        type: 'string',
        description: 'New lease duration (e.g., "5m")',
      },
    },
    required: ['queue_name', 'message_id', 'worker_id', 'attempt_id'],
  },
};

// Schedule Tools
export const createScheduleTool: Tool = {
  name: 'create_schedule',
  description: 'Create a scheduled task that posts messages automatically',
  inputSchema: {
    type: 'object',
    properties: {
      schedule_id: {
        type: 'string',
        description: 'Unique schedule identifier',
      },
      queue_name: {
        type: 'string',
        description: 'Target queue for scheduled messages',
      },
      schedule_type: {
        type: 'string',
        enum: ['cron', 'calendar'],
        description: 'Schedule type',
      },
      cron_expression: {
        type: 'string',
        description: 'Cron expression (required if schedule_type is cron)',
      },
      calendar_type: {
        type: 'string',
        enum: ['once', 'weekly', 'daily', 'business_days'],
        description: 'Calendar type (required if schedule_type is calendar)',
      },
      times_of_day: {
        type: 'array',
        items: { type: 'string' },
        description: 'Times of day in HH:MM format (for calendar schedules)',
      },
      days_of_week: {
        type: 'array',
        items: { type: 'number' },
        description: 'Days of week (1=Mon, 7=Sun) for weekly schedules',
      },
      payload: {
        type: 'object',
        description: 'Message payload to post',
      },
      priority: {
        type: 'number',
        description: 'Message priority (1-10)',
      },
      enabled: {
        type: 'boolean',
        description: 'Whether schedule is enabled (default: true)',
      },
    },
    required: ['schedule_id', 'queue_name', 'schedule_type', 'payload'],
  },
};

export const listSchedulesTool: Tool = {
  name: 'list_schedules',
  description: 'List all schedules in the system',
  inputSchema: {
    type: 'object',
    properties: {
      prefix: {
        type: 'string',
        description: 'Filter schedules by ID prefix',
      },
    },
  },
};

export const deleteScheduleTool: Tool = {
  name: 'delete_schedule',
  description: 'Delete a schedule',
  inputSchema: {
    type: 'object',
    properties: {
      schedule_id: {
        type: 'string',
        description: 'Schedule identifier to delete',
      },
    },
    required: ['schedule_id'],
  },
};

// Additional Message Operations
export const cancelMessageTool: Tool = {
  name: 'cancel_message',
  description: 'Cancel a message before processing',
  inputSchema: {
    type: 'object',
    properties: {
      queue_name: {
        type: 'string',
        description: 'Name of the queue',
      },
      message_id: {
        type: 'string',
        description: 'Message identifier to cancel',
      },
      reason: {
        type: 'string',
        description: 'Optional reason for cancellation (for audit/logging)',
      },
    },
    required: ['queue_name', 'message_id'],
  },
};

// Additional Schedule Operations
export const getScheduleTool: Tool = {
  name: 'get_schedule',
  description: 'Get details of a specific schedule',
  inputSchema: {
    type: 'object',
    properties: {
      schedule_id: {
        type: 'string',
        description: 'Schedule identifier',
      },
    },
    required: ['schedule_id'],
  },
};

export const pauseScheduleTool: Tool = {
  name: 'pause_schedule',
  description: 'Pause a running schedule',
  inputSchema: {
    type: 'object',
    properties: {
      schedule_id: {
        type: 'string',
        description: 'Schedule identifier to pause',
      },
    },
    required: ['schedule_id'],
  },
};

export const resumeScheduleTool: Tool = {
  name: 'resume_schedule',
  description: 'Resume a paused schedule',
  inputSchema: {
    type: 'object',
    properties: {
      schedule_id: {
        type: 'string',
        description: 'Schedule identifier to resume',
      },
    },
    required: ['schedule_id'],
  },
};

export const getScheduleHistoryTool: Tool = {
  name: 'get_schedule_history',
  description: 'Get execution history for a schedule',
  inputSchema: {
    type: 'object',
    properties: {
      schedule_id: {
        type: 'string',
        description: 'Schedule identifier',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of history entries to return',
      },
    },
    required: ['schedule_id'],
  },
};

// Dead Letter Queue Operations
export const getDLQMessagesTool: Tool = {
  name: 'get_dlq_messages',
  description: 'Get messages from a dead letter queue',
  inputSchema: {
    type: 'object',
    properties: {
      dlq_name: {
        type: 'string',
        description: 'Name of the dead letter queue',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of messages to retrieve (default: 10)',
      },
    },
    required: ['dlq_name'],
  },
};

export const requeueFromDLQTool: Tool = {
  name: 'requeue_from_dlq',
  description: 'Requeue a message from DLQ to an explicit target queue',
  inputSchema: {
    type: 'object',
    properties: {
      dlq_name: {
        type: 'string',
        description: 'Name of the dead letter queue',
      },
      message_id: {
        type: 'string',
        description: 'Message identifier to requeue',
      },
      target_queue: {
        type: 'string',
        description: 'Required destination queue name',
      },
    },
    required: ['dlq_name', 'message_id', 'target_queue'],
  },
};

export const deleteFromDLQTool: Tool = {
  name: 'delete_from_dlq',
  description: 'Permanently delete a message from a dead letter queue',
  inputSchema: {
    type: 'object',
    properties: {
      dlq_name: {
        type: 'string',
        description: 'Name of the dead letter queue',
      },
      message_id: {
        type: 'string',
        description: 'Message identifier to delete',
      },
    },
    required: ['dlq_name', 'message_id'],
  },
};

export const purgeDLQTool: Tool = {
  name: 'purge_dlq',
  description: 'Purge all messages from a dead letter queue',
  inputSchema: {
    type: 'object',
    properties: {
      dlq_name: {
        type: 'string',
        description: 'Name of the dead letter queue to purge',
      },
    },
    required: ['dlq_name'],
  },
};

export const getDLQStatsTool: Tool = {
  name: 'get_dlq_stats',
  description: 'Get statistics for a dead letter queue',
  inputSchema: {
    type: 'object',
    properties: {
      dlq_name: {
        type: 'string',
        description: 'Name of the dead letter queue',
      },
    },
    required: ['dlq_name'],
  },
};

// Additional Schema Operations
export const getSchemaTool: Tool = {
  name: 'get_schema',
  description: 'Get a specific schema version',
  inputSchema: {
    type: 'object',
    properties: {
      schema_id: {
        type: 'string',
        description: 'Schema identifier',
      },
      version: {
        type: 'number',
        description: 'Schema version (0 = latest)',
      },
    },
    required: ['schema_id'],
  },
};

export const listSchemasTool: Tool = {
  name: 'list_schemas',
  description: 'List all registered schemas',
  inputSchema: {
    type: 'object',
    properties: {
      prefix: {
        type: 'string',
        description: 'Filter by schema_id prefix',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 100)',
      },
      active_only: {
        type: 'boolean',
        description: 'Only return active schemas',
      },
    },
  },
};

export const deleteSchemaTool: Tool = {
  name: 'delete_schema',
  description: 'Delete a schema or specific version',
  inputSchema: {
    type: 'object',
    properties: {
      schema_id: {
        type: 'string',
        description: 'Schema identifier to delete',
      },
      version: {
        type: 'number',
        description: 'Schema version to delete (0 = delete all versions)',
      },
    },
    required: ['schema_id'],
  },
};

export const validatePayloadTool: Tool = {
  name: 'validate_payload',
  description: 'Validate a JSON payload against a schema',
  inputSchema: {
    type: 'object',
    properties: {
      schema_id: {
        type: 'string',
        description: 'Schema identifier to validate against',
      },
      version: {
        type: 'number',
        description: 'Schema version (0 = latest)',
      },
      payload: {
        type: 'string',
        description: 'JSON payload to validate',
      },
    },
    required: ['schema_id', 'payload'],
  },
};

// Schema Management Tools
export const registerSchemaTool: Tool = {
  name: 'register_schema',
  description: 'Register a JSON schema for message validation',
  inputSchema: {
    type: 'object',
    properties: {
      schema_id: {
        type: 'string',
        description: 'Unique schema identifier (e.g., "user.profile.v1")',
      },
      name: {
        type: 'string',
        description: 'Human-readable schema name',
      },
      description: {
        type: 'string',
        description: 'Schema description',
      },
      content: {
        type: 'string',
        description: 'JSON Schema content as a JSON string',
      },
      content_type: {
        type: 'string',
        description: 'Schema type (default: "json-schema")',
      },
    },
    required: ['schema_id', 'name', 'content'],
  },
};

// Export all tools
export const allTools: Tool[] = [
  // Queue management
  createQueueTool,
  deleteQueueTool,
  listQueuesTool,
  getQueueStateTool,
  // Message operations
  postMessageTool,
  postMessagesBulkTool,
  getNextMessageTool,
  peekMessagesTool,
  acknowledgeMessageTool,
  renewMessageLeaseTool,
  cancelMessageTool,
  // Scheduling
  createScheduleTool,
  listSchedulesTool,
  deleteScheduleTool,
  getScheduleTool,
  pauseScheduleTool,
  resumeScheduleTool,
  getScheduleHistoryTool,
  // Dead letter queue
  getDLQMessagesTool,
  requeueFromDLQTool,
  deleteFromDLQTool,
  purgeDLQTool,
  getDLQStatsTool,
  // Schema management
  registerSchemaTool,
  getSchemaTool,
  listSchemasTool,
  deleteSchemaTool,
  validatePayloadTool,
];
