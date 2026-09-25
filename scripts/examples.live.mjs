import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { NzovuClient, SilentLogger } from "@nzovu/client";
const exec = promisify(execFile);
const config = JSON.parse(readFileSync(process.env.NZOVU_LIVE_CONFIG, "utf8"));
const examples = new URL("../packages/examples/", import.meta.url).pathname;
for (const backend of ["sqlite", "postgres"]) {
  test(
    `${backend}: compiled examples connect, publish and shut down`,
    { timeout: 120000 },
    async () => {
      const address = `${config.host}:${config.backends[backend].tls}`;
      const env = {
        ...process.env,
        NZOVU_ADDRESS: address,
        NZOVU_API_KEY: config.api_key,
        NZOVU_INSECURE: "false",
        NODE_EXTRA_CA_CERTS: join(config.directory, "ca.crt"),
      };
      const client = new NzovuClient({
        connection: {
          address,
          apiKey: config.api_key,
          tls: { ca: readFileSync(env.NODE_EXTRA_CA_CERTS) },
        },
        logger: new SilentLogger(),
      });
      await client.connect();
      const before = new Set(
        (await client.queues.listQueues({ pageSize: 1000 })).queues.map(
          (q) => q.name,
        ),
      );
      const workers = [
        ["dist/worker.js", "email-reminders"],
        ["dist/long-running-worker.js", "long-running-tasks"],
        ["agent-worker/dist/worker.js", "agent-tasks"],
        ["trip-planner-worker/dist/src/worker.js", "trip-planning-requests"],
      ];
      try {
        for (const [entry, queue] of workers) {
          await client.queues.createQueue(queue);
          const child = spawn(process.execPath, [join(examples, entry)], {
            env,
            stdio: ["ignore", "pipe", "pipe"],
          });
          let output = "";
          child.stdout.on("data", (chunk) => {
            output += chunk;
          });
          child.stderr.on("data", (chunk) => {
            output += chunk;
          });
          const exit = new Promise((resolve, reject) => {
            child.once("error", reject);
            child.once("exit", (code, signal) => resolve({ code, signal }));
          });
          try {
            await delay(1200);
            assert.equal(child.exitCode, null, output);
            child.kill("SIGTERM");
            const result = await Promise.race([
              exit,
              delay(10000, undefined, { ref: false }).then(() => {
                throw new Error(`Worker shutdown timed out: ${entry}`);
              }),
            ]);
            assert.deepEqual(result, { code: 0, signal: null }, output);
            assert.ok(
              !/Error:|CONNECTION_FAILED|UNAUTHENTICATED/.test(output),
              output,
            );
          } finally {
            if (child.exitCode === null && child.signalCode === null)
              child.kill("SIGKILL");
          }
          await client.queues.deleteQueue(queue);
        }
        for (const entry of [
          "dist/notification-service.js",
          "dist/lease-policy-example.js",
          "dist/long-running-publisher.js",
          "dist/message-retention-policy.js",
          "dist/bulk-message-posting.js",
          "dist/logging-best-practices.js",
          "agent-worker/dist/producer.js",
          "trip-planner-worker/dist/src/producer.js",
          "trip-planner-worker/dist/post-more-trips.js",
        ]) {
          const result = await exec(process.execPath, [join(examples, entry)], {
            env,
            timeout: 30000,
            maxBuffer: 2 * 1024 * 1024,
          });
          assert.ok(
            !/Error:|Examples require a running/.test(
              result.stdout + result.stderr,
            ),
            entry + ": " + result.stdout + result.stderr,
          );
        }
        const page = await client.messages.peekQueueMessages("email-reminders");
        assert.equal(page.messages[0].metadata.priority, "2");
        assert.ok(
          (await client.messages.peekQueueMessages("agent-tasks")).messages
            .length >= 3,
        );
        assert.ok(
          (await client.messages.peekQueueMessages("trip-planning-requests"))
            .messages.length >= 3,
        );
      } finally {
        try {
          for (const queue of (
            await client.queues.listQueues({ pageSize: 1000 })
          ).queues)
            if (!before.has(queue.name))
              await client.queues.deleteQueue(queue.name);
        } finally {
          await client.disconnect();
        }
      }
    },
  );
}
