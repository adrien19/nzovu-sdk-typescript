import { NzovuClient, Message } from "@nzovu/client";

const client = new NzovuClient({
  connection: { address: "host.docker.internal:9000" },
});

async function postTrips() {
  await client.connect();

  const trips = [
    { id: "trip-london-004", destination: "London, UK", priority: 9 },
    { id: "trip-rome-005", destination: "Rome, Italy", priority: 7 },
    { id: "trip-barcelona-006", destination: "Barcelona, Spain", priority: 5 },
  ];

  for (const trip of trips) {
    const message: Message.Message = {
      messageId: trip.id,
      metadata: {
        payload: {
          data: {
            type: "plan_trip",
            request: {
              destination: trip.destination,
              startDate: "2024-09-01",
              endDate: "2024-09-07",
              travelers: 2,
              budget: 3000,
            },
          } as any,
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

    await client.messages.postMessage("trip-planning-requests", message);
    console.log(`✅ Posted: ${trip.id} to ${trip.destination}`);
  }

  await client.disconnect();
}

postTrips();
