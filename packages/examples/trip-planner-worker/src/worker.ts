/**
 * Trip Planner Worker
 * Processes trip planning requests from Nzovu
 */

import { NzovuClient, Message } from "@nzovu/client";
import {
  Accommodation,
  Activity,
  DayPlan,
  Meal,
  PlanTripPayload,
  TaskType,
  Transportation,
  TripPlan,
  TripRequest,
  WorkerStats,
} from "./types";

const QUEUE_NAME = "trip-planning-requests";
const SERVER_ADDRESS = process.env.NZOVU_ADDRESS || "localhost:9000";
const WORKER_ID = `worker-${process.pid}`;

class TripPlannerWorker {
  private client: NzovuClient;
  private stats: WorkerStats;
  private running: boolean = false;

  constructor() {
    this.client = new NzovuClient({
      connection: {
        insecure: process.env.NZOVU_INSECURE === "true",
        apiKey: process.env.NZOVU_API_KEY,
        address: SERVER_ADDRESS,
      },
      workerId: WORKER_ID,
    });
    this.stats = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      averageProcessingTime: 0,
      startedAt: new Date().toISOString(),
    };
  }

  async start() {
    console.log("🤖 Starting Trip Planner Worker...");
    console.log(`📡 Server: ${SERVER_ADDRESS}`);
    console.log(`🆔 Worker ID: ${WORKER_ID}`);
    console.log(`📥 Queue: ${QUEUE_NAME}\n`);

    await this.client.connect();
    this.running = true;

    // Graceful shutdown
    process.on("SIGINT", () => this.stop());
    process.on("SIGTERM", () => this.stop());

    while (this.running) {
      try {
        // Get next message with 5-minute lease and enable heartbeat
        const { message, workerId, attemptId, stopHeartbeat } =
          await this.client.messages.getNextMessage(
            QUEUE_NAME,
            undefined, // Use queue's lease policy
            undefined, // No exclusivity key
            true, // Enable heartbeat
            30000, // Heartbeat every 30 seconds
            WORKER_ID,
          );

        if (!message) {
          console.log("⏸️  No messages available, waiting 5 seconds...");
          await this.sleep(5000);
          continue;
        }

        await this.processMessage(
          message,
          workerId!,
          attemptId!,
          stopHeartbeat,
        );
      } catch (error) {
        console.error("❌ Error processing message:", error);
        await this.sleep(1000);
      }
    }
  }

  private async processMessage(
    message: Message.Message,
    workerId: string,
    attemptId: string,
    stopHeartbeat?: () => void,
  ) {
    const messageId = message.messageId;

    // Safely extract and validate payload
    const rawPayload = message.metadata?.payload?.data;
    if (!rawPayload || typeof rawPayload !== "object") {
      console.error(
        `\u274c Invalid message ${messageId}: missing or invalid payload`,
      );
      try {
        await this.client.messages.acknowledgeMessage(
          QUEUE_NAME,
          messageId,
          Message.Message_Metadata_State.ERRORED,
          workerId,
          attemptId,
        );
      } catch (ackError) {
        console.error("   ⚠️  Failed to acknowledge error:", ackError);
      }
      if (stopHeartbeat) stopHeartbeat();
      this.client.messages.releaseClaim({
        queueName: QUEUE_NAME,
        messageId,
        workerId,
        attemptId,
      });
      return;
    }
    const payload = rawPayload as PlanTripPayload;

    console.log(`\n📨 Processing Message: ${messageId}`);
    console.log(`   Attempt ID: ${attemptId}`);
    console.log(`   Priority: ${message.metadata?.priority}`);
    console.log(`   Worker: ${workerId}`);

    const startTime = Date.now();

    try {
      // Process based on task type
      let result: TripPlan | null = null;

      if (payload.type === TaskType.PLAN_TRIP) {
        result = await this.planTrip(payload.request);
      } else {
        throw new Error(`Unknown task type: ${payload.type}`);
      }

      const processingTime = Date.now() - startTime;

      // Acknowledge successful processing
      await this.client.messages.acknowledgeMessage(
        QUEUE_NAME,
        messageId,
        Message.Message_Metadata_State.COMPLETED,
        workerId,
        attemptId,
      );

      this.stats.totalProcessed++;
      this.stats.successful++;
      this.updateAverageTime(processingTime);

      console.log(`✅ Completed in ${(processingTime / 1000).toFixed(2)}s`);
      console.log(`   Trip ID: ${result?.tripId}`);
      console.log(`   Destination: ${result?.destination}`);
      console.log(`   Estimated Cost: $${result?.estimatedCost}`);
      this.logStats();
    } catch (error) {
      console.error(`❌ Failed: ${error}`);

      try {
        await this.client.messages.acknowledgeMessage(
          QUEUE_NAME,
          messageId,
          Message.Message_Metadata_State.ERRORED,
          workerId,
          attemptId,
        );

        this.stats.totalProcessed++;
        this.stats.failed++;
      } catch (ackError) {
        console.error("   ⚠️  Failed to acknowledge error:", ackError);
      }
    } finally {
      if (stopHeartbeat) stopHeartbeat();
      this.client.messages.releaseClaim({
        queueName: QUEUE_NAME,
        messageId,
        workerId,
        attemptId,
      });
    }
  }

  /**
   * Simulates trip planning logic
   */
  private async planTrip(request: TripRequest): Promise<TripPlan> {
    console.log(`   🗺️  Planning trip to ${request.destination}...`);

    // Simulate processing time
    await this.sleep(2000);

    const startDate = new Date(request.startDate);
    const endDate = new Date(request.endDate);
    const days = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Generate itinerary
    const itinerary: DayPlan[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      itinerary.push({
        day: i + 1,
        date: date.toISOString().split("T")[0],
        activities: this.generateActivities(request),
        meals: this.generateMeals(),
      });
    }

    // Generate accommodations
    const accommodations = this.generateAccommodations(request, days);

    // Generate transportation
    const transportation = this.generateTransportation(request);

    // Calculate total cost
    const estimatedCost =
      accommodations.reduce((sum, acc) => sum + acc.totalCost, 0) +
      transportation.reduce((sum, trans) => sum + trans.cost, 0) +
      itinerary.reduce(
        (sum, day) =>
          sum +
          day.activities.reduce((aSum, act) => aSum + act.cost, 0) +
          day.meals.reduce((mSum, meal) => mSum + meal.estimatedCost, 0),
        0,
      );

    const tripPlan: TripPlan = {
      tripId: `trip-${Date.now()}`,
      destination: request.destination,
      itinerary,
      accommodations,
      transportation,
      estimatedCost: Math.round(estimatedCost),
      generatedAt: new Date().toISOString(),
    };

    return tripPlan;
  }

  private generateActivities(request: TripRequest): Activity[] {
    const activities = request.preferences?.activities || ["sightseeing"];
    return activities.slice(0, 2).map((activity, idx) => ({
      name: `${activity.charAt(0).toUpperCase() + activity.slice(1)} Tour`,
      duration: idx === 0 ? "3 hours" : "2 hours",
      cost: idx === 0 ? 75 : 50,
      description: `Experience the best ${activity} in ${request.destination.split(",")[0]}`,
    }));
  }

  private generateMeals(): Meal[] {
    return [
      { type: "breakfast", venue: "Hotel Restaurant", estimatedCost: 25 },
      { type: "lunch", venue: "Local Café", estimatedCost: 40 },
      { type: "dinner", venue: "Fine Dining", estimatedCost: 85 },
    ];
  }

  private generateAccommodations(
    request: TripRequest,
    days: number,
  ): Accommodation[] {
    const nightlyRate = request.budget / (days * 2); // Rough estimate
    return [
      {
        name: `${request.preferences?.accommodationType || "Hotel"} in ${request.destination.split(",")[0]}`,
        type: request.preferences?.accommodationType || "hotel",
        checkIn: request.startDate,
        checkOut: request.endDate,
        nightlyRate: Math.round(nightlyRate),
        totalCost: Math.round(nightlyRate * days),
      },
    ];
  }

  private generateTransportation(request: TripRequest): Transportation[] {
    const transportType = request.preferences?.transportation || "flight";
    const baseCost = transportType === "flight" ? 600 : 200;

    return [
      {
        type: transportType,
        from: "Home",
        to: request.destination,
        departureTime: `${request.startDate}T08:00:00`,
        arrivalTime: `${request.startDate}T14:00:00`,
        cost: baseCost * request.travelers,
      },
      {
        type: transportType,
        from: request.destination,
        to: "Home",
        departureTime: `${request.endDate}T16:00:00`,
        arrivalTime: `${request.endDate}T22:00:00`,
        cost: baseCost * request.travelers,
      },
    ];
  }

  private updateAverageTime(newTime: number) {
    const total =
      this.stats.averageProcessingTime * (this.stats.successful - 1) + newTime;
    this.stats.averageProcessingTime = Math.round(
      total / this.stats.successful,
    );
  }

  private logStats() {
    console.log(`\n📊 Worker Statistics:`);
    console.log(`   Total Processed: ${this.stats.totalProcessed}`);
    console.log(`   Successful: ${this.stats.successful}`);
    console.log(`   Failed: ${this.stats.failed}`);
    console.log(
      `   Avg Processing Time: ${(this.stats.averageProcessingTime / 1000).toFixed(2)}s`,
    );
    console.log(`   Uptime: ${this.getUptime()}\n`);
  }

  private getUptime(): string {
    const start = new Date(this.stats.startedAt).getTime();
    const now = Date.now();
    const seconds = Math.floor((now - start) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async stop() {
    console.log("\n🛑 Stopping worker...");
    this.running = false;
    this.logStats();
    await this.client.disconnect();
    process.exit(0);
  }
}

// Start the worker
const worker = new TripPlannerWorker();
worker.start().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
