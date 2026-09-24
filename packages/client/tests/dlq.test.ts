import { Connection } from "../src/connection";
import { DLQClient } from "../src/dlq";

// Create a mock gRPC client for testing
const createMockClient = () => {
  const handlers: Record<string, Function> = {};
  return {
    getDlqMessages: jest.fn((req, cb) => {
      if (handlers.getDlqMessages) handlers.getDlqMessages(req, cb);
      else cb(null, { messages: [] });
    }),
    requeueFromDlq: jest.fn((req, cb) => {
      if (handlers.requeueFromDlq) handlers.requeueFromDlq(req, cb);
      else cb(null, { success: true });
    }),
    deleteFromDlq: jest.fn((req, cb) => {
      if (handlers.deleteFromDlq) handlers.deleteFromDlq(req, cb);
      else cb(null, { success: true });
    }),
    purgeDlq: jest.fn((req, cb) => {
      if (handlers.purgeDlq) handlers.purgeDlq(req, cb);
      else cb(null, { success: true });
    }),
    getDlqStats: jest.fn((req, cb) => {
      if (handlers.getDlqStats) handlers.getDlqStats(req, cb);
      else
        cb(null, { name: "", messageCount: "0", createdAt: "", updatedAt: "" });
    }),
    setHandler: (method: string, handler: Function) => {
      handlers[method] = handler;
    },
    clearHandlers: () => {
      Object.keys(handlers).forEach((k) => delete handlers[k]);
    },
  };
};

