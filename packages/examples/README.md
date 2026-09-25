# Nzovu examples

Run from the repository root with Node 22+ and the pinned pnpm version:

```sh
make install-dev build-all check-examples
export NZOVU_ADDRESS=localhost:9000
export NZOVU_INSECURE=true
pnpm --filter @nzovu/examples start:notification
pnpm --filter @nzovu/examples start:worker
```

`NZOVU_INSECURE=true` explicitly selects local plaintext. Omit it for TLS; use
`NODE_EXTRA_CA_CERTS=/path/to/ca.crt` for a private server CA and `NZOVU_API_KEY`
when authentication is enabled. Never print keys. The default address is
`localhost:9000`.

| Example                                               | Purpose                                           |
| ----------------------------------------------------- | ------------------------------------------------- |
| `notification-service.ts`, `worker.ts`                | Publish and process email tasks                   |
| `long-running-publisher.ts`, `long-running-worker.ts` | Lease policies and automatic heartbeats           |
| `lease-policy-example.ts`                             | Queue and message lease-policy overrides          |
| `message-retention-policy.ts`                         | Immediate deletion, timed and permanent retention |
| `bulk-message-posting.ts`                             | Atomic and best-effort batches, per-item errors   |
| `logging-best-practices.ts`                           | Console and custom logger configuration           |
| [agent-worker](agent-worker/README.md)                | Concurrent typed task handlers                    |
| [trip-planner-worker](trip-planner-worker/README.md)  | Simulated trip-planning jobs                      |

Priority is 0–4 (4 highest). Posting uses generated `Message.Message.fromPartial`
and `Queue.QueueMetadata.fromPartial` helpers. Runtime message state, attempt
counts and lease expiry are assigned by the server. Ownership operations require
the exact queue, message, worker and attempt returned by acquisition.

Workers stop on SIGINT/SIGTERM. An abandoned task releases its local claim so its
heartbeat cannot keep renewing indefinitely. `autoCreateDlq` chooses the server's
`<queue>_dlq` name; use an existing DLQ with `autoCreateDlq: false` for a custom name.

`make check-examples` compiles every example, including nested apps and the extra
trip producer. `make test-live` runs producers and idle-worker shutdown against
both backends using TLS and API-key authentication. It also exercises SDK/MCP
processing and ownership separately; it does not execute agent shell/HTTP tasks.
