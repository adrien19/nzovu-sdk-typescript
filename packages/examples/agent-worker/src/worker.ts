/**
 * Agent Worker
 *
 * Consumes tasks from Nzovu and executes them using registered handlers.
 * Demonstrates:
 * - Message consumption with lease management
 * - Heartbeat for long-running tasks
 * - Graceful shutdown
 * - Error handling and acknowledgment
 */

import { NzovuClient, Message } from "@nzovu/client";
import { executeTask, type HandlerContext } from "./handlers.js";
import {
  TaskStatus,
  type AgentTaskPayload,
  type WorkerConfig,
  type WorkerStats,
} from "./types.js";

// Default configuration
const defaultConfig: WorkerConfig = {
  workerId: `worker-${process.pid}-${Date.now().toString(36)}`,
  queueName: process.env.QUEUE_NAME || "agent-tasks",
  serverAddress: process.env.NZOVU_ADDRESS || "host.docker.internal:9000",
  concurrency: 1,
  pollIntervalMs: 1000,
  enableHeartbeat: true,
  heartbeatIntervalMs: 10000,
  shutdownTimeoutMs: 30000,
};

/**
 * Agent Worker class
 */
class AgentWorker {
  private client: NzovuClient;
  private config: WorkerConfig;
  private stats: WorkerStats;
  private running = false;
  private shutdownRequested = false;
  private activeTaskCount = 0;

  constructor(config: Partial<WorkerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.client = new NzovuClient({
      connection: {
        address: this.config.serverAddress,
      },
      workerId: this.config.workerId,
    });
    this.stats = {
      workerId: this.config.workerId,
      startedAt: new Date().toISOString(),
      tasksProcessed: 0,
      tasksSucceeded: 0,
      tasksFailed: 0,
      currentTasks: 0,
      avgProcessingTimeMs: 0,
    };
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error("Worker is already running");
    }

    this.running = true;
    this.shutdownRequested = false;

    console.log("🤖 Agent Worker Starting");
    console.log(`   Worker ID: ${this.config.workerId}`);
    console.log(`   Server: ${this.config.serverAddress}`);
    console.log(`   Queue: ${this.config.queueName}`);
    console.log(`   Concurrency: ${this.config.concurrency}`);
    console.log(
      `   Heartbeat: ${this.config.enableHeartbeat ? "enabled" : "disabled"}`,
    );
    console.log("");

    // Connect to server
    await this.client.connect();

    // Setup graceful shutdown
    this.setupShutdownHandlers();

