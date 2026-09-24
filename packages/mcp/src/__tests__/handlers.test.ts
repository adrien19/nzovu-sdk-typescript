import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NzovuClient, Message, QueueServiceTypes as R, NzovuError, ErrorCode } from '@nzovu/client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMCPServer } from '../server.js';
import { loadConfig } from '../config.js';
import { allTools } from '../tools/index.js';
import { handleToolCall } from '../tools/handlers.js';

const instant = { seconds: '253402300799', nanos: 999999999 };
let sdk: NzovuClient;
let server: Awaited<ReturnType<typeof createMCPServer>>;
let protocol: Client;
beforeEach(async () => {
  sdk = new NzovuClient({ connection: { address: 'localhost:9000', insecure: true } });
  vi.spyOn(sdk, 'connect').mockResolvedValue();
  vi.spyOn(sdk, 'disconnect').mockResolvedValue();
  server = await createMCPServer({
    client: sdk,
    config: loadConfig({ NZOVU_API_KEY: 'test-secret' }),
  });
  const [left, right] = InMemoryTransport.createLinkedPair();
  protocol = new Client({ name: 'test', version: '1' });
  await server.connect(left);
  await protocol.connect(right);
});
afterEach(async () => {
  await protocol.close();
  await server.close();
  vi.restoreAllMocks();
});
const call = (name: string, args: Record<string, unknown>) =>
  protocol.callTool({ name, arguments: args });

