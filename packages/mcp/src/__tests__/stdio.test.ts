import { afterEach, expect, it } from 'vitest';
import * as grpc from '@grpc/grpc-js';
import { QueueService, QueueServiceTypes as R } from '@nzovu/client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { allTools, definitions } from '../tools/index.js';
import { ToolName } from '../tools/validation.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const servers: grpc.Server[] = [];
const clients: Client[] = [];
const transports: StdioClientTransport[] = [];
const activeHandlers: Promise<void>[] = [];
async function serve(
  handlers: grpc.UntypedServiceImplementation,
  credentials = grpc.ServerCredentials.createInsecure()
) {
  const server = new grpc.Server();
  servers.push(server);
  server.addService(QueueService.QueueServiceService, handlers);
  return `127.0.0.1:${await new Promise<number>((resolve, reject) => server.bindAsync('127.0.0.1:0', credentials, (error, port) => (error ? reject(error) : resolve(port))))}`;
}
async function start(address: string, env: Record<string, string> = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve('dist/index.js')],
    env: {
      NZOVU_ADDRESS: address,
      NZOVU_INSECURE: 'true',
      NZOVU_API_KEY: 'test-secret',
      NZOVU_TIMEOUT: '500ms',
      ...env,
    },
    stderr: 'pipe',
  });
  transports.push(transport);
  let stderr = '';
  transport.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  const client = new Client({ name: 'test', version: '1' });
  clients.push(client);
  await client.connect(transport);
  return { client, transport, stderr: () => stderr };
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(transports.splice(0).map((transport) => transport.close()));
  for (const server of servers.splice(0)) server.forceShutdown();
  await Promise.all(activeHandlers.splice(0));
});
const calendar = {
  type: 2,
  rules: [{ daily: {}, executionTimes: [{ hour: 9 }] }],
  timezone: 'UTC',
};
const owner = { queueName: 'q', messageId: 'm', workerId: 'w', attemptId: 'a' };
const args: Record<ToolName, Record<string, unknown>> = {
  create_queue: { name: 'q', metadata: { leasePolicy: { maxRenewals: 0 } } },
  delete_queue: { name: 'q' },
  get_queue_state: { queueName: 'q' },
  list_queues: { pageSize: 1, pageToken: 'opaque', prefix: 'q' },
  post_message: {
    queueName: 'q',
    message: {
      messageId: 'm',
      metadata: { priority: '0', headers: [{ key: 'x', value: 'AP8=' }] },
    },
  },
  post_messages_bulk: {
    queueName: 'q',
    transactionMode: 1,
    messages: [
      { messageId: 'm', metadata: { priority: '0' } },
      { messageId: 'bad id', metadata: { priority: '5' } },
    ],
  },
  get_next_message: {
    queueName: 'q',
    workerId: 'w',
    attemptId: 'a',
    leaseDuration: { seconds: '1', nanos: 1 },
  },
  acknowledge_message: { ...owner, state: 3 },
  cancel_message: { queueName: 'q', messageId: 'm', reason: 'stop' },
  send_message_heartbeat: owner,
  renew_message_lease: { ...owner, leaseDuration: { seconds: '2', nanos: 1 } },
  peek_messages: {
    queueName: 'q',
    pageSize: 1,
    pageToken: 'opaque',
    priorityRange: { min: '0', max: '4' },
  },
  create_schedule: {
    schedule: {
      scheduleId: 's',
      metadata: { queueName: 'q', calendarSchedule: calendar, priority: '0' },
    },
  },
  get_schedule: { scheduleId: 's' },
  delete_schedule: { scheduleId: 's' },
  pause_schedule: { scheduleId: 's' },
  resume_schedule: { scheduleId: 's' },
  list_schedules: { prefix: 's', pageToken: 'opaque' },
  get_schedule_history: { scheduleId: 's', pageToken: 'opaque' },
  validate_calendar_schedule: { calendarSchedule: calendar },
  preview_calendar_schedule: { calendarSchedule: calendar, count: 2 },
  get_dlq_messages: { dlqName: 'd', pageToken: 'opaque' },
  requeue_from_dlq: { dlqName: 'd', messageId: 'm', targetQueue: 'q' },
  delete_from_dlq: { dlqName: 'd', messageId: 'm' },
  purge_dlq: { dlqName: 'd' },
  get_dlq_stats: { dlqName: 'd' },
  register_schema: {
    schemaId: 's',
    name: 'Schema',
    content: '{}',
    contentType: 'json-schema',
    metadata: { owner: 'test' },
  },
  get_schema: { schemaId: 's', version: 2 },
  delete_schema: { schemaId: 's', version: 0 },
  list_schemas: { prefix: 's', pageSize: 1, pageToken: 'opaque', activeOnly: false },
  validate_payload: { schemaId: 's', version: 2, payload: { a: 1 } },
};
it('executes every registered tool through the built stdio CLI and real gRPC codecs', async () => {
  const seen: Record<string, any> = {};
  const handlers = Object.fromEntries(
    Object.entries(QueueService.QueueServiceService).map(([rpc, descriptor]) => [
      rpc,
      (call: any, callback: any) => {
        expect(call.metadata.get('api-key')).toEqual(['test-secret']);
        expect(Number(call.getDeadline())).toBeGreaterThan(Date.now());
        seen[rpc] = call.request;
        const response: any = descriptor.responseDeserialize(Buffer.alloc(0));
        if ('success' in response) response.success = true;
        if ('nextPageToken' in response) response.nextPageToken = 'next-token';
        if ('remainingTime' in response) {
          response.remainingTime = { seconds: '1', nanos: 1 };
          response.state = 2;
        }
        if (rpc === 'getNextMessage')
          Object.assign(
            response,
            R.GetNextMessageResponse.fromPartial({
              message: { messageId: 'm' },
              workerId: 'w',
              attemptId: 'a',
            })
          );
        if (rpc === 'getQueueState') response.stateCounts = { RUNNING: '9007199254740993' };
        callback(null, response);
      },
    ])
  );
  const { client, stderr } = await start(await serve(handlers));
  expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual(
    allTools.map((tool) => tool.name).sort()
  );
  for (const tool of allTools) {
    const result = await client.callTool({
      name: tool.name,
      arguments: args[tool.name as ToolName],
    });
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    expect(result.structuredContent).toBeDefined();
    expect(seen[definitions[tool.name as ToolName].rpc]).toBeDefined();
  }
  expect(Object.keys(seen).sort()).toEqual(Object.keys(QueueService.QueueServiceService).sort());
  expect(seen.postMessage.message.metadata.priority).toBe('0');
  expect([...seen.postMessage.message.metadata.headers[0].value]).toEqual([0, 255]);
  expect(seen.createQueue.metadata.leasePolicy.maxRenewals).toBe(0);
  expect(seen.renewMessageLease).toMatchObject({
    workerId: 'w',
    attemptId: 'a',
    leaseDuration: { seconds: '2', nanos: 1 },
  });
  expect(seen.listQueues).toEqual({ prefix: 'q', pageSize: 1, pageToken: 'opaque' });
  expect(seen.validatePayload.payload).toBe('{"a":1}');
  expect(stderr()).not.toContain('test-secret');
}, 15000);
it('returns auth failures and deadline errors through stdio without printing credentials', async () => {
  const address = await serve({
    listQueues: (_call: any, cb: any) =>
      cb({ code: grpc.status.UNAUTHENTICATED, details: 'rejected test-secret' }),
    getSchema: () => {},
  });
  const { client, stderr } = await start(address, { NZOVU_TIMEOUT: '100ms' });
  const auth = await client.callTool({ name: 'list_queues', arguments: {} });
  expect(auth.isError).toBe(true);
  expect(auth.structuredContent).toMatchObject({
    error: { code: 'UNAUTHENTICATED', grpcCode: 16 },
  });
  expect(JSON.stringify(auth)).not.toContain('test-secret');
  const deadline = await client.callTool({ name: 'get_schema', arguments: { schemaId: 'slow' } });
  expect(deadline.structuredContent).toMatchObject({ error: { code: 'DEADLINE_EXCEEDED' } });
  expect(stderr()).not.toContain('test-secret');
});
it('propagates MCP cancellation to the underlying gRPC call', async () => {
  let began!: () => void, cancelled!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  const stopped = new Promise<void>((resolve) => {
    cancelled = resolve;
  });
  activeHandlers.push(stopped);
  const { client } = await start(
    await serve({
      getSchema: (call: any) => {
        call.on('cancelled', cancelled);
        began();
      },
    }),
    { NZOVU_TIMEOUT: '5s' }
  );
  const controller = new AbortController();
  const operation = client.callTool(
    { name: 'get_schema', arguments: { schemaId: 'slow' } },
    undefined,
    { signal: controller.signal }
  );
  const checked = expect(operation).rejects.toBeDefined();
  await started;
  controller.abort();
  await checked;
  await stopped;
});
it.each(['SIGINT', 'SIGTERM'] as const)('exits cleanly on %s', async (signal) => {
  const { client, transport } = await start(await serve({}));
  let closed!: () => void;
  const done = new Promise<void>((resolve) => {
    closed = resolve;
  });
  client.onclose = closed;
  process.kill(transport.pid!, signal);
  await done;
});
it('closes promptly on stdio EOF', async () => {
  const { client, transport } = await start(await serve({}));
  const pid = transport.pid!;
  const began = Date.now();
  await client.close();
  expect(Date.now() - began).toBeLessThan(1000);
  expect(() => process.kill(pid, 0)).toThrow();
});
it('honors custom CA and mTLS env paths in the built CLI', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nzovu-mcp-tls-'));
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        join(dir, 'key.pem'),
        '-out',
        join(dir, 'cert.pem'),
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
      ],
      { stdio: 'ignore' }
    );
    const cert = readFileSync(join(dir, 'cert.pem')),
      key = readFileSync(join(dir, 'key.pem'));
    const handlers = {
      listQueues: (_call: any, cb: any) => cb(null, { queues: [], nextPageToken: '' }),
    };
    for (const mtls of [false, true]) {
      const address = await serve(
        handlers,
        grpc.ServerCredentials.createSsl(cert, [{ private_key: key, cert_chain: cert }], mtls)
      );
      const { client } = await start(address, {
        NZOVU_INSECURE: 'false',
        NZOVU_CA_PATH: join(dir, 'cert.pem'),
        ...(mtls
          ? { NZOVU_CERT_PATH: join(dir, 'cert.pem'), NZOVU_KEY_PATH: join(dir, 'key.pem') }
          : {}),
      });
      expect((await client.callTool({ name: 'list_queues', arguments: {} })).isError).not.toBe(
        true
      );
    }
    await expect(
      start(await serve(handlers), { NZOVU_INSECURE: 'false', NZOVU_TIMEOUT: '100ms' })
    ).rejects.toBeDefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 15000);
