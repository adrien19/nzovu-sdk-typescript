import { NzovuClient, Message } from "@nzovu/client";

async function processEmail(message: any) {
  // Simulate sending an email
  console.log("Processing email message:", message);
  console.log("-----------------------------------");
  // Simulate async work - 90s processing time
  // This is within the LeasePolicy limits:
  // baseLease: 60s + maxExtension: 60s = 120s total possible
  await new Promise((resolve) => setTimeout(resolve, 90000));
  console.log("------------------------------------");

  console.log("Sending email to:", message.to);
  console.log("Subject:", message.subject);
  console.log("Body:", message.body);

  console.log("Email sent!");
}

async function main() {
  const client = new NzovuClient({
    connection: { address: "host.docker.internal:9000" },
  });
  await client.connect();

  let running = true;

  // Graceful shutdown on SIGINT (Ctrl+C)
  process.on("SIGINT", async () => {
    console.log("Shutting down worker...");
    running = false;
    await client.disconnect();
    process.exit(0);
  });

  try {
    while (running) {
      const { message, workerId, attemptId, stopHeartbeat } =
        await client.messages.getNextMessage(
          "email-reminders",
          undefined, // Use LeasePolicy from queue/message instead of fixed leaseDuration
          undefined,
          true, // enableHeartbeat
          10000, // heartbeat every 10s (matches LeasePolicy extendStep)
          "worker-1", // optional workerId for tracking
        );
      if (!message) {
        // No message available, wait and retry
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      console.log(
        `Processing message ${message.messageId} (worker: ${workerId}, attempt: ${attemptId})`,
      );
      console.log(`Initial lease expiry: ${message.metadata?.leaseExpiry}`);

      try {
        const payload = message.metadata?.payload?.data;
        await processEmail(payload);
        await client.messages.acknowledgeMessage(
          "email-reminders",
          message.messageId,
          Message.Message_Metadata_State.COMPLETED,
          workerId,
          attemptId,
        );
      } catch (err) {
        console.error("Failed to process message:", err);
        await client.messages.acknowledgeMessage(
          "email-reminders",
          message.messageId,
          Message.Message_Metadata_State.ERRORED,
          workerId,
          attemptId,
        );
      } finally {
        if (stopHeartbeat) stopHeartbeat();
      }
    }
  } finally {
    await client.disconnect();
  }
}

main().catch((err) => {
  console.error("Worker error:", err);
  process.exit(1);
});
