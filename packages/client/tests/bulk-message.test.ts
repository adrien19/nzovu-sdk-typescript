import { Message, QueueServiceTypes } from "@nzovu/proto";
import { Connection } from "../src/connection";
import { MessageClient } from "../src/message";

// Create a mock gRPC client for testing
const createMockClient = () => {
  const handlers: Record<string, Function> = {};
  return {
    postMessagesBulk: jest.fn((req, cb) => {
      if (handlers.postMessagesBulk) handlers.postMessagesBulk(req, cb);
      else
        cb(null, {
          success: true,
          successfulCount: req.messages.length,
          failedCount: 0,
          results: [],
        });
    }),
    setHandler: (method: string, handler: Function) => {
      handlers[method] = handler;
    },
    clearHandlers: () => {
      Object.keys(handlers).forEach((k) => delete handlers[k]);
    },
  };
};

describe("MessageClient - postMessagesBulk", () => {
  let connection: Connection;
  let messageClient: MessageClient;
  let mockClient: ReturnType<typeof createMockClient>;

  // Helper to create test messages
  const createTestMessages = (count: number): Message.Message[] => {
    return Array.from({ length: count }, (_, i) => ({
      messageId: `msg-${i + 1}`,
      metadata: {
        payload: {
          data: { test: `data-${i + 1}` },
          contentType: "application/json",
          metadata: {},
          schemaId: "",
          schemaVersion: 0,
        },
        headers: [],
        state: Message.Message_Metadata_State.PENDING,
        attemptsLeft: 3,
        leaseDuration: { seconds: "30", nanos: 0 },
        leaseExpiry: "",
        leaseRenewalCount: 0,
        priority: "10",
        maxAttempts: 3,
        priorityLevel: 10,
      },
    }));
  };

  beforeEach(() => {
    connection = new Connection({
      address: "localhost:9000",
    });
    mockClient = createMockClient();

    // Mock the connection's getQueueServiceClient
    jest
      .spyOn(connection, "getQueueServiceClient")
      .mockReturnValue(mockClient as any);

    messageClient = new MessageClient(connection);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("method existence", () => {
    it("should have postMessagesBulk method", () => {
      expect(typeof messageClient.postMessagesBulk).toBe("function");
    });
  });

  describe("validation", () => {
    it("should reject when queueName is empty", async () => {
      const messages = createTestMessages(1);
      await expect(
        messageClient.postMessagesBulk("", messages),
      ).rejects.toThrow();
    });

    it("should reject when messages is not an array", async () => {
      await expect(
        messageClient.postMessagesBulk("test-queue", null as any),
      ).rejects.toThrow();
    });

    it("should reject when messages array is empty", async () => {
      await expect(
        messageClient.postMessagesBulk("test-queue", []),
      ).rejects.toThrow("messages array cannot be empty");
    });

    it("should reject when messages array exceeds 1000", async () => {
      const messages = createTestMessages(1001);
      await expect(
        messageClient.postMessagesBulk("test-queue", messages),
      ).rejects.toThrow("too many messages: 1001 (max 1000)");
    });

    it("should accept exactly 1000 messages", async () => {
      const messages = createTestMessages(1000);
      mockClient.setHandler("postMessagesBulk", (_req: any, cb: any) => {
        cb(null, {
          success: true,
          successfulCount: 1000,
          failedCount: 0,
          results: messages.map((msg) => ({
            messageId: msg.messageId,
            success: true,
            error: "",
            errorCode:
              QueueServiceTypes
                .PostMessagesBulkResponse_MessagePostResult_ErrorCode.SUCCESS,
          })),
        });
      });

      const result = await messageClient.postMessagesBulk(
        "test-queue",
        messages,
      );
      expect(result.success).toBe(true);
      expect(result.successfulCount).toBe(1000);
    });
  });

  describe("ALL_OR_NOTHING mode", () => {
    it("should post messages successfully with ALL_OR_NOTHING mode (default)", async () => {
      const messages = createTestMessages(5);
      mockClient.setHandler("postMessagesBulk", (_req: any, cb: any) => {
        cb(null, {
          success: true,
          successfulCount: 5,
          failedCount: 0,
          results: messages.map((msg) => ({
            messageId: msg.messageId,
            success: true,
            error: "",
            errorCode:
              QueueServiceTypes
                .PostMessagesBulkResponse_MessagePostResult_ErrorCode.SUCCESS,
          })),
        });
      });

      const result = await messageClient.postMessagesBulk(
        "test-queue",
        messages,
      );

      expect(mockClient.postMessagesBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          queueName: "test-queue",
          messages: messages,
          transactionMode:
            QueueServiceTypes.PostMessagesBulkRequest_TransactionMode
              .ALL_OR_NOTHING,
        }),
        expect.any(Function),
      );
      expect(result.success).toBe(true);
      expect(result.successfulCount).toBe(5);
      expect(result.failedCount).toBe(0);
      expect(result.results).toHaveLength(5);
    });

    it("should fail all messages when one fails in ALL_OR_NOTHING mode", async () => {
      const messages = createTestMessages(5);
      mockClient.setHandler("postMessagesBulk", (_req: any, cb: any) => {
        cb(null, {
          success: false,
          successfulCount: 0,
          failedCount: 5,
          results: messages.map((msg) => ({
            messageId: msg.messageId,
            success: false,
            error: "Validation failed",
            errorCode:
              QueueServiceTypes
                .PostMessagesBulkResponse_MessagePostResult_ErrorCode
                .VALIDATION_FAILED,
          })),
        });
      });

      const result = await messageClient.postMessagesBulk(
        "test-queue",
        messages,
        QueueServiceTypes.PostMessagesBulkRequest_TransactionMode
          .ALL_OR_NOTHING,
      );

      expect(result.success).toBe(false);
      expect(result.successfulCount).toBe(0);
      expect(result.failedCount).toBe(5);
      expect(result.results).toHaveLength(5);
      expect(result.results[0].error).toBe("Validation failed");
    });

    it("should reject when gRPC call fails", async () => {
      const messages = createTestMessages(3);
      mockClient.setHandler("postMessagesBulk", (_req: any, cb: any) => {
        cb(new Error("Queue not found"), null);
      });

      await expect(
        messageClient.postMessagesBulk("test-queue", messages),
      ).rejects.toThrow("Queue not found");
    });
  });

  describe("BEST_EFFORT mode", () => {
    it("should post messages successfully with BEST_EFFORT mode", async () => {
      const messages = createTestMessages(3);
      mockClient.setHandler("postMessagesBulk", (_req: any, cb: any) => {
        cb(null, {
          success: true,
          successfulCount: 3,
          failedCount: 0,
          results: messages.map((msg) => ({
            messageId: msg.messageId,
            success: true,
            error: "",
            errorCode:
              QueueServiceTypes
                .PostMessagesBulkResponse_MessagePostResult_ErrorCode.SUCCESS,
          })),
        });
      });

      const result = await messageClient.postMessagesBulk(
        "test-queue",
        messages,
        QueueServiceTypes.PostMessagesBulkRequest_TransactionMode.BEST_EFFORT,
      );

      expect(mockClient.postMessagesBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          queueName: "test-queue",
          messages: messages,
          transactionMode:
            QueueServiceTypes.PostMessagesBulkRequest_TransactionMode
              .BEST_EFFORT,
        }),
        expect.any(Function),
      );
      expect(result.success).toBe(true);
      expect(result.successfulCount).toBe(3);
      expect(result.failedCount).toBe(0);
    });

    it("should handle partial success in BEST_EFFORT mode", async () => {
      const messages = createTestMessages(5);
      mockClient.setHandler("postMessagesBulk", (_req: any, cb: any) => {
        cb(null, {
          success: true,
          successfulCount: 3,
          failedCount: 2,
          results: [
            {
              messageId: "msg-1",
              success: true,
              error: "",
              errorCode:
                QueueServiceTypes
                  .PostMessagesBulkResponse_MessagePostResult_ErrorCode.SUCCESS,
            },
            {
              messageId: "msg-2",
              success: false,
              error: "Duplicate message ID",
              errorCode:
                QueueServiceTypes
                  .PostMessagesBulkResponse_MessagePostResult_ErrorCode
                  .DUPLICATE_MESSAGE_ID,
            },
            {
              messageId: "msg-3",
              success: true,
              error: "",
              errorCode:
                QueueServiceTypes
                  .PostMessagesBulkResponse_MessagePostResult_ErrorCode.SUCCESS,
            },
            {
              messageId: "msg-4",
              success: false,
              error: "Schema mismatch",
              errorCode:
                QueueServiceTypes
                  .PostMessagesBulkResponse_MessagePostResult_ErrorCode
                  .SCHEMA_MISMATCH,
            },
            {
              messageId: "msg-5",
              success: true,
              error: "",
              errorCode:
                QueueServiceTypes
                  .PostMessagesBulkResponse_MessagePostResult_ErrorCode.SUCCESS,
            },
          ],
        });
      });

      const result = await messageClient.postMessagesBulk(
        "test-queue",
        messages,
        QueueServiceTypes.PostMessagesBulkRequest_TransactionMode.BEST_EFFORT,
      );

      expect(result.success).toBe(true);
      expect(result.successfulCount).toBe(3);
      expect(result.failedCount).toBe(2);
      expect(result.results).toHaveLength(5);

      // Verify specific results
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe("Duplicate message ID");
      expect(result.results[3].errorCode).toBe(
        QueueServiceTypes.PostMessagesBulkResponse_MessagePostResult_ErrorCode
          .SCHEMA_MISMATCH,
      );
    });

    it("should handle all failures in BEST_EFFORT mode", async () => {
      const messages = createTestMessages(3);
      mockClient.setHandler("postMessagesBulk", (_req: any, cb: any) => {
        cb(null, {
          success: false,
          successfulCount: 0,
          failedCount: 3,
          results: messages.map((msg) => ({
            messageId: msg.messageId,
            success: false,
            error: "Internal error",
            errorCode:
              QueueServiceTypes
                .PostMessagesBulkResponse_MessagePostResult_ErrorCode
                .INTERNAL_ERROR,
          })),
        });
      });

      const result = await messageClient.postMessagesBulk(
        "test-queue",
        messages,
        QueueServiceTypes.PostMessagesBulkRequest_TransactionMode.BEST_EFFORT,
      );

      expect(result.success).toBe(false);
      expect(result.successfulCount).toBe(0);
      expect(result.failedCount).toBe(3);
    });
  });

  describe("error codes", () => {
    it("should handle VALIDATION_FAILED error code", async () => {
      const messages = createTestMessages(1);
      mockClient.setHandler("postMessagesBulk", (_req: any, cb: any) => {
        cb(null, {
          success: false,
          successfulCount: 0,
          failedCount: 1,
          results: [
            {
              messageId: "msg-1",
              success: false,
              error: "Invalid payload",
              errorCode:
                QueueServiceTypes
                  .PostMessagesBulkResponse_MessagePostResult_ErrorCode
                  .VALIDATION_FAILED,
            },
          ],
        });
      });

      const result = await messageClient.postMessagesBulk(
        "test-queue",
        messages,
      );
      expect(result.results[0].errorCode).toBe(
        QueueServiceTypes.PostMessagesBulkResponse_MessagePostResult_ErrorCode
          .VALIDATION_FAILED,
      );
    });

    it("should handle DUPLICATE_MESSAGE_ID error code", async () => {
      const messages = createTestMessages(1);
      mockClient.setHandler("postMessagesBulk", (_req: any, cb: any) => {
        cb(null, {
          success: false,
          successfulCount: 0,
          failedCount: 1,
          results: [
            {
              messageId: "msg-1",
              success: false,
              error: "Message ID already exists",
              errorCode:
                QueueServiceTypes
                  .PostMessagesBulkResponse_MessagePostResult_ErrorCode
                  .DUPLICATE_MESSAGE_ID,
            },
          ],
        });
      });

      const result = await messageClient.postMessagesBulk(
        "test-queue",
        messages,
      );
      expect(result.results[0].errorCode).toBe(
        QueueServiceTypes.PostMessagesBulkResponse_MessagePostResult_ErrorCode
          .DUPLICATE_MESSAGE_ID,
      );
    });

    it("should handle SCHEMA_MISMATCH error code", async () => {
      const messages = createTestMessages(1);
      mockClient.setHandler("postMessagesBulk", (_req: any, cb: any) => {
        cb(null, {
          success: false,
          successfulCount: 0,
          failedCount: 1,
          results: [
            {
              messageId: "msg-1",
              success: false,
              error: "Payload doesn't match schema",
              errorCode:
                QueueServiceTypes
                  .PostMessagesBulkResponse_MessagePostResult_ErrorCode
                  .SCHEMA_MISMATCH,
            },
          ],
        });
      });

      const result = await messageClient.postMessagesBulk(
        "test-queue",
        messages,
      );
      expect(result.results[0].errorCode).toBe(
        QueueServiceTypes.PostMessagesBulkResponse_MessagePostResult_ErrorCode
          .SCHEMA_MISMATCH,
      );
    });

    it("should handle INTERNAL_ERROR error code", async () => {
      const messages = createTestMessages(1);
      mockClient.setHandler("postMessagesBulk", (_req: any, cb: any) => {
        cb(null, {
          success: false,
          successfulCount: 0,
          failedCount: 1,
          results: [
            {
              messageId: "msg-1",
              success: false,
              error: "Database connection failed",
              errorCode:
                QueueServiceTypes
                  .PostMessagesBulkResponse_MessagePostResult_ErrorCode
                  .INTERNAL_ERROR,
            },
          ],
        });
      });

      const result = await messageClient.postMessagesBulk(
        "test-queue",
        messages,
      );
      expect(result.results[0].errorCode).toBe(
        QueueServiceTypes.PostMessagesBulkResponse_MessagePostResult_ErrorCode
          .INTERNAL_ERROR,
      );
    });

    it("should handle QUEUE_NOT_FOUND error code", async () => {
      const messages = createTestMessages(1);
      mockClient.setHandler("postMessagesBulk", (_req: any, cb: any) => {
        cb(null, {
          success: false,
          successfulCount: 0,
          failedCount: 1,
          results: [
            {
              messageId: "msg-1",
              success: false,
              error: "Queue does not exist",
              errorCode:
                QueueServiceTypes
                  .PostMessagesBulkResponse_MessagePostResult_ErrorCode
                  .QUEUE_NOT_FOUND,
            },
          ],
        });
      });

      const result = await messageClient.postMessagesBulk(
        "test-queue",
        messages,
      );
      expect(result.results[0].errorCode).toBe(
        QueueServiceTypes.PostMessagesBulkResponse_MessagePostResult_ErrorCode
          .QUEUE_NOT_FOUND,
      );
    });
  });

  describe("batch sizes", () => {
    it("should handle single message batch", async () => {
      const messages = createTestMessages(1);
      mockClient.setHandler("postMessagesBulk", (_req: any, cb: any) => {
        cb(null, {
          success: true,
          successfulCount: 1,
          failedCount: 0,
          results: [
            {
              messageId: "msg-1",
              success: true,
              error: "",
              errorCode:
                QueueServiceTypes
                  .PostMessagesBulkResponse_MessagePostResult_ErrorCode.SUCCESS,
            },
          ],
        });
      });

      const result = await messageClient.postMessagesBulk(
        "test-queue",
        messages,
      );
      expect(result.successfulCount).toBe(1);
    });

    it("should handle typical batch of 100 messages", async () => {
      const messages = createTestMessages(100);
      mockClient.setHandler("postMessagesBulk", (_req: any, cb: any) => {
        cb(null, {
          success: true,
          successfulCount: 100,
          failedCount: 0,
          results: messages.map((msg) => ({
            messageId: msg.messageId,
            success: true,
            error: "",
            errorCode:
              QueueServiceTypes
                .PostMessagesBulkResponse_MessagePostResult_ErrorCode.SUCCESS,
          })),
        });
      });

      const result = await messageClient.postMessagesBulk(
        "test-queue",
        messages,
      );
      expect(result.successfulCount).toBe(100);
      expect(result.results).toHaveLength(100);
    });

    it("should handle large batch of 500 messages", async () => {
      const messages = createTestMessages(500);
      mockClient.setHandler("postMessagesBulk", (_req: any, cb: any) => {
        cb(null, {
          success: true,
          successfulCount: 500,
          failedCount: 0,
          results: messages.map((msg) => ({
            messageId: msg.messageId,
            success: true,
            error: "",
            errorCode:
              QueueServiceTypes
                .PostMessagesBulkResponse_MessagePostResult_ErrorCode.SUCCESS,
          })),
        });
      });

      const result = await messageClient.postMessagesBulk(
        "test-queue",
        messages,
      );
      expect(result.successfulCount).toBe(500);
      expect(result.results).toHaveLength(500);
    });
  });
});
