# Trip planner worker

A producer submits trip requests to `trip-planning-requests`; the worker simulates
transport, accommodation, meals and itinerary planning. No external booking API
or AI service is required.

From the repository root:

```sh
make install-dev build-all check-examples
export NZOVU_ADDRESS=localhost:9000
export NZOVU_INSECURE=true
pnpm --filter trip-planner-worker producer
pnpm --filter trip-planner-worker worker
pnpm --filter trip-planner-worker post-more
```

For TLS, omit `NZOVU_INSECURE`, provide `NODE_EXTRA_CA_CERTS` for a private CA, and
set `NZOVU_API_KEY` when required. See the [shared setup](../README.md).

Priorities use the server's 0–4 range. Queue lease policies use protobuf durations
such as `{ seconds: "300", nanos: 0 }`. The worker retains the returned worker and
attempt IDs, heartbeats while processing, and acknowledges completion or failure.
The queue retains messages for two days for inspection. SIGINT/SIGTERM disconnects
the worker; unfinished work can be reclaimed after lease expiry.

`make check-examples` compiles the producer, worker and `post-more-trips.ts`.
Built entry points are `dist/src/producer.js`, `dist/src/worker.js` and
`dist/post-more-trips.js`. Live validation runs both producers and idle shutdown
against SQLite and PostgreSQL.
