/**
 * Trip Planner Producer
 * Posts trip planning requests to Nzovu
 */

import { NzovuClient, Message, Queue } from "@nzovu/client";
import { PlanTripPayload, TaskType, TripRequest } from "./types";

const QUEUE_NAME = "trip-planning-requests";
const SERVER_ADDRESS = process.env.NZOVU_SERVER || "host.docker.internal:9000";

async function main() {
  console.log("🚀 Starting Trip Planner Producer...");
  console.log(`📡 Connecting to Nzovu at ${SERVER_ADDRESS}\n`);

  const client = new NzovuClient({
    connection: { address: SERVER_ADDRESS },
  });

  try {
    await client.connect();

    // Create queue if it doesn't exist
    await client.queues.createQueue(QUEUE_NAME, {
      type: Queue.QueueType.SIMPLE,
      defaultMaxAttempts: 3,
      autoCreateDlq: true,
      exclusivityKey: "",
      deadLetterQueueName: `${QUEUE_NAME}-dlq`,
      maxPayloadSize: 0,
      schemaId: "",
      schemaRequired: false,
      allowedContentTypes: ["application/json"],
      leasePolicy: {
        baseLease: { seconds: "300", nanos: 0 }, // 5-minute base lease
        maxExtension: { seconds: "1800", nanos: 0 }, // 30 minutes max extension
        heartbeatTimeout: { seconds: "60", nanos: 0 }, // Heartbeat every minute
        extendStep: { seconds: "10", nanos: 0 }, // Extend by 10s per heartbeat
        maxRenewals: 5, // Max 5 lease renewals
      },
      messageRetentionPolicy: {
        mode: Queue.MessageRetentionPolicy_Mode.RETAIN_DURATION,
        retentionSeconds: "172800", // 2 days for audit compliance
      },
    });
    console.log(`✅ Queue '${QUEUE_NAME}' ready\n`);

    // Sample trip requests
    const tripRequests: Array<{
      request: TripRequest;
      priority: number;
      id: string;
    }> = [
      {
        id: "trip-paris-001",
        priority: 10,
        request: {
          destination: "Paris, France",
          startDate: "2024-06-15",
          endDate: "2024-06-22",
          travelers: 2,
          budget: 5000,
          preferences: {
            activities: ["museums", "dining", "architecture"],
            accommodationType: "hotel",
            transportation: "flight",
          },
        },
      },
      {
        id: "trip-tokyo-002",
        priority: 8,
        request: {
          destination: "Tokyo, Japan",
          startDate: "2024-07-10",
          endDate: "2024-07-20",
          travelers: 1,
          budget: 4000,
          preferences: {
            activities: ["culture", "food", "technology"],
            accommodationType: "airbnb",
            transportation: "flight",
          },
        },
      },
      {
        id: "trip-nyc-003",
        priority: 6,
        request: {
          destination: "New York City, USA",
          startDate: "2024-08-05",
          endDate: "2024-08-12",
          travelers: 4,
          budget: 8000,
          preferences: {
            activities: ["broadway", "shopping", "sightseeing"],
            accommodationType: "hotel",
            transportation: "flight",
          },
        },
      },
    ];

    console.log("📤 Posting trip planning requests...\n");

    // Post each trip request to the queue
    for (const trip of tripRequests) {
      const payload: PlanTripPayload = {
        type: TaskType.PLAN_TRIP,
        request: trip.request,
      };

      const message: Message.Message = {
        messageId: trip.id,
        metadata: {
          payload: {
            data: payload as any,
            metadata: {},
            contentType: "application/json",
            schemaId: "",
            schemaVersion: 0,
          },
          priority: trip.priority.toString(),
          maxAttempts: 3,
          state: Message.Message_Metadata_State.PENDING,
          attemptsLeft: 3,
          leaseExpiry: "",
          leaseRenewalCount: 0,
          priorityLevel: trip.priority,
        },
      };

      await client.messages.postMessage(QUEUE_NAME, message);

      console.log(`✅ Posted: ${trip.id}`);
      console.log(`   Destination: ${trip.request.destination}`);
      console.log(`   Priority: ${trip.priority}`);
      console.log(`   Travelers: ${trip.request.travelers}`);
      console.log(`   Budget: $${trip.request.budget}`);
      console.log(
        `   Duration: ${trip.request.startDate} → ${trip.request.endDate}\n`,
      );
    }

    // Get queue statistics
    const stats = await client.queues.getQueueState(QUEUE_NAME);
    console.log("📊 Queue Statistics:");
    console.log(`   Pending: ${stats.stateCounts["pending"] || 0}`);
    console.log(`   Running: ${stats.stateCounts["running"] || 0}`);
    console.log(`   Completed: ${stats.stateCounts["completed"] || 0}`);
    console.log(`   Errored: ${stats.stateCounts["errored"] || 0}\n`);

    console.log("✨ Producer completed successfully!");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

main();