describe('registered MCP tools', () => {
  it('advertises exactly the canonical schemas and annotations', async () => {
    const result = await protocol.listTools();
    expect(result.tools).toHaveLength(31);
    for (const tool of result.tools) {
      const definition = allTools.find((item) => item.name === tool.name)!;
      expect(tool.inputSchema).toEqual(definition.inputSchema);
      expect(tool.annotations).toEqual(definition.annotations);
    }
  });
  it('preserves tokens, int64, binary header order and nanoseconds in complete results', async () => {
    const response = R.PeekQueueMessagesResponse.fromPartial({
      messages: [
        {
          messageId: 'm',
          metadata: {
            leaseExpiry: '9007199254740993',
            scheduledTime: instant,
            headers: [
              { key: 'x', value: Uint8Array.from([0, 255]) },
              { key: 'x', value: Uint8Array.from([128]) },
            ],
          },
        },
      ],
      nextPageToken: 'opaque',
    });
    const spy = vi.spyOn(sdk.messages, 'peekQueueMessages').mockResolvedValue(response);
    const result = await call('peek_messages', { queueName: 'q', pageSize: 1, pageToken: 'input' });
    expect(spy).toHaveBeenCalledWith('q', { queueName: 'q', pageSize: 1, pageToken: 'input' });
    const json = result.structuredContent as any;
    expect(json.nextPageToken).toBe('opaque');
    expect(json.messages[0].metadata).toMatchObject({
      leaseExpiry: '9007199254740993',
      scheduledTime: instant,
      headers: [
        { key: 'x', value: 'AP8=' },
        { key: 'x', value: 'gA==' },
      ],
    });
    expect(JSON.parse((result.content as any)[0].text)).toEqual(json);
  });
  it('passes priority zero, bytes and optional zero policy exactly', async () => {
    const spy = vi.spyOn(sdk.messages, 'postMessage').mockResolvedValue(true);
    const result = await call('post_message', {
      queueName: 'q',
      message: {
        messageId: 'm',
        metadata: {
          priority: '0',
          headers: [{ key: 'x', value: 'AP8=' }],
          leasePolicy: { maxRenewals: 0 },
        },
      },
    });
    expect(result.structuredContent).toEqual({ success: true });
    const message = spy.mock.calls[0][1];
    expect(message.metadata?.state).toBe(Message.Message_Metadata_State.INVISIBLE);
    expect(message.metadata?.leasePolicy?.maxRenewals).toBe(0);
    expect([...message.metadata!.headers[0].value]).toEqual([0, 255]);
  });
  it('returns complete schema deactivation, family counts and validation errors', async () => {
    vi.spyOn(sdk.schemas, 'deleteSchema').mockResolvedValue({ success: true, versionsDeleted: 3 });
    expect((await call('delete_schema', { schemaId: 's', version: 0 })).structuredContent).toEqual({
      success: true,
      versionsDeleted: 3,
    });
    vi.spyOn(sdk.schemas, 'listSchemas').mockResolvedValue({
      schemas: [],
      totalCount: 10,
      nextPageToken: 'next',
    });
    expect((await call('list_schemas', { activeOnly: false })).structuredContent).toEqual({
      schemas: [],
      totalCount: 10,
      nextPageToken: 'next',
    });
    const response = R.ValidatePayloadResponse.fromPartial({
      valid: false,
      schemaId: 's',
      schemaVersion: 2,
      errors: [
        {
          field: 'a',
          errorCode: 'INVALID_TYPE',
          message: 'wrong',
          details: { expected: 'number' },
        },
      ],
    });
    const spy = vi.spyOn(sdk.schemas, 'validatePayload').mockResolvedValue(response);
    expect(
      (await call('validate_payload', { schemaId: 's', payload: null })).structuredContent
    ).toEqual(response);
    expect(spy).toHaveBeenCalledWith('s', 'null', undefined);
  });
  it('preserves calendar issues, previews and durable execution history', async () => {
    const calendar = {
      type: 2,
      rules: [{ daily: {}, executionTimes: [{ hour: 9 }] }],
      timezone: 'UTC',
    };
    const issues = R.ValidateCalendarScheduleResponse.fromPartial({
      valid: false,
      validationIssues: [
        { ruleIndex: -1, severity: 'error', field: 'rules', message: 'missing', suggestion: 'add' },
      ],
    });
    vi.spyOn(sdk.schedules, 'validateCalendarSchedule').mockResolvedValue(issues);
    expect(
      (await call('validate_calendar_schedule', { calendarSchedule: calendar })).structuredContent
    ).toEqual(issues);
    const preview = {
      executionTimes: [instant],
      timezone: 'UTC',
      previewStart: instant,
      totalCount: 1,
    };
    vi.spyOn(sdk.schedules, 'previewCalendarSchedule').mockResolvedValue(preview);
    expect(
      (await call('preview_calendar_schedule', { calendarSchedule: calendar, count: 0 }))
        .structuredContent
    ).toEqual(preview);
    const history = R.GetScheduleHistoryResponse.fromPartial({
      scheduleHistory: {
        scheduleId: 's',
        executions: [
          {
            messageId: 'm',
            executedAt: instant,
            success: false,
            errorMessage: 'failure',
            message: { messageId: 'm' },
          },
        ],
      },
      nextPageToken: 'next',
    });
    vi.spyOn(sdk.schedules, 'getScheduleHistory').mockResolvedValue(history);
    expect(
      (await call('get_schedule_history', { scheduleId: 's', pageToken: 'before' }))
        .structuredContent
    ).toEqual(history);
  });
  it('preserves BEST_EFFORT per-item errors', async () => {
    const response = R.PostMessagesBulkResponse.fromPartial({
      successfulCount: 1,
      failedCount: 1,
      results: [
        { messageId: 'm', success: true },
        { messageId: 'bad id', errorCode: 1, error: 'invalid' },
      ],
    });
    vi.spyOn(sdk.messages, 'postMessagesBulk').mockResolvedValue(response);
    const result = await call('post_messages_bulk', {
      queueName: 'q',
      transactionMode: 1,
      messages: [
        { messageId: 'm', metadata: {} },
        { messageId: 'bad id', metadata: {} },
      ],
    });
    expect(result.structuredContent).toEqual(response);
  });
  it('forwards exact ownership through heartbeat, renewal and ACK', async () => {
    const owner = { queueName: 'q', messageId: 'm', workerId: 'w', attemptId: 'a' };
    const heartbeat = vi
      .spyOn(sdk.messages, 'sendHeartbeat')
      .mockResolvedValue({ state: 2, remainingTime: { seconds: '1', nanos: 1 } });
    const renew = vi.spyOn(sdk.messages, 'renewMessageLease').mockResolvedValue({ state: 2 });
    const ack = vi.spyOn(sdk.messages, 'acknowledgeMessage').mockResolvedValue(true);
    await call('send_message_heartbeat', owner);
    await call('renew_message_lease', owner);
    await call('acknowledge_message', { ...owner, state: 3 });
    expect(heartbeat).toHaveBeenCalledWith('q', 'm', 'w', 'a');
    expect(renew).toHaveBeenCalledWith('q', 'm', undefined, 'w', 'a');
    expect(ack).toHaveBeenCalledWith('q', 'm', 3, 'w', 'a');
  });
  it('rejects unknown tools/fields without invoking SDK', async () => {
    const spy = vi.spyOn(sdk.messages, 'postMessage');
    expect((await call('post_message', { queue_name: 'q' })).isError).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    await expect(handleToolCall('unknown', {}, sdk)).rejects.toThrow('Unknown tool');
  });
  it('returns distinguishable auth failures without leaking the configured key', async () => {
    vi.spyOn(sdk.queues, 'listQueues').mockRejectedValue(
      new NzovuError(
        ErrorCode.UNAUTHENTICATED,
        'rejected test-secret',
        undefined,
        16,
        'rejected test-secret'
      )
    );
    const result = await call('list_queues', {});
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: 'UNAUTHENTICATED', grpcCode: 16 },
    });
    expect(JSON.stringify(result)).not.toContain('test-secret');
  });
  it('closes SDK exactly once and removes signal listeners', async () => {
    const before = process.listenerCount('SIGTERM');
    await Promise.all([server.close(), server.close()]);
    expect(sdk.disconnect).toHaveBeenCalledTimes(1);
    expect(process.listenerCount('SIGTERM')).toBe(before - 1);
  });
});
