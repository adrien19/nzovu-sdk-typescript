# @nzovu/client

Promise-based Nzovu gRPC client. Private development package; build and use from
this workspace. See the root README for local setup and validation commands.

## Queue and message lifecycle

```typescript
import { NzovuClient, Message, Queue, parseDuration } from "@nzovu/client";

const client = new NzovuClient({
  connection: { address: "localhost:9000", retry: { enabled: false } },
});
await client.connect();
try {
  await client.queues.createQueue(
    "orders",
    Queue.QueueMetadata.fromPartial({
      defaultMaxAttempts: 3,
      autoCreateDlq: true,
    }),
  );
  await client.messages.postMessage(
    "orders",
    Message.Message.fromPartial({
      messageId: "order-123",
      metadata: {
        priority: "2",
        payload: { data: { orderId: "123" }, contentType: "application/json" },
        headers: [{ key: "x-trace", value: Uint8Array.from([0, 255]) }],
      },
    }),
  );
  const claim = await client.messages.getNextMessage(
    "orders",
    parseDuration("30s"),
  );
  if (claim.message) {
    console.log(claim.message.metadata?.payload?.data);
    await client.messages.renewMessageLease(
      "orders",
      claim.message.messageId,
      parseDuration("30s"),
      claim.workerId,
      claim.attemptId,
    );
    await client.messages.acknowledgeMessage(
      "orders",
      claim.message.messageId,
      Message.Message_Metadata_State.COMPLETED,
      claim.workerId,
      claim.attemptId,
    );
  }
} finally {
  await client.disconnect();
}
```

Use generated `fromPartial()` builders to populate protobuf defaults. Posting
priority is an int64 string from `"0"` to `"4"`; omit runtime fields (state,
lease expiry, renewal count, attempt and priority level). The server assigns
runtime state. Message IDs allow ASCII letters, digits, underscores and hyphens,
up to 256 characters. Payload data uses JSON objects, not `Buffer`.

Headers preserve order, duplicate keys and opaque bytes. Keys use lowercase ASCII
letters, digits and hyphens; `x-nzovu-`, `x-internal-` and `x-system-` are reserved.
Each value is limited to 4096 bytes; combined keys and values to 32768 bytes.

Queue metadata and lease policies are forwarded without invented defaults.
Omitted `maxRenewals` inherits policy; explicit `0` is preserved. Ownership fields
returned by acquisition must be passed unchanged to ACK, heartbeat and renewal.
`sendHeartbeat(queueName, messageId, workerId, attemptId)` returns remaining time
and state. An empty acquisition response may contain no message; a missing RPC
response is an error.

Bulk posting accepts 1–1000 messages and `TransactionMode.ALL_OR_NOTHING` (default)
or `BEST_EFFORT`. Its complete response includes counts and ordered per-item
results, error codes and messages. Item validation stays on the server so an
invalid item does not prevent BEST_EFFORT processing of valid items.

## Pagination

All collection methods make exactly one request and return continuation tokens:

| Method                                              | Result fields                            |
| --------------------------------------------------- | ---------------------------------------- |
| `queues.listQueues(options)`                        | `queues`, `nextPageToken`                |
| `messages.peekQueueMessages(queueName, options)`    | `messages`, `nextPageToken`              |
| `schedules.listSchedules(options)`                  | `schedules`, `nextPageToken`             |
| `schedules.getScheduleHistory(scheduleId, options)` | `scheduleHistory`, `nextPageToken`       |
| `schemas.listSchemas(options)`                      | `schemas`, `totalCount`, `nextPageToken` |
| `dlq.getDLQMessages(dlqName, options)`              | `messages`, `nextPageToken`              |

Options accept `pageSize` (0 means server default 100; maximum 1000) and opaque
`pageToken`. Lists also accept `prefix`; schema lists accept `activeOnly`; peek
accepts `priorityRange: { min: "0", max: "4" }`. Keep filters unchanged while
continuing a page. No method fetches all pages automatically.

```typescript
const first = await client.queues.listQueues({ prefix: "order", pageSize: 10 });
if (first.nextPageToken) {
  const second = await client.queues.listQueues({
    prefix: "order",
    pageSize: 10,
    pageToken: first.nextPageToken,
  });
  console.log(second.queues);
}
```

## Schedules and calendars

`createSchedule()` accepts `Schedule.Schedule.fromPartial(...)`, with metadata
containing `queueName`, `payload`, priority and either `cronSchedule` or
`calendarSchedule`. Schedule headers are forwarded; `exclusivityKey` is unsupported.
`getSchedule()`, `pauseSchedule()`, `resumeSchedule()` and `deleteSchedule()` use the
schedule ID. History preserves durable executions, immutable message snapshots,
errors and all timestamps.

`validateCalendarSchedule(calendar)` returns `valid`, `errorMessage` and every
validation issue, including field, rule index and suggestion.
`previewCalendarSchedule(calendar, count)` returns execution times, timezone,
preview start and total count. Omitted/zero count uses the server default (10);
the server caps positive counts at 100. Negative and noninteger counts are invalid.
Use `Schedule.CalendarSchedule.fromPartial(...)` to construct calendar inputs.

## Schemas and DLQ

```typescript
await client.schemas.registerSchema("order", '{"type":"object"}', {
  name: "Order",
  contentType: "json-schema",
  metadata: { owner: "checkout" },
});
const schema = await client.schemas.getSchema("order", 0);
const validation = await client.schemas.validatePayload(
  "order",
  { orderId: "123" },
  0,
);
const removed = await client.schemas.deleteSchema("order", 0);
console.log(schema, validation.errors, removed.versionsDeleted);
await client.dlq.requeueFromDLQ("orders-dlq", "order-123", "orders");
```

Registration requires ID, name and JSON Schema content. Versions are nonnegative
int32 values: 0 selects latest for get/validate and all versions for deactivation.
Schema lists summarize families with latest version, version count, total family
count and pagination. Deactivation returns `success` and `versionsDeleted`.
Validation preserves every error and its details. DLQ requeue requires an explicit
destination; delete, purge and statistics methods preserve server results.

## Precision and errors

Int64 values remain decimal strings. Durations and timestamps use
`{ seconds: string, nanos: number }`, preserving nanoseconds in wire and generated
JSON codecs. Generated timestamp JSON uses the same object representation.
`timestampToISOString()` formats timestamps with nine fractional digits.
`parseDuration()` accepts nonnegative ns/us/ms/s/m/h values, including decimals
that resolve to whole nanoseconds. `durationToMs()` explicitly truncates
submillisecond precision; `msToDuration()` requires safe integer milliseconds.
Both validate protobuf duration bounds.

RPC failures reject with `NzovuError`, mapped error code and original cause.
Server validation remains authoritative for database-dependent rules, calendar
semantics and JSON Schema validation. Connection defaults to plaintext; custom TLS
credentials can be supplied through `connection.credentials`. Built-in API-key
metadata and per-request deadline enforcement are not yet available. Disable
retries for mutations whose outcome is ambiguous; do not replay acquired claims.

## License

MIT. Original attribution preserved in the repository `LICENCE`.
