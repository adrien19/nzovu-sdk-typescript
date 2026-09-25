/**
 * Long-Running Worker Example
 *
 * This example demonstrates how LeasePolicy enables workers to process tasks
 * that take longer than the initial base lease by extending via heartbeats.
 */

import { NzovuClient, Message } from "@nzovu/client";

async function processLongRunningTask(
  message: any,
  taskDurationSeconds: number,
) {
  console.log(`\n🔄 Starting long-running task: ${message.taskType}`);
  console.log(`📊 Estimated duration: ${taskDurationSeconds}s`);
  console.log("-----------------------------------");

  // Simulate a long-running task with progress updates
  const chunkSize = 10000; // 10 second chunks
  const totalChunks = Math.ceil((taskDurationSeconds * 1000) / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const progress = Math.min(((i + 1) / totalChunks) * 100, 100).toFixed(1);
    console.log(`⏳ Progress: ${progress}% (chunk ${i + 1}/${totalChunks})`);
    await new Promise((resolve) => setTimeout(resolve, chunkSize));
  }

  console.log("✅ Task completed successfully!");
  console.log("-----------------------------------\n");
}

async function main() {
  const client = new NzovuClient({
    connection: {
      insecure: process.env.NZOVU_INSECURE === "true",
      apiKey: process.env.NZOVU_API_KEY,
      address: process.env.NZOVU_ADDRESS || "localhost:9000",
    },
  });
  await client.connect();

  let running = true;

  // Graceful shutdown on SIGINT (Ctrl+C)
  const shutdown = async () => {
    console.log("\n🛑 Shutting down worker...");
    running = false;
    await client.disconnect();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  console.log("🚀 Long-running worker started");
  console.log("📋 LeasePolicy configuration:");
  console.log("   - baseLease: 60s (initial lease time)");
  console.log("   - maxExtension: 180s (can extend up to 3 minutes more)");
  console.log("   - heartbeatTimeout: 30s (must heartbeat within 30s)");
  console.log("   - extendStep: 15s (each heartbeat adds 15s)");
  console.log("   - Total possible: 240s (4 minutes)");
  console.log("   - Heartbeat interval: 15s (matches extendStep)\n");

  try {
    while (running) {
      const { message, workerId, attemptId, claim } =
        await client.messages.getNextMessage(
          "long-running-tasks",
          undefined, // Use LeasePolicy from queue/message
          undefined,
          true, // enableHeartbeat
          5000, // heartbeat every 5s (matches extendStep)
          "long-runner-1",
        );

      if (!message) {
        // No message available, wait and retry
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      console.log(`\n📨 Received message: ${message.messageId}`);
      console.log(`👤 Worker: ${workerId}, Attempt: ${attemptId}`);
      console.log(`⏰ Initial lease expiry: ${message.metadata?.leaseExpiry}`);

      let leaseExpired = false;

      try {
        const payload = message.metadata?.payload?.data;
        const taskDuration = payload?.estimatedSeconds || 90;

        // Process the long-running task
        // The heartbeat will automatically extend the lease as needed
        await processLongRunningTask(payload, taskDuration);

        // Check if lease expired during processing by checking if heartbeat was stopped
        const heartbeatContext =
          claim && client.messages.getHeartbeatHealth(claim);
        if (!heartbeatContext?.isActive) {
          leaseExpired = true;
          console.log(
            "⚠️  Lease expired during processing - skipping acknowledgment",
          );
        } else {
          // Acknowledge successful completion
          await client.messages.acknowledgeMessage(
            "long-running-tasks",
            message.messageId,
            Message.Message_Metadata_State.COMPLETED,
            workerId,
            attemptId,
          );
          console.log(`✅ Message ${message.messageId} completed successfully`);
        }
      } catch (err) {
        console.error(
          `❌ Failed to process message ${message.messageId}:`,
          err,
        );

        // Only try to acknowledge if lease hasn't expired
        if (!leaseExpired) {
          try {
            await client.messages.acknowledgeMessage(
              "long-running-tasks",
              message.messageId,
              Message.Message_Metadata_State.ERRORED,
              workerId,
              attemptId,
            );
          } catch (ackErr: any) {
            if (ackErr.code === "FAILED_PRECONDITION") {
              // FAILED_PRECONDITION
              console.warn(
                "⚠️  Could not acknowledge - message already in terminal state",
              );
            } else {
              throw ackErr;
            }
          }
        } else {
          console.log(
            "⚠️  Skipping error acknowledgment - lease already expired",
          );
        }
      } finally {
        // Always stop heartbeat when done
        if (claim) {
          client.messages.releaseClaim(claim);
          console.log("🔇 Heartbeat stopped");
        }
      }
    }
  } finally {
    await client.disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Worker error:", err);
  process.exit(1);
});
