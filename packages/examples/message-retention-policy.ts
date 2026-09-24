/**
 * Message Retention Policy Example
 *
 * This example demonstrates how to configure message retention policies
 * for audit trails, compliance, and debugging purposes.
 */

import {
  NzovuClient,
  Message,
  MessageRetentionPolicy_Mode,
  Queue,
  type MessageRetentionPolicy,
} from "@nzovu/client";

async function main() {
  const client = new NzovuClient({
    connection: { address: "host.docker.internal:9000" },
  });
  await client.connect();

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║      Message Retention Policy Configuration Examples      ║");
  console.log(
    "╚═══════════════════════════════════════════════════════════╝\n",
  );

  // ========================================================================
  // Example 1: DELETE_IMMEDIATELY (Default Behavior)
  // ========================================================================
  console.log("📋 Example 1: DELETE_IMMEDIATELY - Ephemeral Queue\n");
  console.log("   Use case: Development, testing, temporary tasks");
  console.log("   Behavior: Messages deleted immediately after acknowledgment");
  console.log("   Storage: Minimal - no retention overhead\n");

  try {
    await client.queues.createQueue("ephemeral-tasks", {
      type: Queue.QueueType.SIMPLE,
      defaultMaxAttempts: 3,
      leaseDuration: { seconds: "30", nanos: 0 },
      autoCreateDlq: true,
      exclusivityKey: "",
      deadLetterQueueName: "ephemeral-tasks-dlq",
      maxPayloadSize: 0,
      schemaId: "",
      schemaRequired: false,
      allowedContentTypes: ["application/json"],
      // Default retention: DELETE_IMMEDIATELY (no need to specify)
      messageRetentionPolicy: {
        mode: MessageRetentionPolicy_Mode.DELETE_IMMEDIATELY,
        retentionSeconds: "0", // Ignored for DELETE_IMMEDIATELY
      },
    });
    console.log('✅ Queue "ephemeral-tasks" created (DELETE_IMMEDIATELY)\n');
  } catch (err: any) {
    if (err?.message && /already exists/i.test(err.message)) {
      console.log('ℹ️  Queue "ephemeral-tasks" already exists\n');
    } else {
      throw err;
    }
  }

  // Post a sample message
  await client.messages.postMessage("ephemeral-tasks", {
    messageId: `ephemeral-${Date.now()}`,
    metadata: {
      payload: {
        data: { task: "temporary-calculation", value: 42 },
        metadata: {},
        contentType: "application/json",
        schemaId: "",
        schemaVersion: 0,
      },
      priority: "50",
      maxAttempts: 3,
      state: Message.Message_Metadata_State.PENDING,
      attemptsLeft: 3,
      leaseExpiry: "",
      leaseRenewalCount: 0,
      priorityLevel: 0,
    },
  });
  console.log(
    "📤 Posted ephemeral message (will be deleted after processing)\n",
  );

  // ========================================================================
  // Example 2: RETAIN_DURATION - Audit Trail (30 days)
  // ========================================================================
  console.log("📋 Example 2: RETAIN_DURATION - Audit Trail Queue\n");
  console.log(
    "   Use case: Compliance, debugging, temporary audit requirements",
  );
  console.log("   Behavior: Messages retained for 30 days after completion");
  console.log(
    "   Storage: Moderate - automatic cleanup after retention period\n",
  );

  const thirtyDaysInSeconds = 30 * 24 * 60 * 60; // 2,592,000 seconds

  const auditRetentionPolicy: MessageRetentionPolicy = {
    mode: MessageRetentionPolicy_Mode.RETAIN_DURATION,
    retentionSeconds: thirtyDaysInSeconds.toString(),
  };

  try {
    await client.queues.createQueue("order-processing", {
      type: Queue.QueueType.SIMPLE,
      defaultMaxAttempts: 3,
      leaseDuration: { seconds: "120", nanos: 0 },
      autoCreateDlq: true,
      exclusivityKey: "",
      deadLetterQueueName: "order-processing-dlq",
      maxPayloadSize: 0,
      schemaId: "",
      schemaRequired: false,
      allowedContentTypes: ["application/json"],
      messageRetentionPolicy: auditRetentionPolicy,
    });
    console.log('✅ Queue "order-processing" created (30-day retention)\n');
  } catch (err: any) {
    if (err?.message && /already exists/i.test(err.message)) {
      console.log('ℹ️  Queue "order-processing" already exists\n');
    } else {
      throw err;
    }
  }

  // Post a sample order message
  await client.messages.postMessage("order-processing", {
    messageId: `order-${Date.now()}`,
    metadata: {
      payload: {
        data: {
          orderId: "ORD-12345",
          customerId: "CUST-789",
          amount: 299.99,
          items: ["Product A", "Product B"],
        },
        metadata: { correlationId: "trace-xyz-123" },
        contentType: "application/json",
        schemaId: "",
        schemaVersion: 0,
      },
      priority: "100",
      maxAttempts: 3,
      state: Message.Message_Metadata_State.PENDING,
      attemptsLeft: 3,
      leaseExpiry: "",
      leaseRenewalCount: 0,
      priorityLevel: 0,
    },
  });
  console.log(
    "📤 Posted order message (retained for 30 days after completion)\n",
  );

  // ========================================================================
  // Example 3: RETAIN_DURATION - Short-term Debugging (7 days)
  // ========================================================================
  console.log("📋 Example 3: RETAIN_DURATION - Debug Queue (7 days)\n");
  console.log("   Use case: Troubleshooting, recent history analysis");
  console.log("   Behavior: Messages retained for 7 days");
  console.log("   Storage: Lower overhead than long-term retention\n");

  const sevenDaysInSeconds = 7 * 24 * 60 * 60; // 604,800 seconds

  const debugRetentionPolicy: MessageRetentionPolicy = {
    mode: MessageRetentionPolicy_Mode.RETAIN_DURATION,
    retentionSeconds: sevenDaysInSeconds.toString(),
  };

  try {
    await client.queues.createQueue("webhook-deliveries", {
      type: Queue.QueueType.SIMPLE,
      defaultMaxAttempts: 5,
      leaseDuration: { seconds: "60", nanos: 0 },
      autoCreateDlq: true,
      exclusivityKey: "",
      deadLetterQueueName: "webhook-deliveries-dlq",
      maxPayloadSize: 0,
      schemaId: "",
      schemaRequired: false,
      allowedContentTypes: ["application/json"],
      messageRetentionPolicy: debugRetentionPolicy,
    });
    console.log('✅ Queue "webhook-deliveries" created (7-day retention)\n');
  } catch (err: any) {
    if (err?.message && /already exists/i.test(err.message)) {
      console.log('ℹ️  Queue "webhook-deliveries" already exists\n');
    } else {
      throw err;
    }
  }

  await client.messages.postMessage("webhook-deliveries", {
    messageId: `webhook-${Date.now()}`,
    metadata: {
      payload: {
        data: {
          url: "https://api.example.com/webhook",
          event: "order.created",
          payload: { orderId: "ORD-12345" },
        },
        metadata: {},
        contentType: "application/json",
        schemaId: "",
        schemaVersion: 0,
      },
      priority: "80",
      maxAttempts: 5,
      state: Message.Message_Metadata_State.PENDING,
      attemptsLeft: 5,
      leaseExpiry: "",
      leaseRenewalCount: 0,
      priorityLevel: 0,
    },
  });
  console.log("📤 Posted webhook message (retained for 7 days)\n");

  // ========================================================================
  // Example 4: RETAIN_FOREVER - Permanent Audit Trail
  // ========================================================================
  console.log("📋 Example 4: RETAIN_FOREVER - Compliance Queue\n");
  console.log(
    "   Use case: Financial transactions, legal compliance, event sourcing",
  );
  console.log("   Behavior: Messages never automatically deleted");
  console.log("   Storage: Grows indefinitely - manual cleanup required\n");

  const permanentRetentionPolicy: MessageRetentionPolicy = {
    mode: MessageRetentionPolicy_Mode.RETAIN_FOREVER,
    retentionSeconds: "0", // Ignored for RETAIN_FOREVER
  };

  try {
    await client.queues.createQueue("financial-transactions", {
      type: Queue.QueueType.SIMPLE,
      defaultMaxAttempts: 3,
      leaseDuration: { seconds: "300", nanos: 0 }, // 5 minutes
      autoCreateDlq: true,
      exclusivityKey: "",
      deadLetterQueueName: "financial-transactions-dlq",
      maxPayloadSize: 0,
      schemaId: "",
      schemaRequired: true, // Enforce schema for compliance
      allowedContentTypes: ["application/json"],
      messageRetentionPolicy: permanentRetentionPolicy,
    });
    console.log(
      '✅ Queue "financial-transactions" created (permanent retention)\n',
    );
  } catch (err: any) {
    if (err?.message && /already exists/i.test(err.message)) {
      console.log('ℹ️  Queue "financial-transactions" already exists\n');
    } else {
      throw err;
    }
  }

  await client.messages.postMessage("financial-transactions", {
    messageId: `txn-${Date.now()}`,
    metadata: {
      payload: {
        data: {
          transactionId: "TXN-99999",
          accountFrom: "ACC-12345",
          accountTo: "ACC-67890",
          amount: 10000.0,
          currency: "USD",
          timestamp: new Date().toISOString(),
        },
        metadata: { auditTrail: "required" },
        contentType: "application/json",
        schemaId: "",
        schemaVersion: 0,
      },
      priority: "200", // High priority for financial operations
      maxAttempts: 3,
      state: Message.Message_Metadata_State.PENDING,
      attemptsLeft: 3,
      leaseExpiry: "",
      leaseRenewalCount: 0,
      priorityLevel: 0,
    },
  });
  console.log("📤 Posted financial transaction (retained forever)\n");

  // ========================================================================
  // Summary and Best Practices
  // ========================================================================
  console.log("═══════════════════════════════════════════════════════════");
  console.log("📊 Retention Policy Summary\n");

  console.log("Queue                      | Mode              | Retention");
  console.log(
    "---------------------------|-------------------|------------------",
  );
  console.log("ephemeral-tasks            | DELETE_IMMEDIATELY| 0 (immediate)");
  console.log("order-processing           | RETAIN_DURATION   | 30 days");
  console.log("webhook-deliveries         | RETAIN_DURATION   | 7 days");
  console.log(
    "financial-transactions     | RETAIN_FOREVER    | ∞ (permanent)\n",
  );

  console.log("💡 Best Practices:\n");
  console.log("1. DELETE_IMMEDIATELY:");
  console.log("   ✓ Use for development and testing");
  console.log("   ✓ Use for temporary, non-critical workloads");
  console.log("   ✓ Minimizes storage costs\n");

  console.log("2. RETAIN_DURATION:");
  console.log("   ✓ Balance between audit requirements and storage");
  console.log(
    "   ✓ Common durations: 7 days (debug), 30 days (audit), 90 days (compliance)",
  );
  console.log("   ✓ Automatic cleanup after retention period\n");

  console.log("3. RETAIN_FOREVER:");
  console.log("   ✓ Critical business data (financial, legal)");
  console.log("   ✓ Event sourcing and audit trails");
  console.log("   ✓ Requires manual cleanup strategy\n");

  console.log("⚠️  Important Considerations:\n");
  console.log("   • Storage costs grow with retention duration");
  console.log("   • RETAIN_FOREVER requires monitoring and manual cleanup");
  console.log(
    "   • Consider data privacy laws (GDPR, CCPA) when retaining data",
  );
  console.log(
    "   • Retained messages can be queried for analysis and debugging\n",
  );

  await client.disconnect();
  console.log("✅ Retention policy examples completed!\n");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