describe("DLQClient", () => {
  let connection: Connection;
  let dlqClient: DLQClient;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    connection = new Connection({
      address: "localhost:9000",
    });
    mockClient = createMockClient();

    // Mock the connection's getQueueServiceClient
    jest
      .spyOn(connection, "getQueueServiceClient")
      .mockReturnValue(mockClient as any);

    dlqClient = new DLQClient(connection);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getDLQMessages", () => {
    it("should get DLQ messages successfully", async () => {
      const expectedMessages = [
        { messageId: "msg-1", metadata: { state: 4 } }, // ERRORED
        { messageId: "msg-2", metadata: { state: 4 } },
      ];

      mockClient.setHandler("getDlqMessages", (_req: any, cb: any) => {
        cb(null, { messages: expectedMessages });
      });

      const result = await dlqClient.getDLQMessages("test-queue-dlq");
      expect(result).toEqual(expectedMessages);
      expect(mockClient.getDlqMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          dlqName: "test-queue-dlq",
          pageSize: 10,
          pageToken: "",
        }),
        expect.any(Function),
      );
    });

    it("should use custom limit when provided", async () => {
      mockClient.setHandler("getDlqMessages", (_req: any, cb: any) => {
        cb(null, { messages: [] });
      });

      await dlqClient.getDLQMessages("test-queue-dlq", 50);
      expect(mockClient.getDlqMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          dlqName: "test-queue-dlq",
          pageSize: 50,
          pageToken: "",
        }),
        expect.any(Function),
      );
    });

    it("should return empty array when no messages found", async () => {
      mockClient.setHandler("getDlqMessages", (_req: any, cb: any) => {
        cb(null, { messages: [] });
      });

      const result = await dlqClient.getDLQMessages("test-queue-dlq");
      expect(result).toEqual([]);
    });

    it("should reject when server returns error", async () => {
      mockClient.setHandler("getDlqMessages", (_req: any, cb: any) => {
        cb(new Error("DLQ not found"), null);
      });

      await expect(dlqClient.getDLQMessages("test-queue-dlq")).rejects.toThrow(
        "DLQ not found",
      );
    });

    it("should throw error when dlqName is not provided", async () => {
      await expect(dlqClient.getDLQMessages("")).rejects.toThrow();
    });
  });

  describe("requeueFromDLQ", () => {
    it("should requeue message successfully", async () => {
      mockClient.setHandler("requeueFromDlq", (_req: any, cb: any) => {
        cb(null, { success: true });
      });

      const result = await dlqClient.requeueFromDLQ("test-queue-dlq", "msg-1");
      expect(result).toBe(true);
      expect(mockClient.requeueFromDlq).toHaveBeenCalledWith(
        expect.objectContaining({
          dlqName: "test-queue-dlq",
          messageId: "msg-1",
          targetQueue: "",
        }),
        expect.any(Function),
      );
    });

    it("should use custom target queue when provided", async () => {
      mockClient.setHandler("requeueFromDlq", (_req: any, cb: any) => {
        cb(null, { success: true });
      });

      await dlqClient.requeueFromDLQ("test-queue-dlq", "msg-1", "other-queue");
      expect(mockClient.requeueFromDlq).toHaveBeenCalledWith(
        expect.objectContaining({
          dlqName: "test-queue-dlq",
          messageId: "msg-1",
          targetQueue: "other-queue",
        }),
        expect.any(Function),
      );
    });

    it("should return false when requeue fails", async () => {
      mockClient.setHandler("requeueFromDlq", (_req: any, cb: any) => {
        cb(null, { success: false });
      });

      const result = await dlqClient.requeueFromDLQ("test-queue-dlq", "msg-1");
      expect(result).toBe(false);
    });

    it("should reject when server returns error", async () => {
      mockClient.setHandler("requeueFromDlq", (_req: any, cb: any) => {
        cb(new Error("Message not found"), null);
      });

      await expect(
        dlqClient.requeueFromDLQ("test-queue-dlq", "msg-1"),
      ).rejects.toThrow("Message not found");
    });

    it("should throw error when dlqName is not provided", async () => {
      await expect(dlqClient.requeueFromDLQ("", "msg-1")).rejects.toThrow();
    });

    it("should throw error when messageId is not provided", async () => {
      await expect(
        dlqClient.requeueFromDLQ("test-queue-dlq", ""),
      ).rejects.toThrow();
    });
  });

  describe("deleteFromDLQ", () => {
    it("should delete message successfully", async () => {
      mockClient.setHandler("deleteFromDlq", (_req: any, cb: any) => {
        cb(null, { success: true });
      });

      const result = await dlqClient.deleteFromDLQ("test-queue-dlq", "msg-1");
      expect(result).toBe(true);
      expect(mockClient.deleteFromDlq).toHaveBeenCalledWith(
        expect.objectContaining({
          dlqName: "test-queue-dlq",
          messageId: "msg-1",
        }),
        expect.any(Function),
      );
    });

    it("should return false when delete fails", async () => {
      mockClient.setHandler("deleteFromDlq", (_req: any, cb: any) => {
        cb(null, { success: false });
      });

      const result = await dlqClient.deleteFromDLQ("test-queue-dlq", "msg-1");
      expect(result).toBe(false);
    });

    it("should reject when server returns error", async () => {
      mockClient.setHandler("deleteFromDlq", (_req: any, cb: any) => {
        cb(new Error("Message not found"), null);
      });

      await expect(
        dlqClient.deleteFromDLQ("test-queue-dlq", "msg-1"),
      ).rejects.toThrow("Message not found");
    });

    it("should throw error when dlqName is not provided", async () => {
      await expect(dlqClient.deleteFromDLQ("", "msg-1")).rejects.toThrow();
    });

    it("should throw error when messageId is not provided", async () => {
      await expect(
        dlqClient.deleteFromDLQ("test-queue-dlq", ""),
      ).rejects.toThrow();
    });
  });

  describe("purgeDLQ", () => {
    it("should purge DLQ successfully", async () => {
      mockClient.setHandler("purgeDlq", (_req: any, cb: any) => {
        cb(null, { success: true });
      });

      const result = await dlqClient.purgeDLQ("test-queue-dlq");
      expect(result).toBe(true);
      expect(mockClient.purgeDlq).toHaveBeenCalledWith(
        expect.objectContaining({
          dlqName: "test-queue-dlq",
        }),
        expect.any(Function),
      );
    });

    it("should return false when purge fails", async () => {
      mockClient.setHandler("purgeDlq", (_req: any, cb: any) => {
        cb(null, { success: false });
      });

      const result = await dlqClient.purgeDLQ("test-queue-dlq");
      expect(result).toBe(false);
    });

    it("should reject when server returns error", async () => {
      mockClient.setHandler("purgeDlq", (_req: any, cb: any) => {
        cb(new Error("DLQ not found"), null);
      });

      await expect(dlqClient.purgeDLQ("test-queue-dlq")).rejects.toThrow(
        "DLQ not found",
      );
    });

    it("should throw error when dlqName is not provided", async () => {
      await expect(dlqClient.purgeDLQ("")).rejects.toThrow();
    });
  });

  describe("getDLQStats", () => {
    it("should get DLQ stats successfully", async () => {
      const expectedStats = {
        name: "test-queue-dlq",
        messageCount: "42",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T12:00:00Z",
      };

      mockClient.setHandler("getDlqStats", (_req: any, cb: any) => {
        cb(null, expectedStats);
      });

      const result = await dlqClient.getDLQStats("test-queue-dlq");
      expect(result).toEqual(expectedStats);
      expect(mockClient.getDlqStats).toHaveBeenCalledWith(
        expect.objectContaining({
          dlqName: "test-queue-dlq",
        }),
        expect.any(Function),
      );
    });

    it("should reject when server returns error", async () => {
      mockClient.setHandler("getDlqStats", (_req: any, cb: any) => {
        cb(new Error("DLQ not found"), null);
      });

      await expect(dlqClient.getDLQStats("test-queue-dlq")).rejects.toThrow(
        "DLQ not found",
      );
    });

    it("should reject when response is empty", async () => {
      mockClient.setHandler("getDlqStats", (_req: any, cb: any) => {
        cb(null, null);
      });

      await expect(dlqClient.getDLQStats("test-queue-dlq")).rejects.toThrow(
        "Empty response from server",
      );
    });

    it("should throw error when dlqName is not provided", async () => {
      await expect(dlqClient.getDLQStats("")).rejects.toThrow();
    });
  });
});
