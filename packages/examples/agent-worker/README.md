# Agent worker

A concurrent Nzovu worker dispatches shell-command, HTTP-request and notification
tasks to the handlers in `src/handlers.ts`. Only submit tasks from trusted producers:
these handlers deliberately execute commands and make HTTP requests.

From the repository root:

```sh
make install-dev build-all check-examples
export NZOVU_ADDRESS=localhost:9000
export NZOVU_INSECURE=true
pnpm --filter @nzovu/agent-worker-example start:producer
pnpm --filter @nzovu/agent-worker-example start:worker
```

The producer creates `agent-tasks` and publishes tasks with priorities 4, 2 and 1.
`QUEUE_NAME` overrides that queue for both processes; `CONCURRENCY` defaults to 1.
For TLS, omit `NZOVU_INSECURE`, provide `NODE_EXTRA_CA_CERTS` for a private CA, and
set `NZOVU_API_KEY` when required. See the [shared setup](../README.md).

The worker preserves worker/attempt ownership for every heartbeat and ACK.
Successful tasks are acknowledged; failed tasks release their local heartbeat and
can be reclaimed after lease expiry. SIGINT/SIGTERM waits for active work up to
the configured shutdown timeout, then disconnects and clears heartbeat state.

`make check-examples` compiles this application. Live validation runs the producer
and tests idle-worker shutdown; command execution and external HTTP services are
not invoked by the validation suite.
