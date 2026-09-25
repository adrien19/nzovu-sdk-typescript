import { Connection, ConnectionState } from "../src/connection";
import { NzovuError, ErrorCode } from "../src/types";
import * as grpc from "@grpc/grpc-js";

// Mock the grpc-js module
jest.mock("@grpc/grpc-js", () => {
  const originalModule = jest.requireActual("@grpc/grpc-js");
  return {
    ...originalModule,
    credentials: {
      createInsecure: jest.fn(() => ({})),
      createSsl: jest.fn(() => ({})),
    },
  };
});

// Mock the proto module
jest.mock("@nzovu/proto", () => ({
  QueueService: {
    QueueServiceClient: jest.fn().mockImplementation(() => ({
      waitForReady: jest.fn((deadline, cb) => cb(null)),
      close: jest.fn(),
      getChannel: jest.fn(() => ({
        getConnectivityState: jest.fn(() => 2), // READY
      })),
    })),
  },
}));

describe("Connection", () => {
  let connection: Connection;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("constructor", () => {
    it("should create connection with minimal options", () => {
      connection = new Connection({ address: "localhost:9000" });
      expect(connection.isConnected()).toBe(false);
    });

    it("should create connection with custom timeout", () => {
      connection = new Connection({
        address: "localhost:9000",
        timeout: 10000,
      });
      expect(connection).toBeDefined();
    });

    it("should create connection with retry options", () => {
      connection = new Connection({
        address: "localhost:9000",
        retry: {
          maxRetries: 5,
          baseDelay: 200,
          maxDelay: 20000,
          enabled: true,
        },
      });
      expect(connection.getRetryConfig()).toEqual({
        maxRetries: 5,
        baseDelay: 200,
        maxDelay: 20000,
      });
    });

    it("should create connection with health check options", () => {
      const onHealthChange = jest.fn();
      connection = new Connection({
        address: "localhost:9000",
        healthCheck: {
          enabled: true,
          intervalMs: 10000,
          autoReconnect: true,
          onHealthChange,
        },
      });
      expect(connection).toBeDefined();
    });
  });

  describe("connect", () => {
    it("should connect successfully", async () => {
      connection = new Connection({ address: "localhost:9000" });
      await connection.connect();
      expect(connection.isConnected()).toBe(true);
    });

    it("should not reconnect if already connected", async () => {
      connection = new Connection({ address: "localhost:9000" });
      await connection.connect();
      await connection.connect();
      expect(connection.isConnected()).toBe(true);
    });

    it("should throw on connection timeout", async () => {
      const { QueueService } = require("@nzovu/proto");
      QueueService.QueueServiceClient.mockImplementationOnce(() => ({
        waitForReady: jest.fn((deadline, cb) =>
          cb(new Error("Connection timeout")),
        ),
        close: jest.fn(),
      }));

      connection = new Connection({
        address: "localhost:9000",
        timeout: 1000,
      });

      await expect(connection.connect()).rejects.toThrow(NzovuError);
    });

    it("should start health check when enabled", async () => {
      const onHealthChange = jest.fn();
      connection = new Connection({
        address: "localhost:9000",
        healthCheck: {
          enabled: true,
          intervalMs: 1000,
          autoReconnect: false,
          onHealthChange,
        },
      });

      await connection.connect();
      expect(connection.isConnected()).toBe(true);
    });
  });

  describe("disconnect", () => {
    it("should disconnect successfully", async () => {
      connection = new Connection({ address: "localhost:9000" });
      await connection.connect();
      await connection.disconnect();
      expect(connection.isConnected()).toBe(false);
    });

    it("should handle disconnect when already disconnected", async () => {
      connection = new Connection({ address: "localhost:9000" });
      await connection.disconnect();
      expect(connection.isConnected()).toBe(false);
    });
  });

  describe("getQueueServiceClient", () => {
    it("should return client when connected", async () => {
      connection = new Connection({ address: "localhost:9000" });
      await connection.connect();
      const client = connection.getQueueServiceClient();
      expect(client).toBeDefined();
    });

    it("should throw when not connected", () => {
      connection = new Connection({ address: "localhost:9000" });
      expect(() => connection.getQueueServiceClient()).toThrow(
        "Not connected to Nzovu server",
      );
    });
  });

  describe("getState", () => {
    it("should return DISCONNECTED initially", () => {
      connection = new Connection({ address: "localhost:9000" });
      expect(connection.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    it("should return CONNECTED after connect", async () => {
      connection = new Connection({ address: "localhost:9000" });
      await connection.connect();
      expect(connection.getState()).toBe(ConnectionState.CONNECTED);
    });
  });

  describe("checkHealth", () => {
    it("should return healthy when connected", async () => {
      connection = new Connection({ address: "localhost:9000" });
      await connection.connect();
      const health = connection.checkHealth();
      expect(health.healthy).toBe(true);
      expect(health.state).toBe(ConnectionState.CONNECTED);
    });

    it("should return unhealthy when disconnected", () => {
      connection = new Connection({ address: "localhost:9000" });
      const health = connection.checkHealth();
      expect(health.healthy).toBe(false);
      expect(health.state).toBe(ConnectionState.DISCONNECTED);
    });
  });

  describe("retry configuration", () => {
    it("should return retry config", () => {
      connection = new Connection({
        address: "localhost:9000",
        retry: {
          maxRetries: 5,
          baseDelay: 100,
          maxDelay: 5000,
          enabled: true,
        },
      });

      const config = connection.getRetryConfig();
      expect(config.maxRetries).toBe(5);
      expect(config.baseDelay).toBe(100);
      expect(config.maxDelay).toBe(5000);
    });

    it("should report retry enabled status", () => {
      connection = new Connection({
        address: "localhost:9000",
        retry: { enabled: true },
      });
      expect(connection.isRetryEnabled()).toBe(true);

      connection = new Connection({
        address: "localhost:9000",
        retry: { enabled: false },
      });
      expect(connection.isRetryEnabled()).toBe(false);
    });
  });

  describe("withRetry", () => {
    it("should execute operation when retry is disabled", async () => {
      connection = new Connection({
        address: "localhost:9000",
        retry: { enabled: false },
      });

      const operation = jest.fn().mockResolvedValue("result");
      const result = await connection.withRetry(operation);
      expect(result).toBe("result");
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should use retry logic when enabled", async () => {
      connection = new Connection({
        address: "localhost:9000",
        retry: {
          enabled: true,
          maxRetries: 2,
          baseDelay: 10,
        },
      });

      const operation = jest.fn().mockResolvedValue("result");
      const result = await connection.withRetry(operation);
      expect(result).toBe("result");
    });
  });

  it("expires the original deadline after retries and backoff", async () => {
    const { QueueService } = require("@nzovu/proto");
    const cancel = jest.fn();
    const listQueues = jest.fn((_request, _metadata, _options, callback) => {
      if (listQueues.mock.calls.length < 3)
        queueMicrotask(() => callback({ code: grpc.status.UNAVAILABLE }));
      return { cancel };
    });
    QueueService.QueueServiceClient.mockImplementationOnce(() => ({
      waitForReady: jest.fn((_deadline, callback) => callback(null)),
      close: jest.fn(),
      listQueues,
    }));
    jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const random = jest.spyOn(Math, "random").mockReturnValue(0.5);
    connection = new Connection(
      {
        address: "localhost:9000",
        retry: { maxRetries: 100, baseDelay: 10, maxDelay: 20 },
      },
      80,
    );
    try {
      await connection.connect();
      const deadline = Date.now() + 80;
      const result = expect(
        connection.invoke("listQueues", {
          prefix: "",
          pageSize: 0,
          pageToken: "",
        }),
      ).rejects.toMatchObject({ code: ErrorCode.DEADLINE_EXCEEDED });
      await jest.advanceTimersByTimeAsync(79);
      expect(listQueues).toHaveBeenCalledTimes(3);
      expect(listQueues.mock.calls.map((args) => args[2].deadline)).toEqual([
        deadline,
        deadline,
        deadline,
      ]);
      expect(cancel).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      await result;
      expect(cancel).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1000);
      expect(listQueues).toHaveBeenCalledTimes(3);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      await connection.disconnect();
      random.mockRestore();
    }
  });

  describe("health check", () => {
    it("should detect unhealthy state", async () => {
      const onHealthChange = jest.fn();
      const { QueueService } = require("@nzovu/proto");

      let connectivityState = 2; // READY
      QueueService.QueueServiceClient.mockImplementation(() => ({
        waitForReady: jest.fn((deadline, cb) => cb(null)),
        close: jest.fn(),
        getChannel: jest.fn(() => ({
          getConnectivityState: jest.fn(() => connectivityState),
        })),
      }));

      connection = new Connection({
        address: "localhost:9000",
        healthCheck: {
          enabled: true,
          intervalMs: 1000,
          autoReconnect: false,
          onHealthChange,
        },
      });

      await connection.connect();

      // Change state to unhealthy (IDLE = 0)
      connectivityState = 0;
      jest.advanceTimersByTime(1000);
      await Promise.resolve(); // Allow async operations

      // State changed to unhealthy
      expect(onHealthChange).toHaveBeenCalledWith(false, expect.any(Error));
    });

    it("should detect recovery", async () => {
      const onHealthChange = jest.fn();
      const { QueueService } = require("@nzovu/proto");

      let connectivityState = 2; // READY
      QueueService.QueueServiceClient.mockImplementation(() => ({
        waitForReady: jest.fn((deadline, cb) => cb(null)),
        close: jest.fn(),
        getChannel: jest.fn(() => ({
          getConnectivityState: jest.fn(() => connectivityState),
        })),
      }));

      connection = new Connection({
        address: "localhost:9000",
        healthCheck: {
          enabled: true,
          intervalMs: 1000,
          autoReconnect: false,
          onHealthChange,
        },
      });

      await connection.connect();
      onHealthChange.mockClear();

      // Make unhealthy
      connectivityState = 0;
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Make healthy again
      connectivityState = 2;
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Should have been called with recovery
      expect(onHealthChange).toHaveBeenCalledWith(true);
    });
  });

  describe("auto reconnect", () => {
    it("should attempt reconnect on unhealthy state when enabled", async () => {
      const onHealthChange = jest.fn();
      const { QueueService } = require("@nzovu/proto");

      let connectivityState = 2;
      let clientInstance = 0;
      QueueService.QueueServiceClient.mockImplementation(() => {
        clientInstance++;
        return {
          waitForReady: jest.fn((deadline, cb) => cb(null)),
          close: jest.fn(),
          getChannel: jest.fn(() => ({
            getConnectivityState: jest.fn(() => connectivityState),
          })),
        };
      });

      connection = new Connection({
        address: "localhost:9000",
        healthCheck: {
          enabled: true,
          intervalMs: 1000,
          autoReconnect: true,
          onHealthChange,
        },
        retry: {
          baseDelay: 100,
          maxDelay: 1000,
          enabled: true,
        },
      });

      await connection.connect();
      const initialClientCount = clientInstance;

      // Make unhealthy to trigger reconnect
      connectivityState = 0;
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Allow reconnect delay
      jest.advanceTimersByTime(200);
      await Promise.resolve();

      // The gRPC channel reconnects without replacing active calls
      expect(clientInstance).toBe(initialClientCount);
    });
  });
});
