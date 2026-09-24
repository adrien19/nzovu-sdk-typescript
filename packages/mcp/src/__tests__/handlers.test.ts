/**
 * Unit tests for tool handlers
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleToolCall } from '../tools/handlers.js';

describe('Tool Handlers', () => {
  let mockClient: any;

  beforeEach(() => {
    // Mock client with nested structure matching real NzovuClient
    mockClient = {
      queues: {
        createQueue: vi.fn(),
        deleteQueue: vi.fn(),
        listQueues: vi.fn(),
        getQueueState: vi.fn(),
      },
      messages: {
        postMessage: vi.fn(),
        postMessagesBulk: vi.fn(),
        getNextMessage: vi.fn(),
        peekQueueMessages: vi.fn(),
        acknowledgeMessage: vi.fn(),
        renewMessageLease: vi.fn(),
        cancelMessage: vi.fn(),
      },
      schedules: {
        createSchedule: vi.fn(),
        listSchedules: vi.fn(),
        getSchedule: vi.fn(),
        deleteSchedule: vi.fn(),
        pauseSchedule: vi.fn(),
        resumeSchedule: vi.fn(),
        getScheduleHistory: vi.fn(),
      },
      schemas: {
        registerSchema: vi.fn(),
        getSchema: vi.fn(),
        listSchemas: vi.fn(),
        deleteSchema: vi.fn(),
        validatePayload: vi.fn(),
      },
      dlq: {
        getDLQMessages: vi.fn(),
        getDLQStats: vi.fn(),
        requeueFromDLQ: vi.fn(),
        deleteFromDLQ: vi.fn(),
        purgeDLQ: vi.fn(),
      },
    };
  });

  describe('Queue Management', () => {
    it('should handle create_queue with default auto_create_dlq=true', async () => {
      mockClient.queues.createQueue.mockResolvedValue({
        success: true,
        queueName: 'test-queue',
      });

      const result = await handleToolCall(
        'create_queue',
        {
          queue_name: 'test-queue',
          queue_type: 'simple',
          max_attempts: 3,
        },
        mockClient
      );

      expect(mockClient.queues.createQueue).toHaveBeenCalledWith(
        'test-queue',
        expect.objectContaining({
          type: 0,
          defaultMaxAttempts: 3,
          autoCreateDlq: true,
        })
      );
      expect(result).toContain('✓ Queue created successfully');
      expect(result).toContain('test-queue');
    });

    it('should handle create_queue with lease_duration', async () => {
      mockClient.queues.createQueue.mockResolvedValue({
        success: true,
        queueName: 'test-queue',
      });

      const result = await handleToolCall(
        'create_queue',
        {
          queue_name: 'test-queue',
          lease_duration: '5m',
          max_attempts: 5,
          auto_create_dlq: false,
        },
        mockClient
      );

      expect(mockClient.queues.createQueue).toHaveBeenCalledWith(
        'test-queue',
        expect.objectContaining({
          leaseDuration: { seconds: '300', nanos: 0 },
          defaultMaxAttempts: 5,
          autoCreateDlq: false,
        })
      );
      expect(result).toContain('Lease Duration: 5m');
    });

    it('should handle delete_queue', async () => {
      mockClient.queues.deleteQueue.mockResolvedValue({ success: true });

      const result = await handleToolCall(
        'delete_queue',
        {
          queue_name: 'test-queue',
        },
        mockClient
      );

      expect(mockClient.queues.deleteQueue).toHaveBeenCalledWith('test-queue');
      expect(result).toContain('deleted successfully');
    });

    it('should handle list_queues with empty result', async () => {
      mockClient.queues.listQueues.mockResolvedValue([]);

      const result = await handleToolCall('list_queues', {}, mockClient);

      expect(result).toContain('No queues found');
    });

    it('should handle list_queues with results', async () => {
      mockClient.queues.listQueues.mockResolvedValue([
        {
          name: 'queue1',
          metadata: {
            type: 0,
            leaseDuration: { seconds: '30', nanos: 0 },
            defaultMaxAttempts: 3,
            deadLetterQueueName: 'queue1-dlq',
          },
        },
        {
          name: 'queue2',
          metadata: {
            type: 1,
            leaseDuration: { seconds: '60', nanos: 0 },
            defaultMaxAttempts: 5,
          },
        },
      ]);

      const result = await handleToolCall('list_queues', {}, mockClient);

      expect(result).toContain('📋 Queues (2 total)');
      expect(result).toContain('queue1');
      expect(result).toContain('queue2');
    });

    it('should handle get_queue_state', async () => {
      mockClient.queues.getQueueState.mockResolvedValue({
        queueName: 'test-queue',
        stateCounts: {
          PENDING: 5,
          RUNNING: 2,
          COMPLETED: 10,
          ERRORED: 1,
        },
      });

      const result = await handleToolCall(
        'get_queue_state',
        {
          queue_name: 'test-queue',
        },
        mockClient
      );

      expect(mockClient.queues.getQueueState).toHaveBeenCalledWith('test-queue');
      expect(result).toContain('test-queue');
      expect(result).toContain('Pending:   5');
      expect(result).toContain('Running:   2');
    });
  });

  describe('Message Operations', () => {
    it('should handle post_message', async () => {
      mockClient.messages.postMessage.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });

      const result = await handleToolCall(
        'post_message',
        {
          queue_name: 'test-queue',
          message_id: 'msg-123',
          payload: { key: 'value' },
          priority: 8,
        },
        mockClient
      );

      expect(mockClient.messages.postMessage).toHaveBeenCalledWith(
        'test-queue',
        expect.objectContaining({
          messageId: 'msg-123',
        })
      );
      expect(result).toContain('✓ Message posted successfully');
    });

    it('should handle post_message with schema validation', async () => {
      mockClient.messages.postMessage.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });

      const result = await handleToolCall(
        'post_message',
        {
          queue_name: 'test-queue',
          message_id: 'msg-123',
          payload: { key: 'value' },
          schema_id: 'user.profile.v1',
          schema_version: 1,
        },
        mockClient
      );

      expect(mockClient.messages.postMessage).toHaveBeenCalledWith(
        'test-queue',
        expect.objectContaining({
          messageId: 'msg-123',
          metadata: expect.objectContaining({
            payload: expect.objectContaining({
              schemaId: 'user.profile.v1',
              schemaVersion: 1,
            }),
          }),
        })
      );
      expect(result).toContain('Schema: user.profile.v1 v1');
    });

    it('should handle post_message with lease_duration parsing', async () => {
      mockClient.messages.postMessage.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });

      const result = await handleToolCall(
        'post_message',
        {
          queue_name: 'test-queue',
          message_id: 'msg-123',
          payload: { key: 'value' },
          lease_duration: '5m',
          priority: 7,
        },
        mockClient
      );

      // Should convert '5m' to 300 seconds
      expect(mockClient.messages.postMessage).toHaveBeenCalledWith(
        'test-queue',
        expect.objectContaining({
          metadata: expect.objectContaining({
            leaseDuration: { seconds: '300', nanos: 0 },
          }),
        })
      );
      expect(result).toContain('✓ Message posted successfully');
    });

    it('should handle get_next_message', async () => {
      mockClient.messages.getNextMessage.mockResolvedValue({
        message: {
          messageId: 'msg-123',
          metadata: {
            payload: {
              data: JSON.stringify({ key: 'value' }),
              contentType: 'application/json',
            },
            priority: '5',
            attemptsLeft: 3,
            maxAttempts: 3,
            leaseExpiry: '2026-01-01T00:00:00Z',
          },
        },
        workerId: 'worker-1',
        attemptId: 'attempt-1',
      });

      const result = await handleToolCall(
        'get_next_message',
        {
          queue_name: 'test-queue',
        },
        mockClient
      );

      expect(mockClient.messages.getNextMessage).toHaveBeenCalledWith(
        'test-queue',
        { seconds: '30', nanos: 0 },
        undefined, // exclusivity_key
        false, // autoHeartbeat
        1000, // heartbeatIntervalMs
        undefined // worker_id
      );
      expect(result).toContain('📨 Message Retrieved');
      expect(result).toContain('msg-123');
      expect(result).toContain('Worker ID: worker-1');
      expect(result).toContain('Attempt ID: attempt-1');
    });

    it('should handle get_next_message with no messages', async () => {
      mockClient.messages.getNextMessage.mockResolvedValue(null);

      const result = await handleToolCall(
        'get_next_message',
        {
          queue_name: 'test-queue',
        },
        mockClient
      );

      expect(result).toContain('No messages available');
    });

    it('should handle peek_messages', async () => {
      mockClient.messages.peekQueueMessages.mockResolvedValue([
        {
          messageId: 'msg-1',
          metadata: {
            payload: {
              data: JSON.stringify({ key: 'value1' }),
            },
            priority: '5',
            attemptsLeft: 3,
          },
        },
        {
          messageId: 'msg-2',
          metadata: {
            payload: {
              data: JSON.stringify({ key: 'value2' }),
            },
            priority: '8',
            attemptsLeft: 2,
          },
        },
      ]);

      const result = await handleToolCall(
        'peek_messages',
        {
          queue_name: 'test-queue',
          limit: 5,
        },
        mockClient
      );

      expect(mockClient.messages.peekQueueMessages).toHaveBeenCalledWith('test-queue', '5');
      expect(result).toContain('👀 Peeking at 2 message(s)');
    });

    it('should handle acknowledge_message', async () => {
      mockClient.messages.acknowledgeMessage.mockResolvedValue(true);

      const result = await handleToolCall(
        'acknowledge_message',
        {
          queue_name: 'test-queue',
          message_id: 'msg-123',
          status: 'completed',
          worker_id: 'worker-1',
          attempt_id: 'attempt-1',
        },
        mockClient
      );

      expect(mockClient.messages.acknowledgeMessage).toHaveBeenCalledWith(
        'test-queue',
        'msg-123',
        3, // COMPLETED state
        'worker-1',
        'attempt-1'
      );
      expect(result).toContain('✅ Message acknowledged');
    });

    it('should handle renew_message_lease with duration parsing', async () => {
      mockClient.messages.renewMessageLease.mockResolvedValue({
        remainingTime: { seconds: '60', nanos: 0 },
        state: 2,
      });

      const result = await handleToolCall(
        'renew_message_lease',
        {
          queue_name: 'test-queue',
          message_id: 'msg-123',
          lease_duration: '60s',
        },
        mockClient
      );

      expect(mockClient.messages.renewMessageLease).toHaveBeenCalledWith('test-queue', 'msg-123', {
        seconds: '60',
        nanos: 0,
      });
      expect(result).toContain('✓ Message lease renewed');
      expect(result).toContain('Remaining Time: 60s');
    });
  });

  describe('Schedule Operations', () => {
    it('should handle create_schedule with cron', async () => {
      mockClient.schedules.createSchedule.mockResolvedValue({
        success: true,
        scheduleId: 'daily-task',
      });

      const result = await handleToolCall(
        'create_schedule',
        {
          schedule_id: 'daily-task',
          queue_name: 'test-queue',
          schedule_type: 'cron',
          cron_expression: '0 9 * * *',
          payload: { task: 'daily' },
        },
        mockClient
      );

      expect(mockClient.schedules.createSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleId: 'daily-task',
          metadata: expect.objectContaining({
            cronSchedule: '0 9 * * *',
            queueName: 'test-queue',
          }),
        })
      );
      expect(result).toContain('✓ Schedule created successfully');
    });

    it('should handle create_schedule with calendar', async () => {
      mockClient.schedules.createSchedule.mockResolvedValue({
        success: true,
        scheduleId: 'weekly-task',
      });

      const result = await handleToolCall(
        'create_schedule',
        {
          schedule_id: 'weekly-task',
          queue_name: 'test-queue',
          schedule_type: 'calendar',
          calendar_type: 'weekly',
          times_of_day: ['09:00', '17:00'],
          days_of_week: [1, 3, 5],
          payload: { task: 'weekly' },
        },
        mockClient
      );

      expect(mockClient.schedules.createSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleId: 'weekly-task',
          metadata: expect.objectContaining({
            calendarSchedule: expect.objectContaining({
              type: 1, // WEEKLY
            }),
          }),
        })
      );
      expect(result).toContain('✓ Schedule created successfully');
    });

    it('should handle list_schedules', async () => {
      mockClient.schedules.listSchedules.mockResolvedValue([
        {
          scheduleId: 'schedule-1',
          metadata: {
            queueName: 'queue-1',
            cronSchedule: '0 9 * * *',
            state: 0,
            createdAt: new Date('2026-01-01'),
          },
        },
      ]);

      const result = await handleToolCall('list_schedules', {}, mockClient);

      expect(result).toContain('📅 Schedules (1 total)');
      expect(result).toContain('schedule-1');
    });

    it('should handle delete_schedule', async () => {
      mockClient.schedules.deleteSchedule.mockResolvedValue({ success: true });

      const result = await handleToolCall(
        'delete_schedule',
        {
          schedule_id: 'old-schedule',
        },
        mockClient
      );

      expect(mockClient.schedules.deleteSchedule).toHaveBeenCalledWith('old-schedule');
      expect(result).toContain('deleted successfully');
    });

    it('should handle get_schedule', async () => {
      mockClient.schedules.getSchedule.mockResolvedValue({
        scheduleId: 'my-schedule',
        metadata: {
          queueName: 'tasks',
          cronSchedule: '0 9 * * *',
          state: 0,
          createdAt: new Date('2026-01-01'),
          nextRun: new Date('2026-01-02T09:00:00Z'),
          lastRun: new Date('2026-01-01T09:00:00Z'),
        },
      });

      const result = await handleToolCall(
        'get_schedule',
        {
          schedule_id: 'my-schedule',
        },
        mockClient
      );

      expect(mockClient.schedules.getSchedule).toHaveBeenCalledWith('my-schedule');
      expect(result).toContain('Schedule: my-schedule');
      expect(result).toContain('Queue: tasks');
    });

    it('should handle get_schedule with calendar schedule', async () => {
      mockClient.schedules.getSchedule.mockResolvedValue({
        scheduleId: 'calendar-schedule',
        metadata: {
          queueName: 'tasks',
          calendarSchedule: {
            type: 1,
            timezone: 'America/New_York',
          },
          state: 0,
          createdAt: new Date('2026-01-01'),
        },
      });

      const result = await handleToolCall(
        'get_schedule',
        {
          schedule_id: 'calendar-schedule',
        },
        mockClient
      );

      expect(result).toContain('Type: Calendar');
      expect(result).toContain('Timezone: America/New_York');
    });

    it('should handle get_schedule when not found', async () => {
      mockClient.schedules.getSchedule.mockResolvedValue(null);

      const result = await handleToolCall(
        'get_schedule',
        {
          schedule_id: 'nonexistent',
        },
        mockClient
      );

      expect(result).toContain('not found');
    });

    it('should handle pause_schedule', async () => {
      mockClient.schedules.pauseSchedule.mockResolvedValue({ success: true });

      const result = await handleToolCall(
        'pause_schedule',
        {
          schedule_id: 'my-schedule',
        },
        mockClient
      );

      expect(mockClient.schedules.pauseSchedule).toHaveBeenCalledWith('my-schedule');
      expect(result).toContain('paused successfully');
    });

    it('should handle resume_schedule', async () => {
      mockClient.schedules.resumeSchedule.mockResolvedValue({ success: true });

      const result = await handleToolCall(
        'resume_schedule',
        {
          schedule_id: 'my-schedule',
        },
        mockClient
      );

      expect(mockClient.schedules.resumeSchedule).toHaveBeenCalledWith('my-schedule');
      expect(result).toContain('resumed successfully');
    });

    it('should handle get_schedule_history', async () => {
      mockClient.schedules.getScheduleHistory.mockResolvedValue({
        scheduleId: 'my-schedule',
        messages: [{ messageId: 'msg-1' }, { messageId: 'msg-2' }],
        nextRun: new Date('2026-01-02T09:00:00Z'),
        lastRun: new Date('2026-01-01T09:00:00Z'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01T09:00:00Z'),
      });

      const result = await handleToolCall(
        'get_schedule_history',
        {
          schedule_id: 'my-schedule',
          limit: 50,
        },
        mockClient
      );

      expect(mockClient.schedules.getScheduleHistory).toHaveBeenCalledWith('my-schedule', 50);
      expect(result).toContain('Schedule History');
      expect(result).toContain('msg-1');
    });

    it('should handle get_schedule_history when not found', async () => {
      mockClient.schedules.getScheduleHistory.mockResolvedValue(null);

      const result = await handleToolCall(
        'get_schedule_history',
        {
          schedule_id: 'nonexistent',
        },
        mockClient
      );

      expect(result).toContain('No history found');
    });

    it('should handle get_schedule_history with many messages', async () => {
      // Create more than 10 messages to test the truncation logic
      const messages = Array.from({ length: 15 }, (_, i) => ({ messageId: `msg-${i + 1}` }));
      mockClient.schedules.getScheduleHistory.mockResolvedValue({
        scheduleId: 'my-schedule',
        messages,
      });

      const result = await handleToolCall(
        'get_schedule_history',
        {
          schedule_id: 'my-schedule',
        },
        mockClient
      );

      expect(result).toContain('and 5 more');
    });
  });

  describe('Schema Operations', () => {
    it('should handle register_schema', async () => {
      mockClient.schemas.registerSchema.mockResolvedValue({
        schemaId: 'user.profile.v1',
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
      });

      const result = await handleToolCall(
        'register_schema',
        {
          schema_id: 'user.profile.v1',
          name: 'User Profile',
          content: '{"type":"object"}',
          description: 'User profile schema',
        },
        mockClient
      );

      expect(mockClient.schemas.registerSchema).toHaveBeenCalledWith(
        'user.profile.v1',
        '{"type":"object"}',
        expect.objectContaining({
          name: 'User Profile',
          description: 'User profile schema',
        })
      );
      expect(result).toContain('✓ Schema registered successfully');
      expect(result).toContain('user.profile.v1');
    });

    it('should handle get_schema', async () => {
      mockClient.schemas.getSchema.mockResolvedValue({
        schemaId: 'user.profile.v1',
        version: 2,
        name: 'User Profile',
        contentType: 'json-schema',
        description: 'Schema for user profiles',
        content: '{"type":"object","properties":{"name":{"type":"string"}}}',
      });

      const result = await handleToolCall(
        'get_schema',
        {
          schema_id: 'user.profile.v1',
          version: 2,
        },
        mockClient
      );

      expect(mockClient.schemas.getSchema).toHaveBeenCalledWith('user.profile.v1', 2);
      expect(result).toContain('📋 Schema: user.profile.v1');
      expect(result).toContain('Version: 2');
      expect(result).toContain('Name: User Profile');
    });

    it('should handle get_schema when not found', async () => {
      mockClient.schemas.getSchema.mockResolvedValue(null);

      const result = await handleToolCall(
        'get_schema',
        {
          schema_id: 'nonexistent.schema',
        },
        mockClient
      );

      expect(result).toContain('not found');
    });

    it('should handle list_schemas', async () => {
      mockClient.schemas.listSchemas.mockResolvedValue([
        {
          schemaId: 'user.profile.v1',
          name: 'User Profile',
          latestVersion: 2,
          versionCount: 2,
          description: 'User profile schema',
          isActive: true,
        },
        {
          schemaId: 'order.item.v1',
          name: 'Order Item',
          latestVersion: 1,
          versionCount: 1,
          isActive: true,
        },
      ]);

      const result = await handleToolCall(
        'list_schemas',
        {
          prefix: 'user',
        },
        mockClient
      );

      expect(mockClient.schemas.listSchemas).toHaveBeenCalledWith(
        expect.objectContaining({
          prefix: 'user',
        })
      );
      expect(result).toContain('📋 Schemas (2 total)');
      expect(result).toContain('user.profile.v1');
    });

    it('should handle list_schemas when empty', async () => {
      mockClient.schemas.listSchemas.mockResolvedValue([]);

      const result = await handleToolCall('list_schemas', {}, mockClient);

      expect(result).toContain('No schemas found');
    });

    it('should handle delete_schema', async () => {
      mockClient.schemas.deleteSchema.mockResolvedValue({ success: true });

      const result = await handleToolCall(
        'delete_schema',
        {
          schema_id: 'old.schema.v1',
          version: 1,
        },
        mockClient
      );

      expect(mockClient.schemas.deleteSchema).toHaveBeenCalledWith('old.schema.v1', 1);
      expect(result).toContain('✓ Schema deleted successfully');
      expect(result).toContain('old.schema.v1');
    });

    it('should handle validate_payload with valid payload', async () => {
      mockClient.schemas.validatePayload.mockResolvedValue({
        schemaId: 'user.profile.v1',
        schemaVersion: 1,
        valid: true,
        errors: [],
      });

      const result = await handleToolCall(
        'validate_payload',
        {
          schema_id: 'user.profile.v1',
          payload: '{"name":"John"}',
        },
        mockClient
      );

      expect(mockClient.schemas.validatePayload).toHaveBeenCalledWith(
        'user.profile.v1',
        '{"name":"John"}',
        0
      );
      expect(result).toContain('📋 Validation Result');
      expect(result).toContain('Valid: ✅ Yes');
    });

    it('should handle validate_payload with invalid payload', async () => {
      mockClient.schemas.validatePayload.mockResolvedValue({
        schemaId: 'user.profile.v1',
        schemaVersion: 1,
        valid: false,
        errors: [
          {
            field: 'name',
            errorCode: 'required',
            message: 'name is required',
            details: { expectedType: 'string' },
          },
        ],
      });

      const result = await handleToolCall(
        'validate_payload',
        {
          schema_id: 'user.profile.v1',
          payload: '{}',
          version: 1,
        },
        mockClient
      );

      expect(result).toContain('Valid: ❌ No');
      expect(result).toContain('Errors (1)');
      expect(result).toContain('Field: name');
      expect(result).toContain('Code: required');
    });
  });

  describe('DLQ Operations', () => {
    it('should handle get_dlq_messages', async () => {
      mockClient.dlq.getDLQMessages.mockResolvedValue([
        {
          messageId: 'msg-1',
          payload: { task: 'failed' },
          originalQueue: 'tasks',
          failureReason: 'Timeout',
          failedAt: new Date('2026-01-01'),
          attempts: 3,
        },
      ]);

      const result = await handleToolCall(
        'get_dlq_messages',
        {
          dlq_name: 'tasks-dlq',
          limit: 10,
        },
        mockClient
      );

      expect(mockClient.dlq.getDLQMessages).toHaveBeenCalledWith('tasks-dlq', 10);
      expect(result).toContain('DLQ Messages');
      expect(result).toContain('msg-1');
    });

    it('should handle get_dlq_messages when empty', async () => {
      mockClient.dlq.getDLQMessages.mockResolvedValue([]);

      const result = await handleToolCall(
        'get_dlq_messages',
        {
          dlq_name: 'empty-dlq',
        },
        mockClient
      );

      expect(result).toContain('No messages in DLQ');
    });

    it('should handle get_dlq_stats', async () => {
      mockClient.dlq.getDLQStats.mockResolvedValue({
        name: 'tasks-dlq',
        messageCount: 42,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-15T12:00:00Z',
      });

      const result = await handleToolCall(
        'get_dlq_stats',
        {
          dlq_name: 'tasks-dlq',
        },
        mockClient
      );

      expect(mockClient.dlq.getDLQStats).toHaveBeenCalledWith('tasks-dlq');
      expect(result).toContain('📊 DLQ Statistics');
      expect(result).toContain('Message Count: 42');
    });

    it('should handle requeue_from_dlq', async () => {
      mockClient.dlq.requeueFromDLQ.mockResolvedValue({
        success: true,
        messageId: 'msg-1',
        targetQueue: 'tasks',
      });

      const result = await handleToolCall(
        'requeue_from_dlq',
        {
          dlq_name: 'tasks-dlq',
          message_id: 'msg-1',
          target_queue: 'tasks',
        },
        mockClient
      );

      expect(mockClient.dlq.requeueFromDLQ).toHaveBeenCalledWith('tasks-dlq', 'msg-1', 'tasks');
      expect(result).toContain('📤 Requeue Results');
      expect(result).toContain('msg-1');
    });

    it('should handle delete_from_dlq', async () => {
      mockClient.dlq.deleteFromDLQ.mockResolvedValue({ success: true });

      const result = await handleToolCall(
        'delete_from_dlq',
        {
          dlq_name: 'tasks-dlq',
          message_id: 'msg-1',
        },
        mockClient
      );

      expect(mockClient.dlq.deleteFromDLQ).toHaveBeenCalledWith('tasks-dlq', 'msg-1');
      expect(result).toContain('🗑️  Delete Results');
      expect(result).toContain('msg-1');
    });

    it('should handle purge_dlq', async () => {
      mockClient.dlq.purgeDLQ.mockResolvedValue({ success: true });

      const result = await handleToolCall(
        'purge_dlq',
        {
          dlq_name: 'tasks-dlq',
        },
        mockClient
      );

      expect(mockClient.dlq.purgeDLQ).toHaveBeenCalledWith('tasks-dlq');
      expect(result).toContain('purged successfully');
    });

    it('should handle get_dlq_messages with payload data', async () => {
      mockClient.dlq.getDLQMessages.mockResolvedValue([
        {
          messageId: 'msg-1',
          metadata: {
            priority: 5,
            maxAttempts: 3,
            attemptsLeft: 0,
            payload: {
              data: Buffer.from(JSON.stringify({ task: 'process' })),
            },
          },
        },
      ]);

      const result = await handleToolCall(
        'get_dlq_messages',
        {
          dlq_name: 'tasks-dlq',
        },
        mockClient
      );

      expect(result).toContain('Priority: 5');
      expect(result).toContain('Attempts: 3/3');
      expect(result).toContain('Payload:');
    });

    it('should handle get_dlq_messages with non-JSON payload', async () => {
      mockClient.dlq.getDLQMessages.mockResolvedValue([
        {
          messageId: 'msg-1',
          metadata: {
            payload: {
              data: Buffer.from('plain text data'),
            },
          },
        },
      ]);

      const result = await handleToolCall(
        'get_dlq_messages',
        {
          dlq_name: 'tasks-dlq',
        },
        mockClient
      );

      expect(result).toContain('plain text data');
    });

    it('should handle requeue_from_dlq with error', async () => {
      mockClient.dlq.requeueFromDLQ.mockRejectedValue(new Error('Message not found'));

      const result = await handleToolCall(
        'requeue_from_dlq',
        {
          dlq_name: 'tasks-dlq',
          message_id: 'nonexistent',
        },
        mockClient
      );

      expect(result).toContain('✗');
      expect(result).toContain('Message not found');
    });

    it('should handle delete_from_dlq with error', async () => {
      mockClient.dlq.deleteFromDLQ.mockRejectedValue(new Error('Permission denied'));

      const result = await handleToolCall(
        'delete_from_dlq',
        {
          dlq_name: 'tasks-dlq',
          message_id: 'msg-1',
        },
        mockClient
      );

      expect(result).toContain('✗');
      expect(result).toContain('Permission denied');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unknown tool', async () => {
      await expect(handleToolCall('unknown_tool', {}, mockClient)).rejects.toThrow(
        'Unknown tool: unknown_tool'
      );
    });

    it('should propagate client errors', async () => {
      mockClient.queues.createQueue.mockRejectedValue(new Error('Connection failed'));

      await expect(
        handleToolCall(
          'create_queue',
          {
            queue_name: 'test-queue',
          },
          mockClient
        )
      ).rejects.toThrow('Connection failed');
    });
  });
});
