/**
 * LeasePolicy Configuration Example
 *
 * This example demonstrates how to use LeasePolicy at both queue and message levels.
 * LeasePolicy provides fine-grained control over message lease management and heartbeat behavior.
 */

import { NzovuClient, LeasePolicy, Message, Queue } from "@nzovu/client";

async function main() {
  const client = new NzovuClient({
    connection: {
      insecure: process.env.NZOVU_INSECURE === "true",
      apiKey: process.env.NZOVU_API_KEY,
      address: process.env.NZOVU_ADDRESS || "localhost:9000",
    },
  });
  await client.connect();

  // ========================================================================
  // Example 1: Queue-level LeasePolicy
  // ========================================================================
  // This defines the default lease behavior for all messages in the queue

  const queueLeasePolicy: LeasePolicy = {
    // baseLease: Initial lease duration when a worker gets a message
    baseLease: { seconds: "30", nanos: 0 },

    // maxExtension: Maximum additional time beyond baseLease that can be gained via heartbeats
    // Total possible lease time = baseLease + maxExtension (30s + 90s = 120s)
    maxExtension: { seconds: "90", nanos: 0 },

    // heartbeatTimeout: Maximum allowed gap between heartbeats
    // If worker doesn't send heartbeat within this window, lease may expire
    heartbeatTimeout: { seconds: "15", nanos: 0 },

    // extendStep: How much time each heartbeat adds to the lease
    // Each successful heartbeat extends the lease by this amount (up to maxExtension)
    extendStep: { seconds: "10", nanos: 0 },

    // maxRenewals: Maximum number of lease renewals (0 = unlimited)
    maxRenewals: 0,
  };

  try {
    await client.queues.createQueue(
      "lease-policy-demo",
      Queue.QueueMetadata.fromPartial({
        type: Queue.QueueType.SIMPLE,
        defaultMaxAttempts: 3,
        leaseDuration: { seconds: "30", nanos: 0 }, // Fallback for old behavior
        leasePolicy: queueLeasePolicy, // New lease policy
        autoCreateDlq: true,
        exclusivityKey: "",
        deadLetterQueueName: "",
        schemaId: "",
        schemaRequired: false,
        maxPayloadSize: 0,
        allowedContentTypes: [],
      }),
    );
    console.log("✓ Queue created with LeasePolicy configuration");
  } catch (err: any) {
    if (err?.message && /already exists/i.test(err.message)) {
      console.log("✓ Queue already exists");
    } else {
      throw err;
    }
  }

  // ========================================================================
  // Example 2: Message-level LeasePolicy Override
  // ========================================================================
  // Individual messages can override the queue's default LeasePolicy

  const urgentTaskLeasePolicy: LeasePolicy = {
    baseLease: { seconds: "60", nanos: 0 }, // Longer initial lease for complex tasks
    maxExtension: { seconds: "180", nanos: 0 }, // Can extend up to 3 minutes more
    heartbeatTimeout: { seconds: "20", nanos: 0 }, // More lenient heartbeat window
    extendStep: { seconds: "15", nanos: 0 }, // Larger extension per heartbeat
    maxRenewals: 0, // Unlimited renewals
  };

  await client.messages.postMessage(
    "lease-policy-demo",
    Message.Message.fromPartial({
      messageId: "urgent-task-1",
      metadata: {
        payload: {
          data: { taskType: "complex-computation", priority: "urgent" },
          metadata: {},
          contentType: "application/json",
          schemaId: "",
          schemaVersion: 0,
        },
        priority: "4",
        maxAttempts: 3,
        leasePolicy: urgentTaskLeasePolicy, // Override queue's default
      },
    }),
  );
  console.log("✓ Message posted with custom LeasePolicy override");

  // ========================================================================
  // Example 3: Message inheriting queue LeasePolicy
  // ========================================================================
  // If no message-level leasePolicy is specified, it inherits from the queue

  await client.messages.postMessage(
    "lease-policy-demo",
    Message.Message.fromPartial({
      messageId: "standard-task-1",
      metadata: {
        payload: {
          data: { taskType: "simple-task", priority: "normal" },
          metadata: {},
          contentType: "application/json",
          schemaId: "",
          schemaVersion: 0,
        },
        priority: "2",
        maxAttempts: 3,
        // No leasePolicy specified - inherits from queue
      },
    }),
  );
  console.log("✓ Message posted (inherits queue LeasePolicy)");

  // ========================================================================
  // Example 4: LeasePolicy Best Practices
  // ========================================================================
  console.log("\n📋 LeasePolicy Best Practices:\n");
  console.log("1. baseLease: Set to average task processing time");
  console.log("   - Quick tasks: 10-30s");
  console.log("   - Standard tasks: 30-60s");
  console.log("   - Long-running: 60-300s\n");

  console.log("2. maxExtension: Set to 2-3x baseLease for safety buffer");
  console.log("   - Allows tasks to handle unexpected delays");
  console.log("   - Prevents premature lease expiration\n");

  console.log("3. heartbeatTimeout: Set to baseLease / 2 or less");
  console.log("   - Ensures frequent heartbeat detection");
  console.log("   - Quick detection of worker failures\n");

  console.log("4. extendStep: Set to heartbeatTimeout / 2");
  console.log("   - Balance between overhead and lease extension");
  console.log("   - Each heartbeat meaningfully extends the lease\n");

  console.log("5. Use message-level overrides for:");
  console.log("   - High-priority urgent tasks needing more time");
  console.log("   - Complex computations with variable duration");
  console.log("   - Tasks with different heartbeat characteristics\n");

  await client.disconnect();
  console.log("✓ Client disconnected");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
