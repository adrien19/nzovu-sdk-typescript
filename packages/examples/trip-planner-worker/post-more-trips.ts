import { NzovuClient, Message } from "@nzovu/client";

const client = new NzovuClient({
  connection: {
    insecure: process.env.NZOVU_INSECURE === "true",
    apiKey: process.env.NZOVU_API_KEY,
    address: process.env.NZOVU_ADDRESS || "localhost:9000",
  },
});

async function postTrips() {
  await client.connect();

  const trips = [
    { id: "trip-london-004", destination: "London, UK", priority: 4 },
    { id: "trip-rome-005", destination: "Rome, Italy", priority: 3 },
    { id: "trip-barcelona-006", destination: "Barcelona, Spain", priority: 2 },
  ];

  for (const trip of trips) {
    const message: Message.Message = Message.Message.fromPartial({
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
      },
    });

    await client.messages.postMessage("trip-planning-requests", message);
    console.log(`✅ Posted: ${trip.id} to ${trip.destination}`);
  }

  await client.disconnect();
}

postTrips().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
