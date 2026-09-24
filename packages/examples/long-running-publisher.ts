/**
 * Long-Running Task Publisher Example
 *
 * This example demonstrates how to configure queues and messages for long-running
 * tasks that need extended processing time via LeasePolicy.
 */

import {
  NzovuClient,
  LeasePolicy,
  Message,
  MessageRetentionPolicy_Mode,
  Queue,
} from "@nzovu/client";

async function main() {
  const client = new NzovuClient({
    connection: { address: "host.docker.internal:9000" },
  });
  await client.connect();

  console.log("📋 Creating queue with LeasePolicy for long-running tasks...\n");

  // Define LeasePolicy for long-running tasks
  // This allows tasks to run up to 4 minutes (240s total)
  const longRunningLeasePolicy: LeasePolicy = {
    baseLease: { seconds: "60", nanos: 0 }, // Initial 60s lease
    maxExtension: { seconds: "180", nanos: 0 }, // Can extend up to 180s more (240s total)
    heartbeatTimeout: { seconds: "30", nanos: 0 }, // Must heartbeat within 30s
    extendStep: { seconds: "15", nanos: 0 }, // Each heartbeat extends by 15s
    maxRenewals: 0, // Unlimited renewals
  };

  console.log("⚙️  LeasePolicy Configuration:");
  console.log(`   - Base Lease: ${longRunningLeasePolicy.baseLease?.seconds}s`);
  console.log(
    `   - Max Extension: ${longRunningLeasePolicy.maxExtension?.seconds}s`,
  );
  console.log(
    `   - Total Possible: ${Number(longRunningLeasePolicy.baseLease?.seconds) + Number(longRunningLeasePolicy.maxExtension?.seconds)}s`,
  );
  console.log(
    `   - Heartbeat Timeout: ${longRunningLeasePolicy.heartbeatTimeout?.seconds}s`,
  );
  console.log(
    `   - Extend Step: ${longRunningLeasePolicy.extendStep?.seconds}s\n`,
  );

  // Create queue with LeasePolicy
  try {
    await client.queues.createQueue("long-running-tasks", {
      type: Queue.QueueType.SIMPLE,
      defaultMaxAttempts: 3,
      leaseDuration: { seconds: "60", nanos: 0 }, // Backwards compatibility
      leasePolicy: longRunningLeasePolicy, // New lease policy
      autoCreateDlq: true,
      exclusivityKey: "",
      deadLetterQueueName: "long-running-tasks-dlq",
      maxPayloadSize: 0,
      schemaId: "",
      schemaRequired: false,
      allowedContentTypes: ["application/json"],
      messageRetentionPolicy: {
        mode: MessageRetentionPolicy_Mode.RETAIN_DURATION,
        retentionSeconds: (24 * 60 * 60).toString(), // Retain messages for 1 day
      },
    });
    console.log('✅ Queue "long-running-tasks" created successfully\n');
  } catch (err: any) {
    if (
      err?.message &&
      (/already exists/i.test(err.message) ||
        /duplicate key value violates unique constraint/.test(err.message))
    ) {
      console.log('ℹ️  Queue "long-running-tasks" already exists\n');
    } else {
      throw err;
    }
  }

  // create a random message id to avoid conflicts
  const messageId = `long-task-${Math.floor(Math.random() * 10000)}`;

  // Example 1: Task that uses queue defaults (fits within 240s)
  console.log("📤 Posting Task 1: Standard long-running task (90s)");
  await client.messages.postMessage("long-running-tasks", {
    messageId: messageId,
    metadata: {
      payload: {
        data: {
          taskType: "data-processing",
          estimatedSeconds: 90,
          description: "Process large dataset",
        },
        metadata: {},
        contentType: "application/json",
        schemaId: "",
        schemaVersion: 0,
      },
      priority: "50",
      maxAttempts: 3,
      // Uses queue-level LeasePolicy (no override)
      state: Message.Message_Metadata_State.PENDING,
      attemptsLeft: 3,
      leaseExpiry: "",
      leaseRenewalCount: 0,
      priorityLevel: 0,
    },
  });
  console.log("✅ Task 1 posted (uses queue LeasePolicy)\n");

  // Example 2: Very long task that needs extended lease (overrides queue policy)
  console.log("📤 Posting Task 2: Extended long-running task (180s)");

  const extendedLeasePolicy: LeasePolicy = {
    baseLease: { seconds: "90", nanos: 0 }, // Longer initial lease
    maxExtension: { seconds: "270", nanos: 0 }, // Can extend up to 270s more (360s = 6min total)
    heartbeatTimeout: { seconds: "40", nanos: 0 }, // More lenient timeout
    extendStep: { seconds: "20", nanos: 0 }, // Larger extension step
    maxRenewals: 0, // Unlimited renewals
  };

  await client.messages.postMessage("long-running-tasks", {
    messageId: `${messageId}-2`,
    metadata: {
      payload: {
        data: {
          taskType: "video-processing",
          estimatedSeconds: 180,
          description: "Transcode large video file",
        },
        metadata: {},
        contentType: "application/json",
        schemaId: "",
        schemaVersion: 0,
      },
      priority: "80",
      maxAttempts: 2,
      leasePolicy: extendedLeasePolicy, // Override with longer lease
      state: Message.Message_Metadata_State.PENDING,
      attemptsLeft: 2,
      leaseExpiry: "",
      leaseRenewalCount: 0,
      priorityLevel: 0,
    },
  });
  console.log("✅ Task 2 posted (uses custom extended LeasePolicy)\n");

  // Example 3: Quick task that doesn't need long lease (override with shorter)
  console.log("📤 Posting Task 3: Quick task (30s)");

  const quickLeasePolicy: LeasePolicy = {
    baseLease: { seconds: "30", nanos: 0 },
    maxExtension: { seconds: "45", nanos: 0 }, // Increased to 45s (75s total)
    heartbeatTimeout: { seconds: "20", nanos: 0 }, // Increased to 20s
    extendStep: { seconds: "15", nanos: 0 }, // Matches worker heartbeat interval
    maxRenewals: 0, // Unlimited renewals
  };

  await client.messages.postMessage("long-running-tasks", {
    messageId: `${messageId}-3`,
    metadata: {
      payload: {
        data: {
          taskType: "quick-check",
          estimatedSeconds: 30,
          description: "Quick validation task",
        },
        metadata: {},
        contentType: "application/json",
        schemaId: "",
        schemaVersion: 0,
      },
      priority: "30",
      maxAttempts: 3,
      leasePolicy: quickLeasePolicy, // Override with shorter lease
      state: Message.Message_Metadata_State.PENDING,
      attemptsLeft: 3,
      leaseExpiry: "",
      leaseRenewalCount: 0,
      priorityLevel: 0,
    },
  });
  console.log("✅ Task 3 posted (uses custom quick LeasePolicy)\n");

  console.log("📊 Summary:");
  console.log(
    "   - Task 1: 90s task with default queue LeasePolicy (240s max)",
  );
  console.log("   - Task 2: 180s task with extended LeasePolicy (360s max)");
  console.log("   - Task 3: 30s task with quick LeasePolicy (75s max)");
  console.log(
    "\n💡 Each task can be processed within its lease limits thanks to heartbeat extensions!",
  );

  await client.disconnect();
  console.log("\n✅ Publisher completed successfully");
}

main().catch((err) => {
  console.error("❌ Publisher error:", err);
  process.exit(1);
});
