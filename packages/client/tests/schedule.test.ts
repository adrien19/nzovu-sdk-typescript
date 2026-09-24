import { Schedule } from "@nzovu/proto";
import { Connection } from "../src/connection";
import { ScheduleClient } from "../src/schedule";

// Create a mock gRPC client for testing
const createMockClient = () => {
  const handlers: Record<string, Function> = {};
  return {
    createSchedule: jest.fn((req, cb) => {
      if (handlers.createSchedule) handlers.createSchedule(req, cb);
      else cb(null, { success: true });
    }),
    getSchedule: jest.fn((req, cb) => {
      if (handlers.getSchedule) handlers.getSchedule(req, cb);
      else cb(null, { schedule: null });
    }),
    listSchedules: jest.fn((req, cb) => {
      if (handlers.listSchedules) handlers.listSchedules(req, cb);
      else cb(null, { schedules: [] });
    }),
    deleteSchedule: jest.fn((req, cb) => {
      if (handlers.deleteSchedule) handlers.deleteSchedule(req, cb);
      else cb(null, { success: true });
    }),
    pauseSchedule: jest.fn((req, cb) => {
      if (handlers.pauseSchedule) handlers.pauseSchedule(req, cb);
      else cb(null, { success: true });
    }),
    resumeSchedule: jest.fn((req, cb) => {
      if (handlers.resumeSchedule) handlers.resumeSchedule(req, cb);
      else cb(null, { success: true });
    }),
    getScheduleHistory: jest.fn((req, cb) => {
      if (handlers.getScheduleHistory) handlers.getScheduleHistory(req, cb);
      else cb(null, { scheduleHistory: null });
    }),
    setHandler: (method: string, handler: Function) => {
      handlers[method] = handler;
    },
    clearHandlers: () => {
      Object.keys(handlers).forEach((k) => delete handlers[k]);
    },
  };
};

