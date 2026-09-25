import { NzovuClient, LeasePolicy, Message, Queue } from "@nzovu/client";

async function main() {
  // Initialize the Nzovu client
  const client = new NzovuClient({
    connection: {
      insecure: process.env.NZOVU_INSECURE === "true",
      apiKey: process.env.NZOVU_API_KEY,
      address: process.env.NZOVU_ADDRESS || "localhost:9000",
    },
  });
  await client.connect();

  // Create the email-reminders queue if it doesn't exist
  try {
    // Define queue-level lease policy
    const queueLeasePolicy: LeasePolicy = {
      baseLease: { seconds: "30", nanos: 0 }, // Initial 30s lease
      maxExtension: { seconds: "90", nanos: 0 }, // Can extend up to 90s more (120s total)
      heartbeatTimeout: { seconds: "15", nanos: 0 }, // Must heartbeat within 15s
      extendStep: { seconds: "10", nanos: 0 }, // Each heartbeat extends by 10s
      maxRenewals: 0, // Unlimited renewals
    };

    await client.queues.createQueue(
      "email-reminders",
      Queue.QueueMetadata.fromPartial({
        type: Queue.QueueType.SIMPLE,
        defaultMaxAttempts: 3,
        leasePolicy: queueLeasePolicy, // New lease policy configuration
        autoCreateDlq: true,
        exclusivityKey: "",
        deadLetterQueueName: "",
        maxPayloadSize: 0,
        schemaId: "",
        schemaRequired: false,
        allowedContentTypes: ["application/json"],
      }),
    );
  } catch (err: any) {
    if (err && err.message && /already exists/i.test(err.message)) {
      console.log("Queue already exists, continuing...");
    } else {
      throw err;
    }
  }

  // Post a sample email reminder message
  // Message-level leasePolicy override (optional - inherits from queue if not set)
  const messageLeasePolicy: LeasePolicy = {
    baseLease: { seconds: "60", nanos: 0 }, // Override: longer 60s base lease for this message
    maxExtension: { seconds: "60", nanos: 0 }, // Can extend up to 60s more (120s total)
    heartbeatTimeout: { seconds: "20", nanos: 0 }, // More lenient heartbeat timeout
    extendStep: { seconds: "10", nanos: 0 }, // Each heartbeat extends by 10s
    maxRenewals: 0, // Unlimited renewals
  };

  await client.messages.postMessage(
    "email-reminders",
    Message.Message.fromPartial({
      messageId: "reminder",
      metadata: {
        payload: {
          data: {
            to: "user@example.com",
            subject: "Reminder: Meeting at 3PM",
            body: "Don't forget your meeting at 3PM today!",
          },
          metadata: {},
          contentType: "application/json",
          schemaId: "",
          schemaVersion: 0,
        },
        priority: "2",
        maxAttempts: 3,
        leasePolicy: messageLeasePolicy, // Per-message lease policy override
      },
    }),
  );

  await client.disconnect();
}

main().catch((err) => {
  console.error("Notification service error:", err);
  process.exit(1);
});
