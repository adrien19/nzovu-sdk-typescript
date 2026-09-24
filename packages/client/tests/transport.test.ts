import * as grpc from "@grpc/grpc-js";
import { QueueService, QueueServiceTypes as R } from "@nzovu/proto";
import { Connection, RpcMethod } from "../src/connection";
import { ErrorCode } from "../src/types";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";

const servers: grpc.Server[] = [];
const connections: Connection[] = [];
async function serve(
  handlers: grpc.UntypedServiceImplementation,
  credentials = grpc.ServerCredentials.createInsecure(),
) {
  const server = new grpc.Server();
  servers.push(server);
  server.addService(QueueService.QueueServiceService, handlers);
  const port = await new Promise<number>((resolve, reject) =>
    server.bindAsync("127.0.0.1:0", credentials, (error, port) =>
      error ? reject(error) : resolve(port),
    ),
  );
  return `127.0.0.1:${port}`;
}
async function connect(
  address: string,
  options: Record<string, any> = {},
  timeout = 1000,
) {
  const connection = new Connection(
    { address, insecure: true, ...options },
    timeout,
  );
  connections.push(connection);
  await connection.connect();
  return connection;
}
afterEach(async () => {
  for (const connection of connections.splice(0)) await connection.disconnect();
  for (const server of servers.splice(0)) server.forceShutdown();
});
const error = (code: grpc.status, details = "failure") => ({ code, details });

