/**
 * Bulk Message Posting Example
 *
 * This example demonstrates how to use the postMessagesBulk API to post
 * multiple messages to a Nzovu in a single operation.
 *
 * Features demonstrated:
 * - Posting messages in bulk with ALL_OR_NOTHING mode (atomic)
 * - Posting messages in bulk with BEST_EFFORT mode (partial success)
 * - Handling per-message results and error codes
 * - Batch size optimization
 */

import {
  Queue,
  BulkMessageErrorCode,
  NzovuClient,
  Message,
  MessagePostResult,
  TransactionMode,
} from "@nzovu/client";

async function main() {
  // Initialize client
  const client = new NzovuClient({
    connection: {
      insecure: process.env.NZOVU_INSECURE === "true",
      apiKey: process.env.NZOVU_API_KEY,
      address: process.env.NZOVU_ADDRESS || "localhost:9000",
    },
  });

  try {
    await client.connect();
    console.log("✓ Connected to Nzovu server\n");

    // Create a queue for testing
    const queueName = "bulk-demo-queue";
    await client.queues.createQueue(
      queueName,
      Queue.QueueMetadata.fromPartial({
        defaultMaxAttempts: 3,
        autoCreateDlq: true,
      }),
    );
    console.log(`✓ Created queue: ${queueName}\n`);

    // ========================================================================
    // Example 1: ALL_OR_NOTHING Mode (Atomic Operation)
    // ========================================================================
    console.log("=== Example 1: ALL_OR_NOTHING Mode ===\n");

    // Create messages for bulk posting
    const messages1: Message.Message[] = Array.from({ length: 10 }, (_, i) =>
      Message.Message.fromPartial({
        messageId: `order-${i + 1}`,
        metadata: {
          payload: {
            data: {
              orderId: i + 1,
              customerId: `cust-${Math.floor(i / 2)}`,
              amount: (i + 1) * 100,
              items: [`item-${i + 1}`],
            },
            contentType: "application/json",
            metadata: {},
            schemaId: "",
            schemaVersion: 0,
          },

          leaseDuration: { seconds: "30", nanos: 0 },

          priority: i % 2 === 0 ? "4" : "2", // Alternate priorities
          maxAttempts: 3,
        },
      }),
    );

    // Post with ALL_OR_NOTHING mode (default)
    console.log(
      `Posting ${messages1.length} messages with ALL_OR_NOTHING mode...`,
    );
    const response1 = await client.messages.postMessagesBulk(
      queueName,
      messages1,
      TransactionMode.ALL_OR_NOTHING,
    );

    console.log(`Success: ${response1.success}`);
    console.log(`Successful: ${response1.successfulCount}/${messages1.length}`);
    console.log(`Failed: ${response1.failedCount}/${messages1.length}\n`);

    if (response1.success) {
      console.log("✓ All messages posted successfully (atomic operation)\n");
    }

    // ========================================================================
    // Example 2: BEST_EFFORT Mode (Partial Success)
    // ========================================================================
    console.log("=== Example 2: BEST_EFFORT Mode ===\n");

    // Create messages including some duplicates to demonstrate partial failure
    const messages2: Message.Message[] = [
      // Valid new messages
      Message.Message.fromPartial({
        messageId: "payment-1",
        metadata: {
          payload: {
            data: { paymentId: 1, amount: 500 },
            contentType: "application/json",
            metadata: {},
            schemaId: "",
            schemaVersion: 0,
          },

          leaseDuration: { seconds: "60", nanos: 0 },

          priority: "3",
          maxAttempts: 3,
        },
      }),
      Message.Message.fromPartial({
        messageId: "payment-2",
        metadata: {
          payload: {
            data: { paymentId: 2, amount: 750 },
            contentType: "application/json",
            metadata: {},
            schemaId: "",
            schemaVersion: 0,
          },

          leaseDuration: { seconds: "60", nanos: 0 },

          priority: "3",
          maxAttempts: 3,
        },
      }),
      // Duplicate from previous batch (will fail)
      Message.Message.fromPartial({
        messageId: "order-1", // Duplicate!
        metadata: {
          payload: {
            data: { orderId: 999 },
            contentType: "application/json",
            metadata: {},
            schemaId: "",
            schemaVersion: 0,
          },

          leaseDuration: { seconds: "30", nanos: 0 },

          priority: "2",
          maxAttempts: 3,
        },
      }),
    ];

    console.log(
      `Posting ${messages2.length} messages with BEST_EFFORT mode...`,
    );
    const response2 = await client.messages.postMessagesBulk(
      queueName,
      messages2,
      TransactionMode.BEST_EFFORT,
    );

    console.log(`Success: ${response2.success}`);
    console.log(`Successful: ${response2.successfulCount}/${messages2.length}`);
    console.log(`Failed: ${response2.failedCount}/${messages2.length}\n`);

    // Analyze results
    if (response2.results) {
      console.log("Per-message results:");
      response2.results.forEach((result: MessagePostResult) => {
        if (result.success) {
          console.log(`  ✓ ${result.messageId}: SUCCESS`);
        } else {
          const errorName = getErrorCodeName(result.errorCode);
          console.log(
            `  ✗ ${result.messageId}: ${errorName} - ${result.error}`,
          );
        }
      });
      console.log();

      // Filter results by error code
      const duplicates = response2.results.filter(
        (r) => r.errorCode === BulkMessageErrorCode.DUPLICATE_MESSAGE_ID,
      );
      if (duplicates.length > 0) {
        console.log(`Found ${duplicates.length} duplicate message(s)`);
      }
    }

    // ========================================================================
    // Example 3: Large Batch (Optimal Size)
    // ========================================================================
    console.log("\n=== Example 3: Large Batch (100 messages) ===\n");

    const messages3: Message.Message[] = Array.from({ length: 100 }, (_, i) =>
      Message.Message.fromPartial({
        messageId: `batch-msg-${i + 1}`,
        metadata: {
          payload: {
            data: {
              batchId: "batch-001",
              sequence: i + 1,
              timestamp: new Date().toISOString(),
            },
            contentType: "application/json",
            metadata: {},
            schemaId: "",
            schemaVersion: 0,
          },

          leaseDuration: { seconds: "30", nanos: 0 },

          priority: "2",
          maxAttempts: 3,
        },
      }),
    );

    console.log(`Posting ${messages3.length} messages...`);
    const startTime = Date.now();
    const response3 = await client.messages.postMessagesBulk(
      queueName,
      messages3,
      TransactionMode.ALL_OR_NOTHING,
    );
    const elapsed = Date.now() - startTime;

    console.log(`✓ Completed in ${elapsed}ms`);
    console.log(
      `Throughput: ${Math.round(messages3.length / (elapsed / 1000))} messages/second`,
    );
    console.log(
      `Successful: ${response3.successfulCount}/${messages3.length}\n`,
    );

    // ========================================================================
    // Example 4: Error Handling Patterns
    // ========================================================================
    console.log("=== Example 4: Error Handling Patterns ===\n");

    const messages4: Message.Message[] = Array.from({ length: 5 }, (_, i) =>
      Message.Message.fromPartial({
        messageId: `error-test-${i + 1}`,
        metadata: {
          payload: {
            data: { testId: i + 1 },
            contentType: "application/json",
            metadata: {},
            schemaId: "",
            schemaVersion: 0,
          },

          leaseDuration: { seconds: "30", nanos: 0 },

          priority: "2",
          maxAttempts: 3,
        },
      }),
    );

    const response4 = await client.messages.postMessagesBulk(
      queueName,
      messages4,
      TransactionMode.BEST_EFFORT,
    );

    // Extract failed messages for retry
    const failedMessages =
      response4.results
        ?.filter(
          (r) =>
            !r.success && r.errorCode === BulkMessageErrorCode.INTERNAL_ERROR,
        )
        .map((r) => r.messageId) || [];

    if (failedMessages.length > 0) {
      console.log("Messages that need retry (INTERNAL_ERROR):");
      failedMessages.forEach((msgId) => console.log(`  - ${msgId}`));
      console.log("\n(In production, these would be queued for retry)\n");
    }

    // Extract non-retryable failures
    const permanentFailures =
      response4.results
        ?.filter(
          (r) =>
            !r.success && r.errorCode !== BulkMessageErrorCode.INTERNAL_ERROR,
        )
        .map((r) => ({
          id: r.messageId,
          error: getErrorCodeName(r.errorCode),
        })) || [];

    if (permanentFailures.length > 0) {
      console.log("Permanent failures (send to dead letter queue):");
      permanentFailures.forEach(({ id, error }) => {
        console.log(`  - ${id}: ${error}`);
      });
      console.log();
    }

    console.log("✓ Error handling example complete\n");

    // ========================================================================
    // Cleanup
    // ========================================================================
    console.log("=== Cleanup ===\n");
    await client.queues.deleteQueue(queueName);
    console.log(`✓ Deleted queue: ${queueName}`);
  } catch (error) {
    console.error("Error:", error);
    throw error;
  } finally {
    await client.disconnect();
    console.log("✓ Disconnected from server\n");
  }
}

// Helper function to convert error code to name
function getErrorCodeName(errorCode: number): string {
  const errorCodeNames: Record<number, string> = {
    [BulkMessageErrorCode.SUCCESS]: "SUCCESS",
    [BulkMessageErrorCode.VALIDATION_FAILED]: "VALIDATION_FAILED",
    [BulkMessageErrorCode.DUPLICATE_MESSAGE_ID]: "DUPLICATE_MESSAGE_ID",
    [BulkMessageErrorCode.SCHEMA_MISMATCH]: "SCHEMA_MISMATCH",
    [BulkMessageErrorCode.INTERNAL_ERROR]: "INTERNAL_ERROR",
    [BulkMessageErrorCode.QUEUE_NOT_FOUND]: "QUEUE_NOT_FOUND",
  };
  return errorCodeNames[errorCode] || "UNKNOWN";
}

// Run the example
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
