# @nzovu/mcp-server

Nzovu MCP stdio server. Private development package, version `0.0.1-dev.0`.
Build locally from the monorepo root with `make build-all`; no package publication
or installation from npm is available in this development workflow.

```sh
NZOVU_ADDRESS=localhost:9000 NZOVU_INSECURE=true node packages/mcp/dist/index.js
```

The executable name is `nzovu-mcp`. stdout carries MCP JSON-RPC only. Diagnostics
use stderr. All 31 service operations are registered from one canonical registry;
`tools/list` supplies the exact schemas, descriptions and annotations.

## Configuration

| Environment variable       | Meaning                                            | Default          |
| -------------------------- | -------------------------------------------------- | ---------------- |
| `NZOVU_ADDRESS`            | gRPC address                                       | `localhost:9000` |
| `NZOVU_INSECURE`           | Explicit plaintext; only `true` / `false` accepted | `false` (TLS)    |
| `NZOVU_API_KEY`            | API key sent in gRPC metadata                      | absent           |
| `NZOVU_CA_PATH`            | PEM CA file; works without a client certificate    | system roots     |
| `NZOVU_CERT_PATH`          | PEM client certificate for mTLS                    | absent           |
| `NZOVU_KEY_PATH`           | PEM client private key, required with certificate  | absent           |
| `NZOVU_TIMEOUT`            | Connection and RPC timeout; whole milliseconds     | `30s`            |
| `NZOVU_MAX_MANAGED_CLAIMS` | Outstanding acquired claims per process            | `1000`           |

Certificate/key must be paired. TLS files cannot be combined with plaintext.
Invalid, zero, fractional-millisecond or overflowing timeouts fail startup.
Keep API keys outside committed configuration. Authentication errors return
`UNAUTHENTICATED` distinctly; the configured key is redacted from tool errors.

## Tool inputs and results

Inputs use **camelCase protobuf field names** with strict schemas; unknown fields
are rejected. Nested messages, queue metadata and calendar structures follow the
pinned Nzovu API. There are no old `queue_name`, `limit`, or formatted-duration
aliases. Read the advertised `tools/list` schema for every field.

- Priorities are decimal strings `"0"` through `"4"`; default `"0"`.
- Int64 values remain strings. Duration and timestamp values are
  `{ "seconds": "30", "nanos": 1 }`; timestamps retain nanoseconds.
- Headers are ordered `{ "key": "x-trace", "value": "AP8=" }` entries, where
  `value` is canonical base64. Duplicate keys are preserved. Header limits and
  reserved prefixes match the server.
- Payload data is a JSON object. `validate_payload.payload` accepts any JSON value,
  including strings, null, false and zero, and serializes it exactly once.
- Posting rejects client-supplied runtime state. Bulk inputs permit encodable
  invalid IDs/priorities so BEST_EFFORT can return server per-item failures.
- Collection tools fetch **one page**, accepting `pageSize` (0 defaults to 100;
  maximum 1000) and opaque `pageToken`. Results retain `nextPageToken` and counts.
- Responses include both `structuredContent` and equivalent JSON text. Complete
  protobuf fields are preserved; optional absent fields stay absent. Bytes use
  base64, enums use numeric values, and timestamps use seconds/nanos objects.
- Failures set `isError: true` and return an error code, gRPC code when available,
  and details. Calendar/payload validation returning `valid: false` remains a
  successful RPC containing all validation issues.

Example arguments for `post_message`:

```json
{
  "queueName": "tasks",
  "message": {
    "messageId": "task-1",
    "metadata": {
      "priority": "2",
      "payload": { "data": { "task": "report" }, "contentType": "application/json" },
      "headers": [{ "key": "x-trace", "value": "AP8=" }],
      "leasePolicy": { "maxRenewals": 0 }
    }
  }
}
```

For `get_next_message`, provide `{ "queueName": "tasks" }`. Save its `workerId`
and `attemptId`; pass both unchanged with queue/message IDs to
`send_message_heartbeat`, `renew_message_lease` and `acknowledge_message`.
ACK state is `3` (COMPLETED) or `5` (ERRORED). MCP does not start automatic
heartbeats: workers explicitly invoke heartbeat/renewal while processing.

## Available tools

| Resource | Tools                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queue    | `create_queue`, `delete_queue`, `get_queue_state`, `list_queues`                                                                                                    |
| Message  | `post_message`, `post_messages_bulk`, `get_next_message`, `acknowledge_message`, `cancel_message`, `send_message_heartbeat`, `renew_message_lease`, `peek_messages` |
| Schedule | `create_schedule`, `get_schedule`, `delete_schedule`, `pause_schedule`, `resume_schedule`, `list_schedules`, `get_schedule_history`                                 |
| Calendar | `validate_calendar_schedule`, `preview_calendar_schedule`                                                                                                           |
| DLQ      | `get_dlq_messages`, `requeue_from_dlq`, `delete_from_dlq`, `purge_dlq`, `get_dlq_stats`                                                                             |
| Schema   | `register_schema`, `get_schema`, `delete_schema`, `list_schemas`, `validate_payload`                                                                                |

Schema lists summarize families, including total count and version count.
Deactivation returns `versionsDeleted`. DLQ requeue requires `targetQueue`.
Bulk mode `0` is ALL_OR_NOTHING; `1` is BEST_EFFORT. All per-item results survive.
Schedule history includes durable executions and immutable message snapshots.
Calendar preview returns exact execution times, timezone, start and count.

Destructive operations are annotated in tool metadata. Read-only operations are
marked accordingly; acquisition, heartbeat and renewal are state mutations.
Only read-only UNAVAILABLE RPCs retry, within one deadline budget. Mutations are
never automatically replayed.

## Lifecycle and local validation

MCP cancellation propagates to the underlying RPC and retry wait. EOF, transport
closure, SIGINT and SIGTERM disconnect the SDK, cancel calls, clear claims and
remove listeners. `createMCPServer()` can be embedded; await `server.close()`.
Use `signalHandlers: false` when the embedding application owns signal handling.

Run from the repository root:

```sh
make test-mcp
make ci
```

Tests use the actual MCP client/server registration and built stdio executable,
plus local gRPC fixtures for every RPC, TLS/mTLS, authentication errors, deadlines,
cancellation and shutdown. This validates protocol behavior; live SQLite/PostgreSQL
server validation remains a separate development gate.

MIT. Original attribution retained in the repository `LICENCE`.
