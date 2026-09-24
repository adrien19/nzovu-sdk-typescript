# @nzovu/proto

Generated TypeScript codecs and gRPC definitions for
`nzovu.api.queueservice.v1.QueueService`. This workspace package is private;
packaging and publication are disabled.

## Build and verify

Run from the repository root after the frozen dependency install:

```sh
make gen-proto
make build-proto
make test-proto
make check-generated
```

Sources are pinned by commit and SHA-256 checksums in `proto/SOURCE.json`.
`make check-proto` rejects missing, added or modified sources. To update them,
use `make update-proto SOURCE=/path/to/server COMMIT=<full-commit-sha>`.
Generation uses protoc 33.1.0 and ts-proto 2.8.3 from the lockfile; no downloads
or dependency installation occur during generation.

Canonical descriptor paths begin with `proto/`, matching the server imports.
Outputs live in `src/generated/proto/`; Google well-known types are under
`src/generated/google/protobuf/`. Generated files are local build outputs.
Never edit them manually.

## Namespaces and codecs

```typescript
import {
  Common,
  Message,
  Queue,
  QueueService,
  QueueServiceTypes,
} from "@nzovu/proto";

const queue = Queue.Queue.fromPartial({ name: "tasks" });
const message = Message.Message.fromPartial({
  messageId: "task-1",
  metadata: {
    payload: Common.Payload.fromPartial({
      data: { task: "resize" },
      contentType: "application/json",
    }),
    priority: "0",
    headers: [{ key: "x-request", value: new Uint8Array([1, 2, 3]) }],
  },
});
const bytes = Message.Message.encode(message).finish();
const decoded = Message.Message.decode(bytes);
const request = QueueServiceTypes.PostMessageRequest.fromPartial({
  queueName: queue.name,
  message: decoded,
});
```

`QueueService.QueueServiceClient` is the raw gRPC client. The separate
`@nzovu/client` workspace provides Promise-based resource methods.

Int64 values use strings; bytes use `Uint8Array` (Node `Buffer` is accepted as
input). Optional scalar presence is retained, including explicit zero renewal
limits. Durations contain seconds/nanos. Timestamp fields currently use `Date`,
which has millisecond precision; do not assume nanosecond preservation for dates.

Both CommonJS `require('@nzovu/proto')` and ESM imports from the built package are
supported. Type declarations are emitted alongside CommonJS output in `lib/`.
