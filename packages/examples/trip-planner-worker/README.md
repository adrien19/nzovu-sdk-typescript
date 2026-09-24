# Trip Planner Worker

A self-orchestrating trip planning system demonstrating Nzovu's advanced features including lease policies, retention policies, heartbeat mechanisms, and worker tracking.

## Overview

This example showcases a complete trip planning workflow where:

- **Producer** posts trip planning requests to a Nzovu
- **Worker** processes requests asynchronously with proper lease management
- **Nzovu** handles orchestration, retries, and message retention

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  Producer   │ ──────> │ Nzovu  │ ──────> │   Worker    │
│             │  Post   │              │  Get    │             │
│ Trip Plans  │ Message │ Lease Policy │ Message │ Trip Planner│
└─────────────┘         │ Retention    │         └─────────────┘
                        │ Heartbeats   │
                        └──────────────┘
```

### Key Components

- **types.ts**: TypeScript interfaces for trip requests, plans, and task payloads
- **producer.ts**: Posts trip planning requests with priorities
- **worker.ts**: Processes requests with heartbeat support and statistics tracking

## Nzovu Features Demonstrated

### 1. **Lease Policy**

```typescript
leasePolicy: {
  baseLease: '300s',        // 5-minute initial lease
  maxExtension: '30m',      // Up to 30 minutes via heartbeats
  heartbeatTimeout: '60s',  // Heartbeat required every minute
  maxRenewals: 5            // Maximum 5 lease renewals
}
```

### 2. **Retention Policy**

```typescript
retentionPolicy: {
  mode: 'retain_duration',
  retentionSeconds: 172800  // 2 days for audit compliance
}
```

### 3. **Heartbeat Mechanism**

The worker sends heartbeats every 30 seconds to extend the lease for long-running tasks:

```typescript
await client.message.renewLease({
  queueName: QUEUE_NAME,
  messageId: messageId,
  leaseDuration: "300s",
});
```

### 4. **Worker Tracking**

Each worker is identified by a unique `workerId` for monitoring and debugging:

```typescript
const WORKER_ID = `worker-${process.pid}`;
```

### 5. **Message Acknowledgment**

Proper acknowledgment with attempt tracking:

```typescript
await client.message.acknowledge({
  queueName: QUEUE_NAME,
  messageId: messageId,
  status: "completed",
  workerId: WORKER_ID,
  attemptId: attemptId,
});
```

## Installation

```bash
cd packages/examples/trip-planner-worker
pnpm install
pnpm build
```

## Prerequisites

Make sure Nzovu server is running:

```bash
# Start Nzovu server
nzovu-server --port 50051
```

Or set custom server address:

```bash
export NZOVU_SERVER=localhost:9000
```

## Usage

### 1. Run the Producer

Post sample trip planning requests to the queue:

```bash
pnpm run producer
```

**Output:**

```
🚀 Starting Trip Planner Producer...
📡 Connecting to Nzovu at localhost:9000

✅ Queue 'trip-planning-requests' ready

📤 Posting trip planning requests...

✅ Posted: trip-paris-001
   Destination: Paris, France
   Priority: 10
   Travelers: 2
   Budget: $5000
   Duration: 2024-06-15 → 2024-06-22

✅ Posted: trip-tokyo-002
   Destination: Tokyo, Japan
   Priority: 8
   Travelers: 1
   Budget: $4000
   Duration: 2024-07-10 → 2024-07-20

✅ Posted: trip-nyc-003
   Destination: New York City, USA
   Priority: 6
   Travelers: 4
   Budget: $8000
   Duration: 2024-08-05 → 2024-08-12

📊 Queue Statistics:
   Pending: 3
   Running: 0
   Completed: 0
   Errored: 0
```

### 2. Run the Worker

Process trip planning requests:

```bash
pnpm run worker
```

**Output:**

```
🤖 Starting Trip Planner Worker...
📡 Server: localhost:9000
🆔 Worker ID: worker-12345
📥 Queue: trip-planning-requests

📨 Processing Message: trip-paris-001
   Attempt ID: abc123...
   Priority: 10
   Worker: worker-12345
   🗺️  Planning trip to Paris, France...
   💓 Heartbeat sent
✅ Completed in 2.34s
   Trip ID: trip-1234567890
   Destination: Paris, France
   Estimated Cost: $4850

