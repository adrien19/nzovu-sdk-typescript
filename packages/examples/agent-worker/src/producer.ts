/**
 * Task Producer
 *
 * Demonstrates how to post agent tasks to Nzovu.
 * Tasks are consumed and executed by agent workers.
 */

import { NzovuClient } from "@nzovu/client";
import { Message } from "@nzovu/proto";
import {
  TaskType,
  type AgentTaskPayload,
  type HttpRequestTask,
  type NotificationTask,
  type ShellCommandTask,
} from "./types.js";

// Configuration
const NZOVU_ADDRESS = process.env.NZOVU_ADDRESS || "host.docker.internal:9000";
const QUEUE_NAME = process.env.QUEUE_NAME || "agent-tasks";

/**
 * Create a unique task ID
 */
function createTaskId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Post a task to Nzovu
 */
async function postTask(
  client: NzovuClient,
  task: AgentTaskPayload,
  priority: number = 5,
): Promise<void> {
  await client.messages.postMessage(QUEUE_NAME, {
    messageId: task.taskId,
    metadata: {
      payload: {
        data: task as unknown as Record<string, unknown>,
        metadata: {},
        contentType: "application/json",
        schemaId: "",
        schemaVersion: 0,
      },
      priority: String(priority * 10), // Scale 1-10 to 10-100
      maxAttempts: 3,
      state: Message.Message_Metadata_State.PENDING,
      attemptsLeft: 3,
      leaseExpiry: "",
      leaseRenewalCount: 0,
      priorityLevel: 0,
    },
  });

  console.log(`✓ Posted task: ${task.taskId} (priority: ${priority})`);
}

/**
 * Create sample tasks for demonstration
 */
function createSampleTasks(): AgentTaskPayload[] {
  const correlationId = `batch-${Date.now()}`;

  const shellTask: ShellCommandTask = {
    taskId: createTaskId("shell"),
    taskType: TaskType.SHELL_COMMAND,
    description: "List files in current directory",
    correlationId,
    createdAt: new Date().toISOString(),
    command: "ls",
    args: ["-la"],
    cwd: "/tmp",
  };

  const httpTask: HttpRequestTask = {
    taskId: createTaskId("http"),
    taskType: TaskType.HTTP_REQUEST,
    description: "Fetch example API data",
    correlationId,
    createdAt: new Date().toISOString(),
    url: "https://jsonplaceholder.typicode.com/posts/1",
    method: "GET",
    expectedStatus: [200],
  };

  const notificationTask: NotificationTask = {
    taskId: createTaskId("notify"),
    taskType: TaskType.NOTIFICATION,
    description: "Send task completion notification",
    correlationId,
    createdAt: new Date().toISOString(),
    channel: "console",
    recipient: "admin",
    subject: "Batch Complete",
    message: "All tasks in batch have been processed successfully.",
  };

  return [shellTask, httpTask, notificationTask];
}

/**
 * Main producer function
 */
async function main(): Promise<void> {
  console.log("🚀 Agent Task Producer");
  console.log(`   Server: ${NZOVU_ADDRESS}`);
  console.log(`   Queue: ${QUEUE_NAME}`);
  console.log("");

  // Connect to Nzovu
  const client = new NzovuClient({
    connection: {
      address: NZOVU_ADDRESS,
    },
  });

  try {
    // Connect to server
    await client.connect();

    // Ensure queue exists with proper configuration
    console.log("📋 Ensuring queue exists...");
    try {
      await client.queues.createQueue(QUEUE_NAME, {
        type: 0, // SIMPLE
        defaultMaxAttempts: 3,
        autoCreateDlq: true,
        deadLetterQueueName: `${QUEUE_NAME}-dlq`,
        leasePolicy: {
          baseLease: { seconds: "60", nanos: 0 },
          maxExtension: { seconds: "300", nanos: 0 },
          heartbeatTimeout: { seconds: "30", nanos: 0 },
          extendStep: { seconds: "30", nanos: 0 },
          maxRenewals: 5,
        },
      });
      console.log(`   ✓ Queue '${QUEUE_NAME}' created`);
    } catch (err: any) {
      // Check for already exists (code 6) or duplicate key error
      if (err.code === 6 || err.details?.includes("duplicate key")) {
        console.log(`   ✓ Queue '${QUEUE_NAME}' already exists`);
      } else {
        throw err;
      }
    }

    // Create and post sample tasks
    console.log("\n📤 Posting tasks...");
    const tasks = createSampleTasks();

    // Post with different priorities
    await postTask(client, tasks[0], 8); // Shell command - high priority
    await postTask(client, tasks[1], 5); // HTTP request - normal priority
    await postTask(client, tasks[2], 3); // Notification - lower priority

    // Get queue state
    console.log("\n📊 Queue state:");
    const state = await client.queues.getQueueState(QUEUE_NAME);
    console.log(`   Pending: ${state.stateCounts?.["PENDING"] || 0}`);
    console.log(`   Running: ${state.stateCounts?.["RUNNING"] || 0}`);

    console.log("\n✅ Tasks posted successfully!");
    console.log("   Run the worker to process them: pnpm start:worker");
  } finally {
    await client.disconnect();
  }
}

// Run if executed directly
main().catch((err) => {
  console.error("❌ Producer error:", err);
  process.exit(1);
});
