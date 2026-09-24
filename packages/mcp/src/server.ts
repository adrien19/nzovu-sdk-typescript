import { VERSION } from './version.js';
/**
 * MCP Server Implementation for Nzovu
 *
 * Sets up the Model Context Protocol server using the modern McpServer API
 * with registerTool for each Nzovu operation.
 */

import { NzovuClient } from '@nzovu/client';
import * as grpc from '@grpc/grpc-js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFileSync } from 'fs';

import type { z } from 'zod';
import { loadConfig, parseDuration } from './config.js';
import { handleToolCall } from './tools/handlers.js';
import {
  acknowledgeMessageSchema,
  cancelMessageSchema,
  createQueueSchema,
  createScheduleSchema,
  deleteFromDLQSchema,
  deleteQueueSchema,
  deleteScheduleSchema,
  deleteSchemaSchema,
  getDLQMessagesSchema,
  getDLQStatsSchema,
  getNextMessageSchema,
  getQueueStateSchema,
  getScheduleHistorySchema,
  getScheduleSchema,
  getSchemaSchema,
  listQueuesSchema,
  listSchedulesSchema,
  listSchemasSchema,
  pauseScheduleSchema,
  peekMessagesSchema,
  postMessageSchema,
  postMessagesBulkSchema,
  purgeDLQSchema,
  registerSchemaInputSchema,
  renewMessageLeaseSchema,
  requeueFromDLQSchema,
  resumeScheduleSchema,
  validatePayloadSchema,
} from './tools/validation.js';

// Tool definitions with descriptions and Zod schemas
const TOOL_DEFINITIONS: Record<string, { description: string; schema: z.ZodSchema }> = {
  // Queue Management
  create_queue: {
    description: 'Create a new Nzovu queue with specified configuration',
    schema: createQueueSchema,
  },
  delete_queue: {
    description: 'Delete an existing queue',
    schema: deleteQueueSchema,
  },
  list_queues: {
    description: 'List all queues in the system',
    schema: listQueuesSchema,
  },
  get_queue_state: {
    description: 'Get current state and statistics for a queue',
    schema: getQueueStateSchema,
  },

  // Message Operations
  post_message: {
    description: 'Post a message to a queue',
    schema: postMessageSchema,
  },
  post_messages_bulk: {
    description: 'Post multiple messages to a queue in bulk (up to 1000 messages)',
    schema: postMessagesBulkSchema,
  },
  get_next_message: {
    description: 'Retrieve the next message from a queue for processing',
    schema: getNextMessageSchema,
  },
  peek_messages: {
    description: 'Preview messages in a queue without consuming them',
    schema: peekMessagesSchema,
  },
  acknowledge_message: {
    description: 'Acknowledge message processing completion or failure',
    schema: acknowledgeMessageSchema,
  },
  renew_message_lease: {
    description: 'Extend the lease time for a message being processed',
    schema: renewMessageLeaseSchema,
  },
  cancel_message: {
    description: 'Cancel a message before processing',
    schema: cancelMessageSchema,
  },

  // Scheduling
  create_schedule: {
    description: 'Create a scheduled task that posts messages automatically',
    schema: createScheduleSchema,
  },
  get_schedule: {
    description: 'Get details of a specific schedule',
    schema: getScheduleSchema,
  },
  list_schedules: {
    description: 'List all schedules in the system',
    schema: listSchedulesSchema,
  },
  delete_schedule: {
    description: 'Delete a schedule',
    schema: deleteScheduleSchema,
  },
  pause_schedule: {
    description: 'Pause a running schedule',
    schema: pauseScheduleSchema,
  },
  resume_schedule: {
    description: 'Resume a paused schedule',
    schema: resumeScheduleSchema,
  },
  get_schedule_history: {
    description: 'Get execution history for a schedule',
    schema: getScheduleHistorySchema,
  },

  // Dead Letter Queue
  get_dlq_messages: {
    description: 'Get messages from a dead letter queue',
    schema: getDLQMessagesSchema,
  },
  requeue_from_dlq: {
    description: 'Requeue a message from DLQ back to the original or target queue',
    schema: requeueFromDLQSchema,
  },
  delete_from_dlq: {
    description: 'Permanently delete a message from a dead letter queue',
    schema: deleteFromDLQSchema,
  },
  purge_dlq: {
    description: 'Purge all messages from a dead letter queue',
    schema: purgeDLQSchema,
  },
  get_dlq_stats: {
    description: 'Get statistics for a dead letter queue',
    schema: getDLQStatsSchema,
  },

  // Schema Management
  register_schema: {
    description: 'Register a JSON schema for message validation',
    schema: registerSchemaInputSchema,
  },
  get_schema: {
    description: 'Get a specific schema version',
    schema: getSchemaSchema,
  },
  list_schemas: {
    description: 'List all registered schemas',
    schema: listSchemasSchema,
  },
  delete_schema: {
    description: 'Delete a schema or specific version',
    schema: deleteSchemaSchema,
  },
  validate_payload: {
    description: 'Validate a JSON payload against a schema',
    schema: validatePayloadSchema,
  },
};

/**
 * Create and configure the MCP server using the modern McpServer API
 */
export async function createMCPServer(): Promise<McpServer> {
  const server = new McpServer(
    {
      name: 'nzovu-mcp',
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Load configuration
  const config = loadConfig();

  // Setup gRPC credentials
  let credentials: grpc.ChannelCredentials;
  if (config.insecure) {
    credentials = grpc.credentials.createInsecure();
  } else if (config.certPath && config.keyPath && config.caPath) {
    const cert = readFileSync(config.certPath);
    const key = readFileSync(config.keyPath);
    const ca = readFileSync(config.caPath);
    credentials = grpc.credentials.createSsl(ca, key, cert);
  } else {
    credentials = grpc.credentials.createSsl();
  }

  // Initialize Nzovu SDK client
  const nzovuClient = new NzovuClient({
    connection: {
      address: config.nzovuAddress,
      credentials,
      timeout: parseDuration(config.timeout),
    },
    requestTimeout: parseDuration(config.timeout),
  });

  // Connect to server
  await nzovuClient.connect();

  // Register all tools using the modern registerTool API
  for (const [toolName, toolDef] of Object.entries(TOOL_DEFINITIONS)) {
    server.registerTool(
      toolName,
      {
        description: toolDef.description,
        inputSchema: toolDef.schema,
      },
      async (args) => {
        try {
          const result = await handleToolCall(toolName, args, nzovuClient);
          return {
            content: [
              {
                type: 'text' as const,
                text: result,
              },
            ],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Tool execution error (${toolName}):`, errorMessage);

          return {
            content: [
              {
                type: 'text' as const,
                text: `❌ Error: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error('Received SIGINT, shutting down gracefully...');
    await nzovuClient.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('Received SIGTERM, shutting down gracefully...');
    await nzovuClient.disconnect();
    process.exit(0);
  });

  return server;
}