    // Start processing loop
    await this.processLoop();
  }

  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    console.log("\n🛑 Shutdown requested...");
    this.shutdownRequested = true;

    // Wait for active tasks to complete
    const startWait = Date.now();
    while (this.activeTaskCount > 0) {
      if (Date.now() - startWait > this.config.shutdownTimeoutMs) {
        console.log("⚠️  Shutdown timeout - forcing exit");
        break;
      }
      console.log(`   Waiting for ${this.activeTaskCount} active task(s)...`);
      await this.sleep(1000);
    }

    this.running = false;
    await this.client.disconnect();

    console.log("\n📊 Final Stats:");
    console.log(`   Tasks Processed: ${this.stats.tasksProcessed}`);
    console.log(`   Succeeded: ${this.stats.tasksSucceeded}`);
    console.log(`   Failed: ${this.stats.tasksFailed}`);
    console.log(
      `   Avg Processing Time: ${Math.round(this.stats.avgProcessingTimeMs)}ms`,
    );
    console.log("\n👋 Worker stopped");
  }

  /**
   * Main processing loop
   */
  private async processLoop(): Promise<void> {
    console.log("🔄 Starting message processing loop...\n");

    while (this.running && !this.shutdownRequested) {
      try {
        // Check concurrency limit
        if (this.activeTaskCount >= this.config.concurrency) {
          await this.sleep(100);
          continue;
        }

        // Get next message
        const result = await this.client.messages.getNextMessage(
          this.config.queueName,
          { seconds: "60", nanos: 0 }, // 60s lease
          undefined, // exclusivity_key
          this.config.enableHeartbeat, // autoHeartbeat
          this.config.heartbeatIntervalMs,
          this.config.workerId,
        );

        if (!result || !result.message) {
          // No messages available, wait before polling again
          await this.sleep(this.config.pollIntervalMs);
          continue;
        }

        // Ensure workerId and attemptId are available
        if (!result.workerId || !result.attemptId) {
          console.error("❌ Missing workerId or attemptId in message result");
          continue;
        }

        // Process the message (intentionally not awaited for concurrency)
        this.processMessage(
          result.message,
          result.workerId,
          result.attemptId,
        ).catch((err) => {
          console.error(`❌ Unhandled error processing message:`, err);
        });
      } catch (err: any) {
        console.error("❌ Error in processing loop:", err.message);
        await this.sleep(this.config.pollIntervalMs * 2);
      }
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(
    message: any,
    workerId: string,
    attemptId: string,
  ): Promise<void> {
    this.activeTaskCount++;
    this.stats.currentTasks = this.activeTaskCount;

    const messageId = message.messageId;
    const startTime = Date.now();

    try {
      console.log(`📥 Processing: ${messageId}`);

      // Extract task payload
      const payload = message.metadata?.payload?.data as AgentTaskPayload;
      if (!payload || !payload.taskType) {
        throw new Error("Invalid task payload: missing taskType");
      }

      console.log(`   Task Type: ${payload.taskType}`);
      console.log(`   Description: ${payload.description || "N/A"}`);

      // Create handler context
      const context: HandlerContext = {
        workerId,
        attemptId,
        sendHeartbeat: async () => {
          await this.client.messages.sendHeartbeat(
            this.config.queueName,
            messageId,
            workerId,
            attemptId,
          );
        },
        log: (msg: string) => console.log(`   [${messageId}] ${msg}`),
      };

      // Execute the task
      const result = await executeTask(payload, context);

      // Acknowledge based on result
      if (result.status === TaskStatus.COMPLETED) {
        await this.client.messages.acknowledgeMessage(
          this.config.queueName,
          messageId,
          Message.Message_Metadata_State.COMPLETED,
          workerId,
          attemptId,
        );
        console.log(`   ✓ Completed in ${result.durationMs}ms`);
        this.stats.tasksSucceeded++;
      } else {
        // Let the message return to queue for retry (don't ack with error)
        console.log(`   ✗ Failed: ${result.error?.message}`);
        this.stats.tasksFailed++;
      }

      // Update stats
      this.stats.tasksProcessed++;
      this.updateAvgProcessingTime(Date.now() - startTime);

      if (result.output) {
        console.log(
          `   Output: ${JSON.stringify(result.output).substring(0, 100)}...`,
        );
      }
    } catch (err: any) {
      console.error(`   ❌ Error: ${err.message}`);
      this.stats.tasksFailed++;
      this.stats.tasksProcessed++;
      // Message will return to queue when lease expires
    } finally {
      this.activeTaskCount--;
      this.stats.currentTasks = this.activeTaskCount;
      this.stats.lastTaskAt = new Date().toISOString();
      console.log("");
    }
  }

  /**
   * Update rolling average processing time
   */
  private updateAvgProcessingTime(durationMs: number): void {
    const n = this.stats.tasksProcessed;
    this.stats.avgProcessingTimeMs =
      (this.stats.avgProcessingTimeMs * (n - 1) + durationMs) / n;
  }

  /**
   * Setup shutdown signal handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = () => {
      this.stop().catch(console.error);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current stats
   */
  getStats(): WorkerStats {
    return { ...this.stats };
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const worker = new AgentWorker({
    concurrency: parseInt(process.env.CONCURRENCY || "1", 10),
  });

  await worker.start();
}

// Run if executed directly
main().catch((err) => {
  console.error("❌ Worker error:", err);
  process.exit(1);
});

export { AgentWorker };
