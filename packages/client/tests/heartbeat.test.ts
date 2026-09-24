import { Connection } from "../src/connection";
import { Logger } from "../src/logger";
import { MessageClient } from "../src/message";

// Mock logger for capturing log outputs
const createMockLogger = (): Logger & { calls: Record<string, any[][]> } => {
  const calls: Record<string, any[][]> = {
    debug: [],
    info: [],
    warn: [],
    error: [],
  };
  return {
    calls,
    debug: (...args: any[]) => {
      calls.debug.push(args);
    },
    info: (...args: any[]) => {
      calls.info.push(args);
    },
    warn: (...args: any[]) => {
      calls.warn.push(args);
    },
    error: (...args: any[]) => {
      calls.error.push(args);
    },
  };
};

// Create a mock gRPC client for testing
const createMockClient = () => {
  const handlers: Record<string, Function> = {};
  return {
    postMessage: jest.fn((req, cb) => {
      if (handlers.postMessage) handlers.postMessage(req, cb);
      else cb(null, { success: true });
    }),
    getNextMessage: jest.fn((req, cb) => {
      if (handlers.getNextMessage) handlers.getNextMessage(req, cb);
      else cb(null, { message: null });
    }),
    acknowledgeMessage: jest.fn((req, cb) => {
      if (handlers.acknowledgeMessage) handlers.acknowledgeMessage(req, cb);
      else cb(null, { success: true });
    }),
    cancelMessage: jest.fn((req, cb) => {
      if (handlers.cancelMessage) handlers.cancelMessage(req, cb);
      else cb(null, { success: true });
    }),
    sendMessageHeartBeat: jest.fn((req, cb) => {
      if (handlers.sendMessageHeartBeat) handlers.sendMessageHeartBeat(req, cb);
      else cb(null, { state: 1 });
    }),
    renewMessageLease: jest.fn((req, cb) => {
      if (handlers.renewMessageLease) handlers.renewMessageLease(req, cb);
      else cb(null, { state: 1 });
    }),
    peekQueueMessages: jest.fn((req, cb) => {
      if (handlers.peekQueueMessages) handlers.peekQueueMessages(req, cb);
      else cb(null, { messages: [] });
    }),
    setHandler: (method: string, handler: Function) => {
      handlers[method] = handler;
    },
    clearHandlers: () => {
      Object.keys(handlers).forEach((k) => delete handlers[k]);
    },
  };
};

