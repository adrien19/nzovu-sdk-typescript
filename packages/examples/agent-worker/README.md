# Agent Worker Example

A demonstration of using Nzovu as a task orchestration system for agent workers.

## Overview

This example shows how to build an agent-based task execution system using Nzovu:

- **Producer**: Posts tasks to Nzovu with priorities
- **Worker**: Consumes and executes tasks with lease management and heartbeats
- **Handlers**: Pluggable task handlers for different task types

## Task Types

| Task Type        | Description                                         |
| ---------------- | --------------------------------------------------- |
| `shell_command`  | Execute shell commands                              |
| `http_request`   | Make HTTP requests                                  |
| `data_transform` | Transform data with map/filter/reduce               |
| `notification`   | Send notifications (console, webhook, email, slack) |
| `aggregation`    | Aggregate results from multiple tasks               |
| `custom`         | Execute custom handlers                             |

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Producer  │────▶│  Nzovu │────▶│   Worker    │
│             │     │              │     │             │
│ Posts tasks │     │ • Priority   │     │ • Consume   │
│ with        │     │   ordering   │     │ • Execute   │
│ priorities  │     │ • Lease mgmt │     │ • Heartbeat │
│             │     │ • Retry/DLQ  │     │ • Ack/Nack  │
└─────────────┘     └──────────────┘     └─────────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
cd packages/examples/agent-worker
pnpm install
```

### 2. Start Nzovu Server

Make sure Nzovu is running on `localhost:9000` (or set `NZOVU_ADDRESS`).

### 3. Run the Producer

Post sample tasks to the queue:

```bash
pnpm start:producer
```

### 4. Run the Worker

Start consuming and executing tasks:

```bash
pnpm start:worker
```

## Configuration

### Environment Variables

| Variable        | Default          | Description          |
| --------------- | ---------------- | -------------------- |
| `NZOVU_ADDRESS` | `localhost:9000` | Nzovu server address |
| `QUEUE_NAME`    | `agent-tasks`    | Queue to use         |
| `CONCURRENCY`   | `1`              | Max concurrent tasks |

### Worker Configuration

```typescript
const worker = new AgentWorker({
  workerId: "my-worker",
  queueName: "agent-tasks",
  serverAddress: "localhost:9000",
  concurrency: 4,
  pollIntervalMs: 1000,
  enableHeartbeat: true,
  heartbeatIntervalMs: 10000,
  shutdownTimeoutMs: 30000,
});
```

## Task Payloads

### Shell Command

```typescript
{
  taskId: 'shell-001',
  taskType: 'shell_command',
  command: 'ls',
  args: ['-la', '/tmp'],
  cwd: '/home/user',
  timeoutMs: 30000
}
```

### HTTP Request

```typescript
{
  taskId: 'http-001',
  taskType: 'http_request',
  url: 'https://api.example.com/data',
  method: 'POST',
  headers: { 'Authorization': 'Bearer token' },
  body: { key: 'value' },
  expectedStatus: [200, 201]
}
```

### Notification

```typescript
{
  taskId: 'notify-001',
  taskType: 'notification',
  channel: 'slack',
  recipient: '#alerts',
  subject: 'Task Complete',
  message: 'All tasks processed successfully'
}
```

## Features Demonstrated

### Priority-Based Processing

Tasks are processed by priority (higher first):

- Priority 10: Urgent tasks
- Priority 5: Normal tasks
- Priority 1: Background tasks

### Lease Management

- Each task gets a 60-second lease
- Workers send heartbeats every 10 seconds
- Failed tasks return to queue automatically

### Graceful Shutdown

- SIGINT/SIGTERM triggers graceful shutdown
- Worker waits for active tasks to complete
- Configurable shutdown timeout

### Error Handling

- Tasks that throw errors don't get acknowledged
- Nzovu automatically retries (up to max_attempts)
- Failed tasks eventually go to Dead Letter Queue

## Extending

### Add Custom Handlers

```typescript
// In handlers.ts
async function handleMyCustomTask(
  task: CustomTask,
  context: HandlerContext,
): Promise<unknown> {
  context.log("Processing custom task");
  context.sendHeartbeat(); // For long-running tasks

  // Your logic here
  return { success: true };
}

// Register in handlers map
const handlers = {
  // ...existing handlers
  [TaskType.CUSTOM]: handleMyCustomTask,
};
```

### Scale Workers

Run multiple workers for parallel processing:

```bash
# Terminal 1
WORKER_ID=worker-1 pnpm start:worker

# Terminal 2
WORKER_ID=worker-2 pnpm start:worker
```

## License

MIT