it("attaches API-key and finite deadline to every one of the 31 RPCs", async () => {
  const seen: string[] = [];
  const handlers = Object.fromEntries(
    Object.entries(QueueService.QueueServiceService).map(
      ([method, descriptor]) => [
        method,
        (call: any, cb: any) => {
          expect(call.metadata.get("api-key")).toEqual(["test-key"]);
          expect(Number(call.getDeadline())).toBeGreaterThan(Date.now());
          expect(Number(call.getDeadline())).toBeLessThanOrEqual(
            Date.now() + 1000,
          );
          seen.push(method);
          cb(null, descriptor.responseDeserialize(Buffer.alloc(0)));
        },
      ],
    ),
  );
  const connection = await connect(await serve(handlers), {
    apiKey: "test-key",
  });
  for (const [method, descriptor] of Object.entries(
    QueueService.QueueServiceService,
  )) {
    await new Promise((resolve, reject) => {
      const call = connection.getQueueServiceClient()[
        method as RpcMethod
      ] as any;
      call(
        descriptor.requestDeserialize(Buffer.alloc(0)),
        (err: Error, result: any) => (err ? reject(err) : resolve(result)),
      );
    });
  }
  expect(seen.sort()).toEqual(
    Object.keys(QueueService.QueueServiceService).sort(),
  );
});
it("retries only read-only UNAVAILABLE failures", async () => {
  let reads = 0,
    writes = 0;
  const address = await serve({
    listQueues: (_call: any, cb: any) =>
      ++reads === 1
        ? cb(error(grpc.status.UNAVAILABLE))
        : cb(null, { queues: [], nextPageToken: "" }),
    postMessage: (_call: any, cb: any) => {
      writes++;
      cb(error(grpc.status.UNAVAILABLE));
    },
  });
  const c = await connect(address, { retry: { baseDelay: 1, maxDelay: 2 } });
  await c.invoke("listQueues", R.ListQueuesRequest.fromPartial({}));
  await expect(
    c.invoke("postMessage", R.PostMessageRequest.fromPartial({})),
  ).rejects.toMatchObject({ grpcCode: grpc.status.UNAVAILABLE });
  expect(reads).toBe(2);
  expect(writes).toBe(1);
});
it.each(Array.from({ length: 16 }, (_, i) => i + 1))(
  "retains exact gRPC status %i, details, trailers, and cause",
  async (code) => {
    const trailers = new grpc.Metadata();
    trailers.set("reason", "test");
    trailers.set("grpc-status-details-bin", Buffer.from([0, 1, 255]));
    const c = await connect(
      await serve({
        getSchema: (_call: any, cb: any) =>
          cb({ code, details: "exact detail", metadata: trailers }),
      }),
      { retry: { enabled: false } },
    );
    try {
      await c.invoke(
        "getSchema",
        R.GetSchemaRequest.fromPartial({ schemaId: "s" }),
      );
      throw new Error("expected rejection");
    } catch (failure: any) {
      expect(failure.grpcCode).toBe(code);
      expect(failure.details).toBe("exact detail");
      expect(failure.cause.code).toBe(code);
      expect(failure.trailers.get("reason")).toEqual(["test"]);
      expect(failure.trailers.get("grpc-status-details-bin")).toEqual([
        Buffer.from([0, 1, 255]),
      ]);
    }
  },
);
it("enforces one deadline across attempts and backoff", async () => {
  const deadlines: number[] = [];
  const c = await connect(
    await serve({
      listQueues: (call: any, cb: any) => {
        deadlines.push(Number(call.getDeadline()));
        cb(error(grpc.status.UNAVAILABLE));
      },
    }),
    { retry: { maxRetries: 100, baseDelay: 10, maxDelay: 20 } },
    80,
  );
  const start = Date.now();
  await expect(
    c.invoke("listQueues", R.ListQueuesRequest.fromPartial({})),
  ).rejects.toBeDefined();
  expect(Date.now() - start).toBeLessThan(300);
  expect(deadlines.length).toBeGreaterThan(1);
  expect(Math.max(...deadlines) - Math.min(...deadlines)).toBeLessThanOrEqual(
    3,
  );
});
it("cancels outstanding calls, bounds admission, and ignores late responses", async () => {
  let answer: any;
  const c = await connect(
    await serve({
      getSchema: (_call: any, cb: any) => {
        answer = cb;
      },
    }),
    { maxInFlight: 1 },
  );
  const pending = c.invoke("getSchema", R.GetSchemaRequest.fromPartial({}));
  const checked = expect(pending).rejects.toMatchObject({
    code: ErrorCode.CANCELLED,
  });
  await expect(
    c.invoke("getSchema", R.GetSchemaRequest.fromPartial({})),
  ).rejects.toMatchObject({ code: ErrorCode.RESOURCE_EXHAUSTED });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await c.disconnect();
  await checked;
  answer?.(null, {});
  expect(c.isConnected()).toBe(false);
});
it("aborts retry backoff without another request", async () => {
  let count = 0;
  const c = await connect(
    await serve({
      listQueues: (_call: any, cb: any) => {
        count++;
        cb(error(grpc.status.UNAVAILABLE));
      },
    }),
    { retry: { baseDelay: 500, maxDelay: 500 } },
  );
  const controller = new AbortController();
  const promise = c.invoke("listQueues", R.ListQueuesRequest.fromPartial({}), {
    signal: controller.signal,
  });
  const checked = expect(promise).rejects.toMatchObject({
    code: ErrorCode.CANCELLED,
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  controller.abort();
  await checked;
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(count).toBe(1);
});
it("enforces request timeout on an unresponsive server", async () => {
  const c = await connect(await serve({ getSchema: () => {} }));
  await expect(
    c.invoke("getSchema", R.GetSchemaRequest.fromPartial({}), {
      timeoutMs: 30,
    }),
  ).rejects.toMatchObject({ code: ErrorCode.DEADLINE_EXCEEDED });
});
it("rejects invalid credential and timeout configuration", () => {
  for (const options of [
    { insecure: true, tls: {} },
    { tls: { cert: Buffer.from("cert") } },
    { apiKey: "\nsecret" },
    { timeout: 0 },
    { maxInFlight: 0 },
    { credentials: grpc.credentials.createInsecure(), insecure: true },
  ]) {
    expect(
      () => new Connection({ address: "localhost:9000", ...options }),
    ).toThrow();
  }
});
it("uses TLS by default, honors custom CA, and authenticates mTLS", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nzovu-tls-"));
  const openssl = (...args: string[]) =>
    execFileSync("openssl", args, { cwd: directory, stdio: "ignore" });
  try {
    openssl(
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      "ca.key",
      "-out",
      "ca.pem",
      "-days",
      "1",
      "-subj",
      "/CN=Test CA",
    );
    writeFileSync(
      join(directory, "extensions"),
      "subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth,clientAuth\n",
    );
    openssl(
      "req",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      "peer.key",
      "-out",
      "peer.csr",
      "-subj",
      "/CN=localhost",
    );
    openssl(
      "x509",
      "-req",
      "-in",
      "peer.csr",
      "-CA",
      "ca.pem",
      "-CAkey",
      "ca.key",
      "-CAcreateserial",
      "-out",
      "peer.pem",
      "-days",
      "1",
      "-extfile",
      "extensions",
    );
    const ca = readFileSync(join(directory, "ca.pem")),
      key = readFileSync(join(directory, "peer.key")),
      cert = readFileSync(join(directory, "peer.pem"));
    const handlers = {
      listQueues: (_call: any, cb: any) =>
        cb(null, { queues: [], nextPageToken: "" }),
    };
    const address = await serve(
      handlers,
      grpc.ServerCredentials.createSsl(
        ca,
        [{ private_key: key, cert_chain: cert }],
        false,
      ),
    );
    const tls = await connect(address, { insecure: undefined, tls: { ca } });
    await expect(
      tls.invoke("listQueues", R.ListQueuesRequest.fromPartial({})),
    ).resolves.toMatchObject({ queues: [] });
    const mtlsAddress = await serve(
      handlers,
      grpc.ServerCredentials.createSsl(
        ca,
        [{ private_key: key, cert_chain: cert }],
        true,
      ),
    );
    const mtls = await connect(mtlsAddress, {
      insecure: undefined,
      tls: { ca, cert, key },
    });
    await expect(
      mtls.invoke("listQueues", R.ListQueuesRequest.fromPartial({})),
    ).resolves.toBeDefined();
    await expect(
      connect(mtlsAddress, { insecure: undefined, tls: { ca }, timeout: 100 }),
    ).rejects.toThrow();
    await expect(
      connect(address, { insecure: undefined, timeout: 100 }),
    ).rejects.toThrow();
    const plaintext = await serve(handlers);
    await expect(
      connect(plaintext, { insecure: undefined, timeout: 100 }),
    ).rejects.toThrow();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 15000);