describe("MessageClient Heartbeat Failure Handling", () => {
  let connection: Connection;
  let messageClient: MessageClient;
  let mockClient: ReturnType<typeof createMockClient>;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let originalRandom: () => number;

  beforeEach(() => {
    // Mock Math.random to return 0.5 for deterministic jitter (produces 0 jitter)
    originalRandom = Math.random;
    Math.random = () => 0.5;

    connection = new Connection({
      address: "localhost:9000",
    });
    mockClient = createMockClient();
    mockLogger = createMockLogger();

    // Mock the connection's getQueueServiceClient
    jest
      .spyOn(connection, "getQueueServiceClient")
      .mockReturnValue(mockClient as any);

    messageClient = new MessageClient(connection, undefined, mockLogger);
  });

  afterEach(() => {
    // Restore Math.random
    Math.random = originalRandom;
    messageClient.stopAllHeartbeats();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe("HeartbeatHealth interface", () => {
    it("should return undefined for non-existent message", () => {
      const health = messageClient.getHeartbeatHealth("non-existent");
      expect(health).toBeUndefined();
    });

    it("should return health status for active heartbeat", async () => {
      jest.useFakeTimers();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-1", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true, // enableHeartbeat
        1000,
        undefined,
      );

      const health = messageClient.getHeartbeatHealth("test-msg-1");
      expect(health).toBeDefined();
      expect(health?.isActive).toBe(true);
      expect(health?.consecutiveFailures).toBe(0);
      expect(health?.lastError).toBeUndefined();
      expect(health?.failedAt).toBeUndefined();
    });
  });

  describe("Heartbeat failure tracking", () => {
    it("should increment consecutiveFailures on heartbeat error", async () => {
      jest.useFakeTimers();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-2", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      mockClient.setHandler("sendMessageHeartBeat", (_req: any, cb: any) => {
        // Simulate transient error (not fatal) - synchronous callback
        cb({ code: 2, message: "UNKNOWN error" }, null);
      });

      await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true,
        1000,
        undefined,
      );

      // Verify heartbeat is registered
      expect(messageClient.hasActiveHeartbeat("test-msg-2")).toBe(true);

      // First heartbeat error
      jest.advanceTimersByTime(1000);

      let health = messageClient.getHeartbeatHealth("test-msg-2");
      expect(health).toBeDefined();
      expect(health?.consecutiveFailures).toBe(1);
      expect(health?.lastError).toBeDefined();
      expect(health?.failedAt).toBeDefined();

      // Second heartbeat error
      jest.advanceTimersByTime(1000);

      health = messageClient.getHeartbeatHealth("test-msg-2");
      expect(health?.consecutiveFailures).toBe(2);
    });

    it("should reset consecutiveFailures on successful heartbeat", async () => {
      jest.useFakeTimers();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-3", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      let callCount = 0;
      mockClient.setHandler("sendMessageHeartBeat", (_req: any, cb: any) => {
        callCount++;
        if (callCount <= 2) {
          // First two calls fail
          cb({ code: 2, message: "UNKNOWN error" }, null);
        } else {
          // Third call succeeds
          cb(null, { state: 2, remainingTime: { seconds: 30 } });
        }
      });

      await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true,
        1000,
        undefined,
      );

      // First two errors
      jest.advanceTimersByTime(1000);
      jest.advanceTimersByTime(1000);

      let health = messageClient.getHeartbeatHealth("test-msg-3");
      expect(health?.consecutiveFailures).toBe(2);

      // Third call succeeds - should reset
      jest.advanceTimersByTime(1000);

      health = messageClient.getHeartbeatHealth("test-msg-3");
      expect(health?.consecutiveFailures).toBe(0);
      expect(health?.lastError).toBeUndefined();
      expect(health?.failedAt).toBeUndefined();
    });

    it("should stop heartbeat after max consecutive failures (3)", async () => {
      jest.useFakeTimers();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-4", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      mockClient.setHandler("sendMessageHeartBeat", (_req: any, cb: any) => {
        // Always fail with non-fatal error
        cb({ code: 2, message: "UNKNOWN error" }, null);
      });

      await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true,
        1000,
        undefined,
      );

      expect(messageClient.hasActiveHeartbeat("test-msg-4")).toBe(true);

      // Advance through 3 failures
      jest.advanceTimersByTime(1000); // failure 1
      jest.advanceTimersByTime(1000); // failure 2
      jest.advanceTimersByTime(1000); // failure 3 - should stop

      // Heartbeat should be stopped after 3 failures
      expect(messageClient.hasActiveHeartbeat("test-msg-4")).toBe(false);
      expect(messageClient.getHeartbeatHealth("test-msg-4")).toBeUndefined();

      // Verify warning was logged
      const warnLogs = mockLogger.calls.warn;
      expect(
        warnLogs.some(
          (args: any[]) =>
            typeof args[0] === "string" &&
            args[0].includes("Stopping heartbeat") &&
            args[0].includes("consecutive failures"),
        ),
      ).toBe(true);
    });
  });

  describe("Fatal error classification", () => {
    it("should treat UNAVAILABLE error (code 14) as transient and retry", async () => {
      jest.useFakeTimers();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-5", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      mockClient.setHandler("sendMessageHeartBeat", (_req: any, cb: any) => {
        cb({ code: 14, message: "UNAVAILABLE: server down" }, null);
      });

      await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true,
        1000,
        undefined,
      );

      expect(messageClient.hasActiveHeartbeat("test-msg-5")).toBe(true);

      // First heartbeat with UNAVAILABLE - should be treated as transient
      jest.advanceTimersByTime(1000);

      // Should still be active after first transient error
      expect(messageClient.hasActiveHeartbeat("test-msg-5")).toBe(true);

      // Verify failure count incremented
      let health = messageClient.getHeartbeatHealth("test-msg-5");
      expect(health?.consecutiveFailures).toBe(1);

      // Second failure
      jest.advanceTimersByTime(1000);
      expect(messageClient.hasActiveHeartbeat("test-msg-5")).toBe(true);
      health = messageClient.getHeartbeatHealth("test-msg-5");
      expect(health?.consecutiveFailures).toBe(2);

      // Third failure - should stop after max consecutive failures
      jest.advanceTimersByTime(1000);
      expect(messageClient.hasActiveHeartbeat("test-msg-5")).toBe(false);
    });

    it("should stop heartbeat immediately on CANCELLED error (code 1)", async () => {
      jest.useFakeTimers();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-6", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      mockClient.setHandler("sendMessageHeartBeat", (_req: any, cb: any) => {
        cb({ code: 1, message: "CANCELLED" }, null);
      });

      await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true,
        1000,
        undefined,
      );

      jest.advanceTimersByTime(1000);

      expect(messageClient.hasActiveHeartbeat("test-msg-6")).toBe(false);
    });

    it("should stop heartbeat immediately on INTERNAL error (code 13)", async () => {
      jest.useFakeTimers();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-7", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      mockClient.setHandler("sendMessageHeartBeat", (_req: any, cb: any) => {
        cb({ code: 13, message: "INTERNAL server error" }, null);
      });

      await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true,
        1000,
        undefined,
      );

      jest.advanceTimersByTime(1000);

      expect(messageClient.hasActiveHeartbeat("test-msg-7")).toBe(false);
    });

    it("should stop heartbeat on 'channel closed' error message", async () => {
      jest.useFakeTimers();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-8", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      mockClient.setHandler("sendMessageHeartBeat", (_req: any, cb: any) => {
        cb({ message: "Channel has been closed" }, null);
      });

      await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true,
        1000,
        undefined,
      );

      jest.advanceTimersByTime(1000);

      expect(messageClient.hasActiveHeartbeat("test-msg-8")).toBe(false);
    });

    it("should stop heartbeat on 'connection closed' error message", async () => {
      jest.useFakeTimers();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-9", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      mockClient.setHandler("sendMessageHeartBeat", (_req: any, cb: any) => {
        cb({ message: "Connection was closed by remote" }, null);
      });

      await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true,
        1000,
        undefined,
      );

      jest.advanceTimersByTime(1000);

      expect(messageClient.hasActiveHeartbeat("test-msg-9")).toBe(false);
    });
  });

  describe("onHeartbeatFailure callback", () => {
    it("should invoke callback on heartbeat failure", async () => {
      jest.useFakeTimers();

      const failureCallback = jest.fn();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-10", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      mockClient.setHandler("sendMessageHeartBeat", (_req: any, cb: any) => {
        cb({ code: 2, message: "UNKNOWN error" }, null);
      });

      await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true,
        1000,
        undefined,
        failureCallback, // onHeartbeatFailure callback
      );

      jest.advanceTimersByTime(1000);

      expect(failureCallback).toHaveBeenCalledTimes(1);
      expect(failureCallback).toHaveBeenCalledWith(
        "test-msg-10",
        expect.objectContaining({ message: "UNKNOWN error" }),
        1,
      );
    });

    it("should invoke callback multiple times with incrementing failure count", async () => {
      jest.useFakeTimers();

      const failureCallback = jest.fn();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-11", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      mockClient.setHandler("sendMessageHeartBeat", (_req: any, cb: any) => {
        cb({ code: 2, message: "UNKNOWN error" }, null);
      });

      await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true,
        1000,
        undefined,
        failureCallback,
      );

      jest.advanceTimersByTime(1000); // failure 1
      jest.advanceTimersByTime(1000); // failure 2
      jest.advanceTimersByTime(1000); // failure 3

      expect(failureCallback).toHaveBeenCalledTimes(3);
      expect(failureCallback).toHaveBeenNthCalledWith(
        1,
        "test-msg-11",
        expect.any(Object),
        1,
      );
      expect(failureCallback).toHaveBeenNthCalledWith(
        2,
        "test-msg-11",
        expect.any(Object),
        2,
      );
      expect(failureCallback).toHaveBeenNthCalledWith(
        3,
        "test-msg-11",
        expect.any(Object),
        3,
      );
    });

    it("should catch and log callback errors without stopping heartbeat flow", async () => {
      jest.useFakeTimers();

      const failureCallback = jest.fn().mockImplementation(() => {
        throw new Error("Callback error");
      });

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-12", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      mockClient.setHandler("sendMessageHeartBeat", (_req: any, cb: any) => {
        cb({ code: 2, message: "UNKNOWN error" }, null);
      });

      await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true,
        1000,
        undefined,
        failureCallback,
      );

      // Should not throw even when callback throws
      expect(() => jest.advanceTimersByTime(1000)).not.toThrow();

      // Verify warning was logged about callback error
      const warnLogs = mockLogger.calls.warn;
      expect(
        warnLogs.some((args) =>
          args[0]?.includes?.("Heartbeat failure callback threw error"),
        ),
      ).toBe(true);
    });

    it("should work without callback (undefined)", async () => {
      jest.useFakeTimers();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-13", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      mockClient.setHandler("sendMessageHeartBeat", (_req: any, cb: any) => {
        cb({ code: 2, message: "UNKNOWN error" }, null);
      });

      await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true,
        1000,
        undefined,
        undefined, // no callback
      );

      // Should not throw
      expect(() => jest.advanceTimersByTime(1000)).not.toThrow();
    });
  });

  describe("stopAllHeartbeats", () => {
    it("should stop all active heartbeats", async () => {
      jest.useFakeTimers();

      let messageCounter = 0;
      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        messageCounter++;
        cb(null, {
          message: {
            messageId: `test-msg-multi-${messageCounter}`,
            payload: {},
          },
          workerId: "worker-1",
          attemptId: `attempt-${messageCounter}`,
        });
      });

      // Create multiple messages with heartbeats
      await messageClient.getNextMessage(
        "queue1",
        undefined,
        undefined,
        true,
        1000,
      );
      await messageClient.getNextMessage(
        "queue2",
        undefined,
        undefined,
        true,
        1000,
      );
      await messageClient.getNextMessage(
        "queue3",
        undefined,
        undefined,
        true,
        1000,
      );

      expect(messageClient.hasActiveHeartbeat("test-msg-multi-1")).toBe(true);
      expect(messageClient.hasActiveHeartbeat("test-msg-multi-2")).toBe(true);
      expect(messageClient.hasActiveHeartbeat("test-msg-multi-3")).toBe(true);

      messageClient.stopAllHeartbeats();

      expect(messageClient.hasActiveHeartbeat("test-msg-multi-1")).toBe(false);
      expect(messageClient.hasActiveHeartbeat("test-msg-multi-2")).toBe(false);
      expect(messageClient.hasActiveHeartbeat("test-msg-multi-3")).toBe(false);
    });

    it("should log debug messages when stopping heartbeats", async () => {
      jest.useFakeTimers();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-debug", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      await messageClient.getNextMessage(
        "queue1",
        undefined,
        undefined,
        true,
        1000,
      );

      mockLogger.calls.debug = []; // Clear previous debug logs
      messageClient.stopAllHeartbeats();

      const debugLogs = mockLogger.calls.debug;
      expect(
        debugLogs.some(
          (args) =>
            args[0]?.includes?.("Stopping") &&
            args[0]?.includes?.("active heartbeats"),
        ),
      ).toBe(true);
      expect(
        debugLogs.some((args) => args[0]?.includes?.("All heartbeats stopped")),
      ).toBe(true);
    });

    it("should handle errors when stopping individual heartbeats", async () => {
      jest.useFakeTimers();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-err-stop", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      await messageClient.getNextMessage(
        "queue1",
        undefined,
        undefined,
        true,
        1000,
      );

      // stopAllHeartbeats should not throw even if something goes wrong
      expect(() => messageClient.stopAllHeartbeats()).not.toThrow();
    });

    it("should be safe to call multiple times", () => {
      // Should not throw when called multiple times
      expect(() => {
        messageClient.stopAllHeartbeats();
        messageClient.stopAllHeartbeats();
        messageClient.stopAllHeartbeats();
      }).not.toThrow();
    });
  });

  describe("Lease expiration handling", () => {
    it("should stop heartbeat when state changes to ERRORED", async () => {
      jest.useFakeTimers();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-lease-expired", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      mockClient.setHandler("sendMessageHeartBeat", (_req: any, cb: any) => {
        // State 5 = ERRORED (as per proto enum definition)
        cb(null, { state: 5, remainingTime: { seconds: 0 } });
      });

      await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true,
        1000,
        undefined,
      );

      expect(messageClient.hasActiveHeartbeat("test-msg-lease-expired")).toBe(
        true,
      );

      jest.advanceTimersByTime(1000);

      expect(messageClient.hasActiveHeartbeat("test-msg-lease-expired")).toBe(
        false,
      );

      // Verify warning was logged
      const warnLogs = mockLogger.calls.warn;
      expect(
        warnLogs.some(
          (args: any[]) =>
            typeof args[0] === "string" && args[0].includes("Lease expired"),
        ),
      ).toBe(true);
    });

    it("should stop heartbeat when state changes to PENDING", async () => {
      jest.useFakeTimers();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-pending", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      mockClient.setHandler("sendMessageHeartBeat", (_req: any, cb: any) => {
        // State 1 = PENDING
        cb(null, { state: 1, remainingTime: { seconds: 0 } });
      });

      await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true,
        1000,
        undefined,
      );

      expect(messageClient.hasActiveHeartbeat("test-msg-pending")).toBe(true);

      jest.advanceTimersByTime(1000);

      expect(messageClient.hasActiveHeartbeat("test-msg-pending")).toBe(false);
    });
  });

  describe("Heartbeat success logging", () => {
    it("should log debug message on successful heartbeat with remaining time", async () => {
      jest.useFakeTimers();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-success-log", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      mockClient.setHandler("sendMessageHeartBeat", (_req: any, cb: any) => {
        // State 2 = LEASED (active)
        cb(null, { state: 2, remainingTime: { seconds: 25 } });
      });

      await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true,
        1000,
        undefined,
      );

      mockLogger.calls.debug = [];
      jest.advanceTimersByTime(1000);

      const debugLogs = mockLogger.calls.debug;
      expect(
        debugLogs.some(
          (args) =>
            args[0]?.includes?.("Heartbeat OK") &&
            args[0]?.includes?.("25s remaining"),
        ),
      ).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should handle heartbeat response after heartbeat was stopped", async () => {
      jest.useFakeTimers();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-race", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      mockClient.setHandler("sendMessageHeartBeat", (_req: any, cb: any) => {
        // Simulate delayed response - stop heartbeat before callback
        messageClient.stopAllHeartbeats();
        cb({ code: 2, message: "UNKNOWN error" }, null);
      });

      await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true,
        1000,
        undefined,
      );

      // Should not throw when heartbeat response arrives after stop
      expect(() => jest.advanceTimersByTime(1000)).not.toThrow();
    });

    it("should not track heartbeat when message has no messageId", async () => {
      jest.useFakeTimers();

      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { payload: {} }, // No messageId
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      const result = await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        true, // enableHeartbeat = true
        1000,
        undefined,
      );

      // stopHeartbeat is provided but no heartbeat should be tracked since messageId is missing
      expect(result.stopHeartbeat).toBeDefined();
      // No heartbeat should be in the map since there's no messageId
      // The implementation checks for message.messageId before setting up heartbeat
    });

    it("should not provide stopHeartbeat when heartbeat is disabled", async () => {
      mockClient.setHandler("getNextMessage", (_req: any, cb: any) => {
        cb(null, {
          message: { messageId: "test-msg-no-hb", payload: {} },
          workerId: "worker-1",
          attemptId: "attempt-1",
        });
      });

      const result = await messageClient.getNextMessage(
        "test-queue",
        undefined,
        undefined,
        false, // enableHeartbeat = false
        1000,
        undefined,
      );

      expect(result.stopHeartbeat).toBeUndefined();
      expect(messageClient.hasActiveHeartbeat("test-msg-no-hb")).toBe(false);
    });
  });
});
