# @nzovu/client

TypeScript/Node.js client SDK for Nzovu – a distributed task queue system with priorities, delayed execution, scheduled tasks, and schema validation.

## Installation

```bash
npm install @nzovu/client
# or
pnpm add @nzovu/client
# or
yarn add @nzovu/client
```

## Quick Start

```typescript
import { NzovuClient } from "@nzovu/client";

const client = new NzovuClient({
  connection: { address: "localhost:9000" },
});
await client.connect();

// Create a queue
await client.queues.createQueue("checkout-orders", {
  type: ProtoQueue.QueueType.SIMPLE,
  defaultMaxAttempts: 3,
  leaseDuration: { seconds: "300", nanos: 0 },
  autoCreateDlq: true,
});

// Register a schema
await client.schemas.registerSchema(
  "store-cart.v1",
  JSON.stringify({
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    required: ["cartId", "userId", "items", "totalAmount"],
    properties: {
      cartId: { type: "string" },
      userId: { type: "string" },
      items: { type: "array" },
      totalAmount: { type: "number" },
    },
  }),
  { name: "Store Cart Schema", contentType: "json-schema" },
);

// Post a validated message
await client.messages.postMessage("checkout-orders", {
  messageId: "order-123",
  metadata: {
    payload: {
      data: {
        cartId: "cart-abc123",
        userId: "user-456",
        items: [{ productId: "prod-001", quantity: 1, price: 999.99 }],
        totalAmount: 999.99,
      },
      contentType: "application/json",
      schemaId: "store-cart.v1",
      schemaVersion: 1,
    },
    priority: 5,
    maxAttempts: 3,
    state: 0, // PENDING
  },
});

// Get next message
const { message, streamEntryId } =
  await client.messages.getNextMessage("checkout-orders");
if (message) {
  // Process message
  console.log("Processing:", message.metadata?.payload?.data);
  // Acknowledge
  await client.messages.acknowledgeMessage(
    "checkout-orders",
    message.messageId,
    1, // PROCESSED
    streamEntryId,
  );
}
await client.disconnect();
```

## Features

### Queue Management

```typescript
// Create queue
await client.queues.createQueue("orders", {
  type: ProtoQueue.QueueType.SIMPLE,
  defaultMaxAttempts: 3,
  maxPayloadSize: 1024 * 512, // 512KB
  deadLetterQueueName: "orders-dlq",
  autoCreateDlq: true,
});

// Get queue state
const queue = await client.queues.getQueueState("orders");

// List queues
const queues = await client.queues.listQueues();

// Delete queue
await client.queues.deleteQueue("orders");
```

### Message Operations

```typescript
import { Message, parseDuration } from '@nzovu/client';

// Post message
await client.messages.postMessage('orders', {
  messageId: 'order-123',
  metadata: {
    payload: {
      data: Buffer.from(JSON.stringify({ orderId: '123', items: [...] })),
      contentType: 'application/json',
    },
    priority: 5,
    maxAttempts: 3,
    state: Message.Message_Metadata_State.PENDING,
  },
});

// Get next message (consumer)
const { message, streamEntryId } = await client.messages.getNextMessage(
  'orders',
  parseDuration('5m'), // 5 minute lease
  'worker-1' // exclusivity key for EXCLUSIVE queues
);

// Renew message lease
await client.messages.renewMessageLease(
  'orders',
  message.messageId,
  parseDuration('5m')
);

// Acknowledge message
await client.messages.acknowledgeMessage(
  'orders',
  message.messageId,
  Message.Message_Metadata_State.COMPLETED, // or ERRORED
  streamEntryId
);

// Peek messages without consuming
const messages = await client.messages.peekQueueMessages('orders', '10');
```

### Scheduled Tasks

```typescript
// Create a cron schedule (every day at midnight)
await client.schedules.createSchedule({
  scheduleId: "daily-report",
  metadata: {
    queueName: "reports",
    cronSchedule: "0 0 * * *",
    payload: {
      data: { report: "daily-orders" },
      contentType: "application/json",
    },
    state: 0, // SCHEDULED
    priority: "10",
    timezone: "UTC",
    messageIds: [],
    exclusivityKey: "",
    stateMessage: "",
    hasMaxMessages: false,
    maxMessages: "0",
    nextRuns: [],
  },
});

// Get schedule
const schedule = await client.schedules.getSchedule("daily-report");
// List schedules
const schedules = await client.schedules.listSchedules();
// Pause, resume, delete
await client.schedules.pauseSchedule("daily-report");
await client.schedules.resumeSchedule("daily-report");
await client.schedules.deleteSchedule("daily-report");
```

