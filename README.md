# Nzovu TypeScript SDK and MCP

A pnpm monorepo for the Nzovu gRPC client, generated protocol types and MCP server.
All packages are private at version `0.0.1-dev.0`. CI, packaging and publishing are
disabled; run validation locally. No release is ready.

| Workspace           | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `@nzovu/proto`      | Generated protobuf codecs and gRPC service definitions         |
| `@nzovu/client`     | Promise-based queue, message, schedule, schema and DLQ clients |
| `@nzovu/mcp-server` | MCP stdio server; executable `nzovu-mcp`                       |
| `@nzovu/examples`   | Usage examples                                                 |

The client and proto outputs are CommonJS with TypeScript declarations. The MCP
server uses ESM. Client depends on proto; MCP depends on client. Nested example
applications have their own manifests and require separate validation.

## Development

Use the [devcontainer](.devcontainer/README.md), which pins Node 22.23.2 and
pnpm 10.16.0. Compiler and test dependencies come from `pnpm-lock.yaml`.

```sh
make install-dev
make build-all
make test-all
make typecheck
make lint
make format FORMAT_FLAGS=--check
make check-generated
pnpm run check:identity
```

`make ci` runs these validation gates locally. It does not start GitHub Actions,
package archives or publication. Local builds emit JavaScript and declarations
for tests. All package manifests remain private; `prepack` and `prepublishOnly`
reject packaging/publication. Inactive workflow files live outside
`.github/workflows/` with `.disabled` extensions.

## Protocol sources

`proto/SOURCE.json` records the immutable Nzovu server commit and SHA-256 checksum
of every vendored source. Generation uses the locked `protoc` and `ts-proto`
versions; it neither downloads source nor installs tools.

```sh
make check-proto
make gen-proto
make check-generated
```

For an intentional protocol update, pass an existing local server Git checkout
and its full commit SHA. Committed bytes are used, including when that checkout
has uncommitted edits:

```sh
make update-proto SOURCE=/path/to/nzovu COMMIT=<full-40-character-commit>
make gen-proto
make ci
```

Review changes to the manifest, protocols and affected client contracts together.
The gRPC service is `nzovu.api.queueservice.v1.QueueService` on port 9000.

## Client usage

Run from the workspace after `make build-all`:

```typescript
import { NzovuClient, Queue } from "@nzovu/client";

const client = new NzovuClient({
  connection: { address: "localhost:9000", insecure: true },
});
await client.connect();
try {
  await client.queues.createQueue(
    "tasks",
    Queue.QueueMetadata.fromPartial({
      type: Queue.QueueType.SIMPLE,
      defaultMaxAttempts: 3,
    }),
  );
  console.log(await client.queues.getQueueState("tasks"));
} finally {
  await client.disconnect();
}
```

TLS is the default; local plaintext requires `insecure: true`. Configure
`connection.tls` for custom CA/mTLS and `connection.apiKey` for authentication.
See the [client API](packages/client/README.md) for deadlines and lease ownership.

## MCP

After building, start the stdio server locally:

```sh
NZOVU_ADDRESS=localhost:9000 pnpm --filter @nzovu/mcp-server start
```

MCP configuration uses `NZOVU_*` environment variables. See
[configuration and tools](packages/mcp/README.md). Protocol output uses stdout;
diagnostics use stderr.

## Documentation

- [Generated protocols](packages/proto/README.md)
- [Client API](packages/client/README.md)
- [MCP server](packages/mcp/README.md)
- [Local development](.devcontainer/README.md)

Licensed under the [MIT license](LICENCE).
