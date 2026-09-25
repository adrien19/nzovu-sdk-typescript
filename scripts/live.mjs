import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { NzovuClient, Message, Queue, SilentLogger } from "@nzovu/client";
import { handleToolCall } from "../packages/mcp/dist/tools/handlers.js";
import { allTools } from "../packages/mcp/dist/tools/index.js";
const require = createRequire(
  new URL("../packages/mcp/package.json", import.meta.url),
);
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StdioClientTransport,
} = require("@modelcontextprotocol/sdk/client/stdio.js");
const config = JSON.parse(readFileSync(process.env.NZOVU_LIVE_CONFIG, "utf8"));
assert.deepEqual(Object.keys(config.backends).sort(), ["postgres", "sqlite"]);
const seconds = (value) => ({ seconds: String(value), nanos: 0 });
const unique = () => `ts_${randomUUID().replaceAll("-", "")}`;
const message = (id, priority = "2") => ({
  messageId: id,
  metadata: {
    priority,
    payload: { data: { value: 1 }, contentType: "application/json" },
    headers: [
      { key: "x-fixture", value: "AAH/" },
      { key: "x-fixture", value: "Ag==" },
    ],
  },
});
async function eventually(operation, predicate, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (true) {
    const result = await operation();
    if (predicate(result)) return result;
    assert.ok(Date.now() < deadline, `Timed out: ${JSON.stringify(result)}`);
    await delay(150);
  }
}
function options(backend, mode, apiKey = config.api_key) {
  return {
    connection: {
      address: `${config.host}:${config.backends[backend][mode]}`,
      apiKey,
      timeout: 2000,
      tls: {
        ca: readFileSync(join(config.directory, "ca.crt")),
        ...(mode === "mtls"
          ? {
              cert: readFileSync(join(config.directory, "client.crt")),
              key: readFileSync(join(config.directory, "client.key")),
            }
          : {}),
      },
    },
    requestTimeout: 4000,
    logger: new SilentLogger(),
  };
}
async function open(backend, mode, surface) {
  if (surface === "sdk") {
    const client = new NzovuClient(options(backend, mode));
    await client.connect();
    return {
      call: (name, args) => handleToolCall(name, args, client),
      close: () => client.disconnect(),
    };
  }
  const client = new Client({
    name: "nzovu-live-validation",
    version: "0.0.1",
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [new URL("../packages/mcp/dist/index.js", import.meta.url).pathname],
    env: {
      ...process.env,
      NZOVU_ADDRESS: `${config.host}:${config.backends[backend][mode]}`,
      NZOVU_API_KEY: config.api_key,
      NZOVU_CA_PATH: join(config.directory, "ca.crt"),
      NZOVU_INSECURE: "false",
      NZOVU_TIMEOUT: "4s",
      ...(mode === "mtls"
        ? {
            NZOVU_CERT_PATH: join(config.directory, "client.crt"),
            NZOVU_KEY_PATH: join(config.directory, "client.key"),
          }
        : {}),
    },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) =>
    assert.ok(!chunk.toString().includes(config.api_key)),
  );
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, allTools.length);
  return {
    call: async (name, args) => {
      const result = await client.callTool({ name, arguments: args });
      const data = result.structuredContent;
      assert.deepEqual(JSON.parse(result.content[0].text), data);
      if (result.isError)
        throw Object.assign(new Error(data.error.details), {
          code: data.error.code,
        });
      return data;
    },
    close: () => client.close(),
  };
}
for (const backend of ["sqlite", "postgres"]) {
  for (const mode of ["tls", "mtls"]) {
    for (const surface of ["sdk", "mcp"]) {
      test(
        `${backend}/${mode}/${surface}: all RPCs, pages, bulk, schemas, schedules and DLQ`,
        { timeout: 120000 },
        async () => {
          const api = await open(backend, mode, surface);
          const seen = new Set();
          const call = async (name, args = {}) => {
            seen.add(name);
            return api.call(name, args);
          };
          const prefix = unique(),
            queueName = prefix + "_a",
            dlqName = prefix + "_dlq";
          const queues = [queueName, prefix + "_b", prefix + "_c"];
          const metadata = {
            defaultMaxAttempts: 1,
            autoCreateDlq: false,
            deadLetterQueueName: dlqName,
            leasePolicy: {
              baseLease: seconds(30),
              maxExtension: seconds(120),
              heartbeatTimeout: seconds(20),
              extendStep: seconds(5),
            },
          };
          try {
            await call("create_queue", { name: dlqName });
            for (const name of queues)
              assert.equal(
                (await call("create_queue", { name, metadata })).success,
                true,
              );
            const page = await call("list_queues", { prefix, pageSize: 1 });
            assert.equal(page.queues.length, 1);
            assert.ok(page.nextPageToken);
            const next = await call("list_queues", {
              prefix,
              pageSize: 1,
              pageToken: page.nextPageToken,
            });
            assert.notEqual(next.queues[0].name, page.queues[0].name);
            await call("post_message", {
              queueName,
              message: message("duplicate"),
            });
            await assert.rejects(
              call("post_messages_bulk", {
                queueName,
                messages: [message("new"), message("duplicate")],
                transactionMode: 0,
              }),
            );
            assert.equal(
              (await call("peek_messages", { queueName })).messages.length,
              1,
            );
            const bulk = await call("post_messages_bulk", {
              queueName,
              messages: [message("new", "4"), message("duplicate")],
              transactionMode: 1,
            });
            assert.equal(bulk.successfulCount, 1);
            assert.equal(bulk.failedCount, 1);
            assert.equal(bulk.results.length, 2);
            const peek = await call("peek_messages", {
              queueName,
              pageSize: 1,
            });
            assert.equal(peek.messages.length, 1);
            assert.ok(peek.nextPageToken);
            assert.equal(
              (
                await call("peek_messages", {
                  queueName,
                  pageSize: 1,
                  pageToken: peek.nextPageToken,
                })
              ).messages.length,
              1,
            );
            const acquired = await call("get_next_message", {
              queueName,
              workerId: "fixture-worker",
            });
            assert.equal(acquired.message.messageId, "new");
            assert.deepEqual(
              acquired.message.metadata.headers,
              message("new").metadata.headers,
            );
            const owner = {
              queueName,
              messageId: acquired.message.messageId,
              workerId: acquired.workerId,
              attemptId: acquired.attemptId,
            };
            await assert.rejects(
              call("acknowledge_message", {
                ...owner,
                attemptId: "wrong",
                state: 3,
              }),
              { code: "FAILED_PRECONDITION" },
            );
            assert.equal(
              (await call("send_message_heartbeat", owner)).state,
              2,
            );
            assert.equal(
              (
                await call("renew_message_lease", {
                  ...owner,
                  leaseDuration: seconds(1),
                })
              ).state,
              2,
            );
            assert.equal(
              (await call("acknowledge_message", { ...owner, state: 3 }))
                .success,
              true,
            );
            assert.equal(
              (
                await call("cancel_message", {
                  queueName,
                  messageId: "duplicate",
                  reason: "fixture",
                })
              ).success,
              true,
            );
            assert.ok(
              (await call("get_queue_state", { queueName })).stateCounts,
            );

            const schemaId = prefix + "_schema";
            const schemaArgs = {
              schemaId,
              name: "Fixture",
              content: JSON.stringify({
                type: "object",
                required: ["value"],
                properties: { value: { type: "integer" } },
              }),
            };
            const first = await call("register_schema", schemaArgs);
            const second = await call("register_schema", schemaArgs);
            assert.equal(second.version, first.version + 1);
            assert.equal(
              (await call("get_schema", { schemaId, version: first.version }))
                .schema.schemaId,
              schemaId,
            );
            assert.equal(
              (await call("list_schemas", { prefix: schemaId, pageSize: 1 }))
                .schemas.length,
              1,
            );
            assert.equal(
              (
                await call("validate_payload", {
                  schemaId,
                  payload: { value: 1 },
                })
              ).valid,
              true,
            );
            const invalid = await call("validate_payload", {
              schemaId,
              payload: { value: "bad" },
            });
            assert.equal(invalid.valid, false);
            assert.ok(invalid.errors.length);
            assert.ok(
              (await call("delete_schema", { schemaId, version: 0 }))
                .versionsDeleted >= 2,
            );

            const calendarSchedule = {
              type: 2,
              timezone: "UTC",
              rules: [
                {
                  daily: { dayInterval: 1 },
                  executionTimes: [{ hour: 8, minute: 0, second: 0 }],
                },
              ],
            };
            assert.equal(
              (await call("validate_calendar_schedule", { calendarSchedule }))
                .valid,
              true,
            );
            const preview = await call("preview_calendar_schedule", {
              calendarSchedule,
              count: 2,
            });
            assert.equal(preview.executionTimes.length, 2);
            assert.equal(typeof preview.executionTimes[0].seconds, "string");
            const scheduleId = prefix + "_schedule";
            await call("create_schedule", {
              schedule: {
                scheduleId,
                metadata: {
                  queueName,
                  cronSchedule: "@every 1s",
                  payload: {
                    data: { scheduled: true },
                    contentType: "application/json",
                  },
                },
              },
            });
            assert.equal(
              (await call("get_schedule", { scheduleId })).schedule.scheduleId,
              scheduleId,
            );
            assert.equal(
              (
                await call("list_schedules", {
                  prefix: scheduleId,
                  pageSize: 1,
                })
              ).schedules.length,
              1,
            );
            const history = await eventually(
              () => call("get_schedule_history", { scheduleId, pageSize: 1 }),
              (result) => result.scheduleHistory?.executions?.length,
            );
            assert.equal(history.scheduleHistory.executions[0].success, true);
            await call("pause_schedule", { scheduleId });
            await call("resume_schedule", { scheduleId });
            await call("delete_schedule", { scheduleId });

            const source = queues[1];
            for (let i = 0; i < 3; i++) {
              await call("post_message", {
                queueName: source,
                message: message(`failed_${i}`),
              });
              const a = await call("get_next_message", { queueName: source });
              await call("acknowledge_message", {
                queueName: source,
                messageId: a.message.messageId,
                workerId: a.workerId,
                attemptId: a.attemptId,
                state: 5,
              });
            }
            const failed = await eventually(
              () => call("get_dlq_messages", { dlqName }),
              (r) => r.messages.length === 3,
            );
            assert.equal(
              (await call("get_dlq_stats", { dlqName })).messageCount,
              "3",
            );
            const dlqPage = await call("get_dlq_messages", {
              dlqName,
              pageSize: 1,
            });
            assert.ok(dlqPage.nextPageToken);
            assert.equal(
              (
                await call("get_dlq_messages", {
                  dlqName,
                  pageSize: 1,
                  pageToken: dlqPage.nextPageToken,
                })
              ).messages.length,
              1,
            );
            await call("requeue_from_dlq", {
              dlqName,
              messageId: failed.messages[0].messageId,
              targetQueue: queues[2],
            });
            await call("delete_from_dlq", {
              dlqName,
              messageId: failed.messages[1].messageId,
            });
            await call("purge_dlq", { dlqName });
            assert.equal(
              (await call("get_dlq_messages", { dlqName })).messages.length,
              0,
            );
            for (const name of [...queues, dlqName])
              await call("delete_queue", { name });
            assert.deepEqual(
              [...seen].sort(),
              allTools.map((t) => t.name).sort(),
            );
          } finally {
            await api.close();
          }
        },
      );
    }
  }
  test(
    `${backend}: automatic heartbeat, exact claims, renewal limits and disconnect`,
    { timeout: 30000 },
    async () => {
      const client = new NzovuClient(options(backend, "tls"));
      await client.connect();
      const names = [unique(), unique()];
      try {
        for (const name of names) {
          await client.queues.createQueue(
            name,
            Queue.QueueMetadata.fromPartial({
              defaultMaxAttempts: 3,
              leasePolicy: {
                baseLease: seconds(10),
                maxExtension: seconds(30),
                heartbeatTimeout: seconds(2),
                extendStep: seconds(1),
                maxRenewals: 1,
              },
            }),
          );
          await client.messages.postMessage(
            name,
            Message.Message.fromJSON(message("same")),
          );
        }
        const acquired = [];
        for (const name of names)
          acquired.push(
            await client.messages.getNextMessage(
              name,
              undefined,
              undefined,
              true,
              100,
            ),
          );
        await delay(500);
        for (const { claim } of acquired) {
          assert.ok(client.messages.hasActiveHeartbeat(claim));
          await assert.rejects(
            client.messages.renewMessageLease(
              claim.queueName,
              claim.messageId,
              seconds(1),
              claim.workerId,
              claim.attemptId,
            ),
            { code: "FAILED_PRECONDITION" },
          );
          assert.ok(client.messages.hasActiveHeartbeat(claim));
          await assert.rejects(
            client.messages.acknowledgeMessage(
              claim.queueName,
              claim.messageId,
              3,
              claim.workerId,
              "stale",
            ),
            { code: "FAILED_PRECONDITION" },
          );
          assert.ok(client.messages.hasActiveHeartbeat(claim));
          await client.messages.acknowledgeMessage(
            claim.queueName,
            claim.messageId,
            3,
            claim.workerId,
            claim.attemptId,
          );
          assert.equal(client.messages.getHeartbeatHealth(claim), undefined);
        }
        for (const name of names) await client.queues.deleteQueue(name);
      } finally {
        await client.disconnect();
      }
    },
  );
  test(`${backend}: rejects missing/wrong API keys and invalid TLS trust`, async () => {
    for (const key of [undefined, "wrong-key"]) {
      const opts = options(backend, "tls");
      opts.connection.apiKey = key;
      const client = new NzovuClient(opts);
      try {
        await client.connect();
        await assert.rejects(client.queues.listQueues(), {
          code: "UNAUTHENTICATED",
        });
      } finally {
        await client.disconnect();
      }
    }
    const wrong = options(backend, "tls");
    wrong.connection.tls.ca = readFileSync(
      join(config.directory, "wrong-ca.crt"),
    );
    const untrusted = new NzovuClient(wrong);
    try {
      await assert.rejects(untrusted.connect());
    } finally {
      await untrusted.disconnect();
    }
  });
}
