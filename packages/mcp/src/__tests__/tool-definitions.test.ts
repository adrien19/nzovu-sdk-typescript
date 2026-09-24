import { describe, expect, it } from 'vitest';
import { QueueServiceTypes } from '@nzovu/client';
import { allTools, definitions } from '../tools/index.js';
import { toolSchemas } from '../tools/validation.js';
import { loadConfig } from '../config.js';

describe('canonical tool definitions', () => {
  it('has 31 distinct tools and RPCs', () => {
    expect(allTools).toHaveLength(31);
    expect(new Set(allTools.map((tool) => tool.name)).size).toBe(31);
    expect(new Set(Object.values(definitions).map((tool) => tool.rpc)).size).toBe(31);
    expect(Object.keys(toolSchemas).sort()).toEqual(allTools.map((tool) => tool.name).sort());
    expect(QueueServiceTypes.PreviewCalendarScheduleRequest).toBeDefined();
  });
  it('marks reads and destructive operations accurately', () => {
    expect(
      allTools.find((tool) => tool.name === 'get_next_message')?.annotations?.readOnlyHint
    ).toBe(false);
    expect(allTools.find((tool) => tool.name === 'purge_dlq')?.annotations?.destructiveHint).toBe(
      true
    );
    expect(allTools.find((tool) => tool.name === 'list_schemas')?.annotations?.idempotentHint).toBe(
      true
    );
  });
  it('requires exact ownership and an explicit DLQ target', () => {
    for (const name of ['acknowledge_message', 'send_message_heartbeat', 'renew_message_lease']) {
      expect(allTools.find((tool) => tool.name === name)?.inputSchema.required).toEqual(
        expect.arrayContaining(['workerId', 'attemptId'])
      );
    }
    expect(
      allTools.find((tool) => tool.name === 'requeue_from_dlq')?.inputSchema.required
    ).toContain('targetQueue');
  });
  it.each([-1, 1001, 1.5])('rejects invalid page size %s', (pageSize) =>
    expect(() => toolSchemas.list_queues.parse({ pageSize })).toThrow()
  );
  it.each(['5', '-1', 2, 'bad'])('rejects invalid priority %s', (priority) =>
    expect(() =>
      toolSchemas.post_message.parse({
        queueName: 'q',
        message: { messageId: 'm', metadata: { priority } },
      })
    ).toThrow()
  );
  it('preserves zero priority and rejects runtime fields and legacy inputs', () => {
    expect(
      toolSchemas.post_message.parse({
        queueName: 'q',
        message: { messageId: 'm', metadata: { priority: '0' } },
      }).message.metadata.priority
    ).toBe('0');
    expect(() =>
      toolSchemas.post_message.parse({
        queueName: 'q',
        message: { messageId: 'm', metadata: { state: 1 } },
      })
    ).toThrow();
    expect(() => toolSchemas.list_queues.parse({ limit: 10 })).toThrow();
    expect(() => toolSchemas.get_next_message.parse({ queue_name: 'q' })).toThrow();
  });
  it('keeps BEST_EFFORT validation on the server', () => {
    expect(
      toolSchemas.post_messages_bulk.parse({
        queueName: 'q',
        transactionMode: 1,
        messages: [{ messageId: 'bad id', metadata: { priority: '5' } }],
      }).messages
    ).toHaveLength(1);
  });
  it.each(['x-nzovu-private', 'x-internal-private', 'x-system-private', 'UPPER'])(
    'rejects reserved/invalid headers %s',
    (key) =>
      expect(() =>
        toolSchemas.post_message.parse({
          queueName: 'q',
          message: { messageId: 'm', metadata: { headers: [{ key, value: '' }] } },
        })
      ).toThrow()
  );
  it('rejects invalid base64, fractional timestamps and malformed int64', () => {
    for (const metadata of [
      { headers: [{ key: 'x', value: 'invalid!' }] },
      { scheduledTime: { seconds: 'abc', nanos: 0 } },
      { scheduledTime: { seconds: '1', nanos: 0.5 } },
    ])
      expect(() =>
        toolSchemas.post_message.parse({ queueName: 'q', message: { messageId: 'm', metadata } })
      ).toThrow();
  });
});
describe('environment configuration', () => {
  it('defaults to TLS and permits standalone custom CA', () => {
    expect(loadConfig({}).insecure).toBe(false);
    expect(loadConfig({ NZOVU_CA_PATH: '/ca.pem' }).caPath).toBe('/ca.pem');
  });
  it.each([
    { NZOVU_INSECURE: 'yes' },
    { NZOVU_TIMEOUT: '0s' },
    { NZOVU_TIMEOUT: '1ns' },
    { NZOVU_TIMEOUT: 'Infinity' },
    { NZOVU_TIMEOUT: '2147483648ms' },
    { NZOVU_CERT_PATH: '/cert' },
    { NZOVU_KEY_PATH: '/key' },
    { NZOVU_INSECURE: 'true', NZOVU_CA_PATH: '/ca' },
    { NZOVU_ADDRESS: '' },
    { NZOVU_API_KEY: '' },
    { NZOVU_API_KEY: '\nsecret' },
    { NZOVU_MAX_MANAGED_CLAIMS: '1.5' },
  ])('rejects invalid configuration %j', (env) => expect(() => loadConfig(env)).toThrow());
});
