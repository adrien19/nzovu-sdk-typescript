import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { NzovuClient } from "@nzovu/client";
import { QueueService } from "@nzovu/proto";
import { createMCPServer } from "@nzovu/mcp-server";
const require = createRequire(import.meta.url);
const grpc = createRequire(require.resolve("@nzovu/client"))("@grpc/grpc-js");
const fromMcp = createRequire(require.resolve("@nzovu/mcp-server"));
const { Client } = fromMcp("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = fromMcp(
  "@modelcontextprotocol/sdk/client/stdio.js",
);
assert.equal(typeof NzovuClient, "function");
assert.equal(typeof createMCPServer, "function");
const server = new grpc.Server();
server.addService(QueueService.QueueServiceService, {
  listQueues(call, callback) {
    assert.equal(call.metadata.get("api-key")[0], "consumer-fixture-key");
    callback(null, {
      queues: [{ name: "consumer-fixture" }],
      nextPageToken: "next-page",
    });
  },
});
const port = await new Promise((resolve, reject) =>
  server.bindAsync(
    "127.0.0.1:0",
    grpc.ServerCredentials.createInsecure(),
    (error, value) => (error ? reject(error) : resolve(value)),
  ),
);
const client = new Client({ name: "distribution-check", version: "0.0.1" });
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("NZOVU_")),
);
const transport = new StdioClientTransport({
  command: join(process.cwd(), "node_modules/.bin/nzovu-mcp"),
  env: {
    ...env,
    NZOVU_ADDRESS: `127.0.0.1:${port}`,
    NZOVU_INSECURE: "true",
    NZOVU_API_KEY: "consumer-fixture-key",
  },
  stderr: "pipe",
});
let diagnostics = "";
transport.stderr.on("data", (chunk) => {
  diagnostics += chunk;
});
try {
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 31);
  const result = await client.callTool({
    name: "list_queues",
    arguments: { pageSize: 1 },
  });
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.queues[0].name, "consumer-fixture");
  assert.equal(result.structuredContent.nextPageToken, "next-page");
  assert.deepEqual(
    JSON.parse(result.content[0].text),
    result.structuredContent,
  );
  assert.ok(!diagnostics.includes("consumer-fixture-key"));
} finally {
  await client.close();
  server.forceShutdown();
}
