/**
 * Tests for @nzovu/proto package
 *
 * These tests verify that proto definitions are correctly generated
 * and can be used for message creation and serialization.
 */

import * as Proto from "../src/index";

describe("@nzovu/proto", () => {
  describe("Package Exports", () => {
    it("should export all proto namespaces", () => {
      expect(Proto.Common).toBeDefined();
      expect(Proto.Message).toBeDefined();
      expect(Proto.Queue).toBeDefined();
      expect(Proto.Schedule).toBeDefined();
      expect(Proto.Schema).toBeDefined();
      expect(Proto.QueueService).toBeDefined();
      expect(Proto.QueueServiceTypes).toBeDefined();
    });

    it("should export Google API types", () => {
      expect(Proto.GoogleApiAnnotations).toBeDefined();
      expect(Proto.GoogleApiFieldBehavior).toBeDefined();
      expect(Proto.GoogleApiHttp).toBeDefined();
    });
  });

  describe("Common Types", () => {
    it("should create Payload message", () => {
      const payload: Proto.Common.Payload = {
        metadata: {},
        data: { test: "data" },
        contentType: "application/json",
        schemaId: "",
        schemaVersion: 0,
      };

      expect(payload.contentType).toBe("application/json");
      expect(payload.data).toEqual({ test: "data" });
    });

    it("should create Payload with metadata", () => {
      const payload: Proto.Common.Payload = {
        metadata: {
          userId: "123",
          source: "api",
        },
        contentType: "application/json",
        schemaId: "",
        schemaVersion: 0,
      };

      expect(payload.metadata["userId"]).toBe("123");
      expect(payload.metadata["source"]).toBe("api");
    });

    it("should handle optional fields in Payload", () => {
      const payload: Proto.Common.Payload = {
        metadata: {},
        contentType: "text/plain",
        schemaId: "",
        schemaVersion: 0,
      };

      expect(payload.contentType).toBe("text/plain");
      expect(payload.data).toBeUndefined();
    });
  });

  describe("Queue Types", () => {
    it("should create Queue message with required fields", () => {
      const queue: Proto.Queue.Queue = {
        name: "test-queue",
      };

      expect(queue.name).toBe("test-queue");
      expect(queue.metadata).toBeUndefined();
    });

    it("should create QueueMetadata message", () => {
      const metadata: Proto.Queue.QueueMetadata = {
        type: Proto.Queue.QueueType.SIMPLE,
        defaultMaxAttempts: 3,
        leaseDuration: { seconds: "5", nanos: 0 },
        exclusivityKey: "",
        deadLetterQueueName: "test-dlq",
        autoCreateDlq: true,
        schemaId: "",
        schemaRequired: false,
        maxPayloadSize: 0,
        allowedContentTypes: ["application/json"],
      };

      expect(metadata.defaultMaxAttempts).toBe(3);
      expect(metadata.deadLetterQueueName).toBe("test-dlq");
      expect(metadata.autoCreateDlq).toBe(true);
      expect(metadata.allowedContentTypes).toContain("application/json");
    });

    it("should create Queue with metadata", () => {
      const queue: Proto.Queue.Queue = {
        name: "order-processing",
        metadata: {
          type: Proto.Queue.QueueType.SIMPLE,
          defaultMaxAttempts: 3,
          exclusivityKey: "",
          deadLetterQueueName: "order-processing-dlq",
          autoCreateDlq: true,
          schemaId: "",
          schemaRequired: false,
          maxPayloadSize: 524288, // 512KB
          allowedContentTypes: ["application/json"],
        },
      };

      expect(queue.name).toBe("order-processing");
      expect(queue.metadata?.defaultMaxAttempts).toBe(3);
      expect(queue.metadata?.maxPayloadSize).toBe(524288);
    });
  });

  describe("Message Types", () => {
    it("should create Message with proper structure", () => {
      const message: Proto.Message.Message = {
        messageId: "msg-123",
        metadata: {
          payload: {
            metadata: {},
            contentType: "application/json",
            data: { test: "data" },
            schemaId: "",
            schemaVersion: 0,
          },
          headers: [],
          state: Proto.Message.Message_Metadata_State.PENDING,
          attemptsLeft: 3,
          leaseExpiry: "0",
          leaseRenewalCount: 0,
          priority: "50",
          maxAttempts: 3,
          priorityLevel: 0,
        },
      };

      expect(message.messageId).toBe("msg-123");
      expect(message.metadata?.state).toBe(
        Proto.Message.Message_Metadata_State.PENDING,
      );
      expect(message.metadata?.payload?.contentType).toBe("application/json");
      expect(message.metadata?.priority).toBe("50");
    });

    it("should handle message with custom payload metadata", () => {
      const message: Proto.Message.Message = {
        messageId: "msg-456",
        metadata: {
          payload: {
            metadata: {
              userId: "123",
              source: "api",
            },
            contentType: "application/json",
            schemaId: "",
            schemaVersion: 0,
          },
          headers: [],
          state: Proto.Message.Message_Metadata_State.PENDING,
          attemptsLeft: 3,
          leaseExpiry: "0",
          leaseRenewalCount: 0,
          priority: "100",
          maxAttempts: 3,
          priorityLevel: 0,
        },
      };

      expect(message.metadata?.payload?.metadata["userId"]).toBe("123");
      expect(message.metadata?.payload?.metadata["source"]).toBe("api");
    });
  });

  describe("Schedule Types", () => {
    it("should create Schedule message", () => {
      const schedule: Proto.Schedule.Schedule = {
        scheduleId: "daily-task",
        metadata: {
          payload: {
            metadata: {},
            contentType: "application/json",
            schemaId: "",
            schemaVersion: 0,
          },
          headers: [],
          state: Proto.Schedule.Schedule_Metadata_State.SCHEDULED,
          cronSchedule: "0 0 * * *",
          queueName: "task-queue",
          messageIds: [],
          stateMessage: "",
          priority: "50",
          hasMaxMessages: false,
          maxMessages: "0",
          timezone: "",
          nextRuns: [],
        },
      };

      expect(schedule.scheduleId).toBe("daily-task");
      expect(schedule.metadata?.cronSchedule).toBe("0 0 * * *");
      expect(schedule.metadata?.queueName).toBe("task-queue");
    });

    it("should handle Schedule_Metadata_State enum", () => {
      expect(Proto.Schedule.Schedule_Metadata_State.SCHEDULED).toBe(0);
      expect(Proto.Schedule.Schedule_Metadata_State.CANCELED).toBe(1);
      expect(Proto.Schedule.Schedule_Metadata_State.ERRORED).toBe(2);
      expect(Proto.Schedule.Schedule_Metadata_State.PAUSED).toBe(3);
    });
  });

  describe("Schema Types", () => {
    it("should create Schema message", () => {
      const schema: Proto.Schema.Schema = {
        schemaId: "user-event",
        version: 1,
        name: "User Event Schema",
        description: "Schema for user events",
        content: '{"type": "object"}',
        contentType: "json-schema",
        createdAt: "0",
        updatedAt: "0",
        isActive: true,
        metadata: {
          owner: "team-api",
        },
      };

      expect(schema.schemaId).toBe("user-event");
      expect(schema.name).toBe("User Event Schema");
      expect(schema.version).toBe(1);
      expect(schema.content).toBe('{"type": "object"}');
      expect(schema.contentType).toBe("json-schema");
      expect(schema.isActive).toBe(true);
    });

    it("should create ValidationResult", () => {
      const result: Proto.Schema.ValidationResult = {
        valid: true,
        errors: [],
        validatedAt: "0",
        schemaId: "test-schema",
        schemaVersion: 1,
      };

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.schemaId).toBe("test-schema");
    });

    it("should handle ErrorCode enum", () => {
      expect(Proto.Schema.ErrorCode.UNKNOWN_ERROR).toBe(0);
      expect(Proto.Schema.ErrorCode.REQUIRED_FIELD_MISSING).toBe(1);
      expect(Proto.Schema.ErrorCode.INVALID_TYPE).toBe(2);
      expect(Proto.Schema.ErrorCode.SCHEMA_NOT_FOUND).toBe(10);
    });
  });

  describe("QueueService Types", () => {
    it("should create CreateQueueRequest", () => {
      const request: Proto.QueueServiceTypes.CreateQueueRequest = {
        name: "new-queue",
        metadata: {
          type: Proto.Queue.QueueType.SIMPLE,
          defaultMaxAttempts: 3,
          exclusivityKey: "",
          deadLetterQueueName: "",
          autoCreateDlq: false,
          schemaId: "",
          schemaRequired: false,
          maxPayloadSize: 0,
          allowedContentTypes: [],
        },
      };

      expect(request.name).toBe("new-queue");
      expect(request.metadata?.defaultMaxAttempts).toBe(3);
    });

    it("should create CreateQueueResponse", () => {
      const response: Proto.QueueServiceTypes.CreateQueueResponse = {
        success: true,
      };

      expect(response.success).toBe(true);
    });

    it("should create PostMessageRequest", () => {
      const request: Proto.QueueServiceTypes.PostMessageRequest = {
        queueName: "queue-123",
        message: {
          messageId: "msg-123",
          metadata: {
            payload: {
              metadata: { source: "test" },
              contentType: "application/json",
              data: { event: "test" },
              schemaId: "",
              schemaVersion: 0,
            },
            headers: [],
            state: Proto.Message.Message_Metadata_State.PENDING,
            attemptsLeft: 3,
            leaseExpiry: "0",
            leaseRenewalCount: 0,
            priority: "50",
            maxAttempts: 3,
            priorityLevel: 0,
          },
        },
      };

      expect(request.queueName).toBe("queue-123");
      expect(request.message).toBeDefined();
      expect(request.message?.metadata?.payload?.metadata["source"]).toBe(
        "test",
      );
    });
  });

  describe("Service Definitions", () => {
    it("should export QueueServiceService", () => {
      expect(Proto.QueueService.QueueServiceService).toBeDefined();
      expect(Proto.QueueService.QueueServiceService.createQueue).toBeDefined();
      expect(Proto.QueueService.QueueServiceService.deleteQueue).toBeDefined();
    });

    it("should have correct gRPC paths", () => {
      expect(Proto.QueueService.QueueServiceService.createQueue.path).toBe(
        "/nzovu.api.queueservice.v1.QueueService/CreateQueue",
      );
    });
  });

  describe("Message Encoding/Decoding", () => {
    it("should encode and decode Payload message", () => {
      const originalPayload: Proto.Common.Payload = {
        metadata: { source: "test" },
        contentType: "application/json",
        data: { test: "data" },
        schemaId: "",
        schemaVersion: 0,
      };

      // Encode
      const encoded = Proto.Common.Payload.encode(originalPayload).finish();
      expect(encoded).toBeInstanceOf(Uint8Array);

      // Decode
      const decoded = Proto.Common.Payload.decode(encoded);
      expect(decoded.contentType).toBe(originalPayload.contentType);
      expect(decoded.data).toEqual(originalPayload.data);
      expect(decoded.metadata["source"]).toBe("test");
    });

    it("should encode and decode Queue message", () => {
      const originalQueue: Proto.Queue.Queue = {
        name: "test-queue",
        metadata: {
          type: Proto.Queue.QueueType.SIMPLE,
          defaultMaxAttempts: 3,
          exclusivityKey: "",
          deadLetterQueueName: "",
          autoCreateDlq: false,
          schemaId: "",
          schemaRequired: false,
          maxPayloadSize: 0,
          allowedContentTypes: [],
        },
      };

      const encoded = Proto.Queue.Queue.encode(originalQueue).finish();
      const decoded = Proto.Queue.Queue.decode(encoded);

      expect(decoded.name).toBe(originalQueue.name);
      expect(decoded.metadata?.type).toBe(originalQueue.metadata?.type);
      expect(decoded.metadata?.defaultMaxAttempts).toBe(
        originalQueue.metadata?.defaultMaxAttempts,
      );
    });

    it("should encode and decode Message with nested Payload", () => {
      const originalMessage: Proto.Message.Message = {
        messageId: "msg-encode-test",
        metadata: {
          payload: {
            metadata: {},
            contentType: "text/plain",
            data: { message: "Hello, World!" },
            schemaId: "",
            schemaVersion: 0,
          },
          headers: [],
          state: Proto.Message.Message_Metadata_State.PENDING,
          attemptsLeft: 3,
          leaseExpiry: "0",
          leaseRenewalCount: 0,
          priority: "50",
          maxAttempts: 3,
          priorityLevel: 0,
        },
      };

      const encoded = Proto.Message.Message.encode(originalMessage).finish();
      const decoded = Proto.Message.Message.decode(encoded);

      expect(decoded.messageId).toBe(originalMessage.messageId);
      expect(decoded.metadata?.payload?.contentType).toBe(
        originalMessage.metadata?.payload?.contentType,
      );
      expect(decoded.metadata?.payload?.data).toEqual(
        originalMessage.metadata?.payload?.data,
      );
    });
  });

  describe("Type Safety", () => {
    it("should enforce required fields at compile time", () => {
      // This test verifies TypeScript type checking
      // If this compiles, required fields are properly enforced
      const queue: Proto.Queue.Queue = {
        name: "required-name",
      };

      expect(queue.name).toBeDefined();
    });

    it("should allow optional fields to be undefined", () => {
      const message: Proto.Message.Message = {
        messageId: "msg-optional",
        // metadata is optional and can be omitted
      };

      expect(message.messageId).toBeDefined();
      expect(message.metadata).toBeUndefined();
    });

    it("should handle nested optional fields", () => {
      const queue: Proto.Queue.Queue = {
        name: "test-queue",
        metadata: {
          type: Proto.Queue.QueueType.SIMPLE,
          defaultMaxAttempts: 3,
          exclusivityKey: "",
          deadLetterQueueName: "",
          autoCreateDlq: false,
          schemaId: "",
          schemaRequired: false,
          maxPayloadSize: 0,
          allowedContentTypes: [],
          // leaseDuration is optional
        },
      };

      expect(queue.metadata?.leaseDuration).toBeUndefined();
    });
  });

  describe("Enum Handling", () => {
    it("should handle Message_Metadata_State enum", () => {
      expect(Proto.Message.Message_Metadata_State.INVISIBLE).toBe(0);
      expect(Proto.Message.Message_Metadata_State.PENDING).toBe(1);
      expect(Proto.Message.Message_Metadata_State.RUNNING).toBe(2);
      expect(Proto.Message.Message_Metadata_State.COMPLETED).toBe(3);
      expect(Proto.Message.Message_Metadata_State.CANCELED).toBe(4);
      expect(Proto.Message.Message_Metadata_State.ERRORED).toBe(5);
    });

    it("should handle QueueType enum", () => {
      expect(Proto.Queue.QueueType.SIMPLE).toBe(0);
      expect(Proto.Queue.QueueType.EXCLUSIVE).toBe(1);
    });

    it("should handle FairnessPolicy enum", () => {
      expect(Proto.Queue.FairnessPolicy.STRICT).toBe(0);
      expect(Proto.Queue.FairnessPolicy.WEIGHTED).toBe(1);
      expect(Proto.Queue.FairnessPolicy.AGING).toBe(2);
      expect(Proto.Queue.FairnessPolicy.HYBRID).toBe(3);
    });
  });
});