### Schema Management

```typescript
// Register a schema
await client.schemas.registerSchema(
  "store-cart.v1",
  JSON.stringify({
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    required: ["cartId", "userId", "items", "totalAmount"],
    properties: {
      cartId: { type: "string" },
      userId: { type: "string" },
      items: { type: "array" },
      totalAmount: { type: "number" },
    },
  }),
  { name: "Store Cart Schema", contentType: "json-schema" },
);

// List schemas
const schemas = await client.schemas.listSchemas();
// Get schema
const schema = await client.schemas.getSchema("store-cart.v1");
// Delete schema
await client.schemas.deleteSchema("store-cart.v1");
```

## Error Handling

```typescript
import { NzovuError, ErrorCode } from "@nzovu/client";

try {
  await client.queues.createQueue("my-queue");
} catch (error) {
  if (error instanceof NzovuError) {
    switch (error.code) {
      case ErrorCode.ALREADY_EXISTS:
        console.log("Queue already exists");
        break;
      case ErrorCode.UNAVAILABLE:
        console.log("Server unavailable, retrying...");
        break;
      default:
        console.error("Error:", error.message);
    }
  }
}
```

## Configuration

### Connection Options

```typescript
const client = new NzovuClient({
  connection: {
    address: "localhost:9000",

    // Optional: TLS credentials
    credentials: grpc.credentials.createSsl(
      fs.readFileSync("ca.pem"),
      fs.readFileSync("client-key.pem"),
      fs.readFileSync("client-cert.pem"),
    ),

    // Optional: gRPC channel options
    channelOptions: {
      "grpc.max_receive_message_length": 10 * 1024 * 1024, // 10MB
      "grpc.keepalive_time_ms": 30000,
    },

    // Optional: Connection timeout (default: 10000ms)
    timeout: 15000,
  },

  // Optional: Default request timeout (default: 30000ms)
  requestTimeout: 60000,
});
```

## Message States

Messages progress through these states:

- `0` - `PENDING`: Message is waiting to be processed
- `1` - `PROCESSED`: Message was successfully processed
- `2` - `IN_PROGRESS`: Message is currently being processed
- `3` - `FAILED`: Message processing failed
- `4` - `DEAD_LETTER`: Message moved to dead letter queue

## Best Practices

1. **Always disconnect**: Call `disconnect()` when done to properly close connections
2. **Handle errors**: Wrap operations in try-catch blocks
3. **Use message leases**: Set appropriate lease durations based on processing time
4. **Renew long-running tasks**: Use `renewMessageLease()` for tasks longer than the initial lease
5. **Configure dead letter queues**: Always set up DLQs to handle failed messages
6. **Use exclusivity keys**: For ordered processing or singleton workers
7. **Use schema validation**: Register schemas and validate messages for data quality
8. **Use JSON objects for payloads**: Do not use Buffer for JSON data; use plain objects for schema validation

## API Reference

See the TypeScript definitions for complete API documentation. Key exports:

- `NzovuClient` - Main client class
- `QueueClient` - Queue management operations
- `MessageClient` - Message operations
- `ScheduleClient` - Scheduled task operations
- **Types from `@nzovu/proto`** (re-exported):
  - `ProtoMessage` – Message protocol types and enums
  - `ProtoSchedule` – Schedule protocol types and enums
  - `ProtoQueue` – Queue protocol types and enums
  - Associated metadata types (e.g., `ProtoMessage.Message_Metadata`, `ProtoSchedule.Schedule_Metadata`)

### Importing Types

You can import protocol types directly from `@nzovu/client`:

```typescript
import { ProtoMessage, ProtoSchedule, ProtoQueue } from "@nzovu/client";

// Example: use message state enum
const state = ProtoMessage.Message_Metadata_State.PENDING;
```

These types are re-exported from `@nzovu/proto` for convenience, so you do not need to install or import from `@nzovu/proto` directly.

## License

MIT