describe("ScheduleClient", () => {
  let connection: Connection;
  let scheduleClient: ScheduleClient;
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

    scheduleClient = new ScheduleClient(connection);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createSchedule", () => {
    it("should create a schedule successfully", async () => {
      mockClient.setHandler("createSchedule", (_req: any, cb: any) => {
        cb(null, { success: true });
      });

      const schedule = Schedule.Schedule.fromPartial({
        scheduleId: "test-schedule-1",
        metadata: {
          queueName: "test-queue",
          cronSchedule: "0 * * * *",
          priority: "0",
        },
      });

      const result = await scheduleClient.createSchedule(schedule as any);
      expect(result).toBe(true);
      expect(mockClient.createSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ schedule }),
        expect.any(Function),
      );
    });

    it("should return false when creation fails", async () => {
      mockClient.setHandler("createSchedule", (_req: any, cb: any) => {
        cb(null, { success: false });
      });

      const schedule = Schedule.Schedule.fromPartial({
        scheduleId: "test-schedule-2",
        metadata: {
          queueName: "test-queue",
          cronSchedule: "0 * * * *",
          priority: "0",
        },
      });

      const result = await scheduleClient.createSchedule(schedule as any);
      expect(result).toBe(false);
    });

    it("should reject when server returns error", async () => {
      mockClient.setHandler("createSchedule", (_req: any, cb: any) => {
        cb(new Error("Server error"), null);
      });

      const schedule = Schedule.Schedule.fromPartial({
        scheduleId: "test-schedule-3",
        metadata: {
          queueName: "test-queue",
          cronSchedule: "0 * * * *",
          priority: "0",
        },
      });

      await expect(
        scheduleClient.createSchedule(schedule as any),
      ).rejects.toThrow("Server error");
    });

    it("should throw error when schedule is not provided", async () => {
      await expect(
        scheduleClient.createSchedule(null as any),
      ).rejects.toThrow();
    });
  });

  describe("getSchedule", () => {
    it("should get a schedule by ID", async () => {
      const expectedSchedule = {
        scheduleId: "test-schedule-1",
        queueName: "test-queue",
        cronExpression: "0 * * * *",
      };

      mockClient.setHandler("getSchedule", (_req: any, cb: any) => {
        cb(null, { schedule: expectedSchedule });
      });

      const result = await scheduleClient.getSchedule("test-schedule-1");
      expect(result).toEqual(expectedSchedule);
      expect(mockClient.getSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: "test-schedule-1" }),
        expect.any(Function),
      );
    });

    it("should return undefined when schedule not found", async () => {
      mockClient.setHandler("getSchedule", (_req: any, cb: any) => {
        cb(null, { schedule: undefined });
      });

      const result = await scheduleClient.getSchedule("non-existent");
      expect(result).toBeUndefined();
    });

    it("should reject when server returns error", async () => {
      mockClient.setHandler("getSchedule", (_req: any, cb: any) => {
        cb(new Error("Not found"), null);
      });

      await expect(
        scheduleClient.getSchedule("test-schedule-1"),
      ).rejects.toThrow("Not found");
    });

    it("should throw error when scheduleId is not provided", async () => {
      await expect(scheduleClient.getSchedule("")).rejects.toThrow();
    });
  });

  describe("listSchedules", () => {
    it("should list all schedules", async () => {
      const expectedSchedules = [
        { scheduleId: "schedule-1", queueName: "queue-1" },
        { scheduleId: "schedule-2", queueName: "queue-2" },
      ];

      mockClient.setHandler("listSchedules", (_req: any, cb: any) => {
        cb(null, { schedules: expectedSchedules });
      });

      const result = await scheduleClient.listSchedules();
      expect(result.schedules).toEqual(expectedSchedules);
      expect(mockClient.listSchedules).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: "" }),
        expect.any(Function),
      );
    });

    it("should list schedules with prefix filter", async () => {
      const expectedSchedules = [
        { scheduleId: "prod-schedule-1", queueName: "queue-1" },
      ];

      mockClient.setHandler("listSchedules", (req: any, cb: any) => {
        if (req.prefix === "prod-") {
          cb(null, { schedules: expectedSchedules });
        } else {
          cb(null, { schedules: [] });
        }
      });

      const result = await scheduleClient.listSchedules({ prefix: "prod-" });
      expect(result.schedules).toEqual(expectedSchedules);
      expect(mockClient.listSchedules).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: "prod-" }),
        expect.any(Function),
      );
    });

    it("should return empty array when no schedules exist", async () => {
      mockClient.setHandler("listSchedules", (_req: any, cb: any) => {
        cb(null, { schedules: [] });
      });

      const result = await scheduleClient.listSchedules();
      expect(result.schedules).toEqual([]);
    });

    it("should return an empty page", async () => {
      mockClient.setHandler("listSchedules", (_req: any, cb: any) => {
        cb(null, { schedules: [], nextPageToken: "" });
      });

      const result = await scheduleClient.listSchedules();
      expect(result.schedules).toEqual([]);
    });

    it("should reject when server returns error", async () => {
      mockClient.setHandler("listSchedules", (_req: any, cb: any) => {
        cb(new Error("Server unavailable"), null);
      });

      await expect(scheduleClient.listSchedules()).rejects.toThrow(
        "Server unavailable",
      );
    });
  });

  describe("deleteSchedule", () => {
    it("should delete a schedule successfully", async () => {
      mockClient.setHandler("deleteSchedule", (_req: any, cb: any) => {
        cb(null, { success: true });
      });

      const result = await scheduleClient.deleteSchedule("test-schedule-1");
      expect(result).toBe(true);
      expect(mockClient.deleteSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: "test-schedule-1" }),
        expect.any(Function),
      );
    });

    it("should return false when deletion fails", async () => {
      mockClient.setHandler("deleteSchedule", (_req: any, cb: any) => {
        cb(null, { success: false });
      });

      const result = await scheduleClient.deleteSchedule("test-schedule-1");
      expect(result).toBe(false);
    });

    it("should reject when server returns error", async () => {
      mockClient.setHandler("deleteSchedule", (_req: any, cb: any) => {
        cb(new Error("Permission denied"), null);
      });

      await expect(
        scheduleClient.deleteSchedule("test-schedule-1"),
      ).rejects.toThrow("Permission denied");
    });

    it("should throw error when scheduleId is not provided", async () => {
      await expect(scheduleClient.deleteSchedule("")).rejects.toThrow();
    });
  });

  describe("pauseSchedule", () => {
    it("should pause a schedule successfully", async () => {
      mockClient.setHandler("pauseSchedule", (_req: any, cb: any) => {
        cb(null, { success: true });
      });

      const result = await scheduleClient.pauseSchedule("test-schedule-1");
      expect(result).toBe(true);
      expect(mockClient.pauseSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: "test-schedule-1" }),
        expect.any(Function),
      );
    });

    it("should return false when pause fails", async () => {
      mockClient.setHandler("pauseSchedule", (_req: any, cb: any) => {
        cb(null, { success: false });
      });

      const result = await scheduleClient.pauseSchedule("test-schedule-1");
      expect(result).toBe(false);
    });

    it("should reject when server returns error", async () => {
      mockClient.setHandler("pauseSchedule", (_req: any, cb: any) => {
        cb(new Error("Schedule not found"), null);
      });

      await expect(
        scheduleClient.pauseSchedule("test-schedule-1"),
      ).rejects.toThrow("Schedule not found");
    });

    it("should throw error when scheduleId is not provided", async () => {
      await expect(scheduleClient.pauseSchedule("")).rejects.toThrow();
    });
  });

  describe("resumeSchedule", () => {
    it("should resume a schedule successfully", async () => {
      mockClient.setHandler("resumeSchedule", (_req: any, cb: any) => {
        cb(null, { success: true });
      });

      const result = await scheduleClient.resumeSchedule("test-schedule-1");
      expect(result).toBe(true);
      expect(mockClient.resumeSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: "test-schedule-1" }),
        expect.any(Function),
      );
    });

    it("should return false when resume fails", async () => {
      mockClient.setHandler("resumeSchedule", (_req: any, cb: any) => {
        cb(null, { success: false });
      });

      const result = await scheduleClient.resumeSchedule("test-schedule-1");
      expect(result).toBe(false);
    });

    it("should reject when server returns error", async () => {
      mockClient.setHandler("resumeSchedule", (_req: any, cb: any) => {
        cb(new Error("Schedule not found"), null);
      });

      await expect(
        scheduleClient.resumeSchedule("test-schedule-1"),
      ).rejects.toThrow("Schedule not found");
    });

    it("should throw error when scheduleId is not provided", async () => {
      await expect(scheduleClient.resumeSchedule("")).rejects.toThrow();
    });
  });

  describe("getScheduleHistory", () => {
    it("should get schedule history successfully", async () => {
      const expectedHistory = {
        scheduleId: "test-schedule-1",
        messages: [
          { messageId: "msg-1", queueName: "test-queue" },
          { messageId: "msg-2", queueName: "test-queue" },
        ],
        nextRun: new Date("2024-01-01T10:00:00Z"),
        lastRun: new Date("2024-01-01T09:00:00Z"),
      };

      mockClient.setHandler("getScheduleHistory", (_req: any, cb: any) => {
        cb(null, { scheduleHistory: expectedHistory });
      });

      const result = await scheduleClient.getScheduleHistory("test-schedule-1");
      expect(result.scheduleHistory).toEqual(expectedHistory);
      expect(mockClient.getScheduleHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleId: "test-schedule-1",
          pageSize: 0,
          pageToken: "",
        }),
        expect.any(Function),
      );
    });

    it("should use custom limit when provided", async () => {
      mockClient.setHandler("getScheduleHistory", (_req: any, cb: any) => {
        cb(null, {
          scheduleHistory: { scheduleId: "test-schedule-1", messages: [] },
        });
      });

      await scheduleClient.getScheduleHistory("test-schedule-1", {
        pageSize: 50,
      });
      expect(mockClient.getScheduleHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleId: "test-schedule-1",
          pageSize: 50,
          pageToken: "",
        }),
        expect.any(Function),
      );
    });

    it("should return undefined when no history found", async () => {
      mockClient.setHandler("getScheduleHistory", (_req: any, cb: any) => {
        cb(null, { scheduleHistory: undefined });
      });

      const result = await scheduleClient.getScheduleHistory("test-schedule-1");
      expect(result.scheduleHistory).toBeUndefined();
    });

    it("should reject when server returns error", async () => {
      mockClient.setHandler("getScheduleHistory", (_req: any, cb: any) => {
        cb(new Error("Schedule not found"), null);
      });

      await expect(
        scheduleClient.getScheduleHistory("test-schedule-1"),
      ).rejects.toThrow("Schedule not found");
    });

    it("should throw error when scheduleId is not provided", async () => {
      await expect(scheduleClient.getScheduleHistory("")).rejects.toThrow();
    });
  });
});