📊 Worker Statistics:
   Total Processed: 1
   Successful: 1
   Failed: 0
   Avg Processing Time: 2.34s
   Uptime: 3s
```

### 3. Run Both in Parallel

```bash
pnpm run dev
```

This runs both producer and worker simultaneously using `npm-run-all`.

## Example Trip Requests

### Paris (High Priority)

```typescript
{
  destination: 'Paris, France',
  startDate: '2024-06-15',
  endDate: '2024-06-22',
  travelers: 2,
  budget: 5000,
  preferences: {
    activities: ['museums', 'dining', 'architecture'],
    accommodationType: 'hotel',
    transportation: 'flight'
  }
}
```

### Tokyo (Medium Priority)

```typescript
{
  destination: 'Tokyo, Japan',
  startDate: '2024-07-10',
  endDate: '2024-07-20',
  travelers: 1,
  budget: 4000,
  preferences: {
    activities: ['culture', 'food', 'technology'],
    accommodationType: 'airbnb',
    transportation: 'flight'
  }
}
```

### New York City (Lower Priority)

```typescript
{
  destination: 'New York City, USA',
  startDate: '2024-08-05',
  endDate: '2024-08-12',
  travelers: 4,
  budget: 8000,
  preferences: {
    activities: ['broadway', 'shopping', 'sightseeing'],
    accommodationType: 'hotel',
    transportation: 'flight'
  }
}
```

## Self-Improvement Workflow

This project was built using Nzovu MCP to orchestrate development tasks. Here's how it works:

### Development Task Queue

```typescript
// Created queue: trip-planner-dev-tasks
await mcp_nzovu_create_queue({
  queueName: "trip-planner-dev-tasks",
  leasePolicy: {
    baseLease: "300s",
    maxExtension: "30m",
    heartbeatTimeout: "60s",
    maxRenewals: 5,
  },
  retentionPolicy: {
    mode: "retain_duration",
    retentionSeconds: 172800, // 2 days
  },
});
```

### Task Execution Flow

1. **Task 001 (Priority 10)**: Create package.json and tsconfig.json ✅
2. **Task 002 (Priority 9)**: Create type definitions ✅
3. **Task 003 (Priority 8)**: Create producer ✅
4. **Task 004 (Priority 7)**: Create worker ✅
5. **Task 005 (Priority 6)**: Create README ✅

### Suggested Enhancements

Consider adding these tasks to continue improving the system:

#### Integration Enhancements

- **Flight Search API**: Integrate real flight search (Skyscanner, Amadeus)
- **Hotel Booking**: Add hotel availability and pricing
- **Weather API**: Include weather forecasts for travel dates
- **Currency Conversion**: Real-time exchange rates

#### Worker Improvements

- **Parallel Processing**: Use multiple workers for different task types
- **Dead Letter Queue Handling**: Monitor and reprocess failed tasks
- **Metrics Dashboard**: Real-time statistics and monitoring
- **Cost Optimization**: Smart budget allocation algorithms

#### Queue Enhancements

- **Priority Lanes**: Separate queues for VIP vs standard requests
- **Scheduled Tasks**: Periodic price checks and alerts
- **Bulk Operations**: Batch processing for group bookings
- **Schema Validation**: Add JSON schema validation for payloads

## Monitoring

### Check Queue State

```bash
# Using Nzovu CLI
nzovu queue state trip-planning-requests
```

### View Dead Letter Queue

```bash
nzovu queue dlq trip-planning-requests-dlq
```

### Audit Retained Messages

Messages are retained for 2 days, allowing:

- Audit compliance reviews
- Replay of completed tasks
- Analysis of processing patterns
- Debugging historical issues

## Troubleshooting

### Worker Not Processing

- Verify Nzovu server is running
- Check network connectivity: `telnet localhost 50051`
- Ensure queue exists and has pending messages

### Heartbeat Failures

- Increase `heartbeatTimeout` if network is slow
- Reduce heartbeat interval (currently 30s)
- Check server logs for lease expiry

### Messages Going to DLQ

- Review error logs in worker output
- Check `maxAttempts` configuration (default: 3)
- Inspect DLQ messages for common patterns

## License

MIT

---

**Built with Nzovu** - Demonstrating self-orchestrating workflows with lease policies, heartbeats, and retention for audit compliance.
