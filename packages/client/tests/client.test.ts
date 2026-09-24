import { NzovuClient } from "../src/client";
import { Connection } from "../src/connection";
import { MessageClient } from "../src/message";
import { QueueClient } from "../src/queue";
import { ScheduleClient } from "../src/schedule";

describe("NzovuClient", () => {
  let client: NzovuClient;

  beforeEach(() => {
    client = new NzovuClient({
      connection: {
        address: "localhost:9000",
      },
    });
  });

  afterEach(async () => {
    if (client.isConnected()) {
      await client.disconnect();
    }
  });

  describe("constructor", () => {
    it("should create a new client instance", () => {
      expect(client).toBeInstanceOf(NzovuClient);
    });

    it("should initialize sub-clients", () => {
      expect(client.queues).toBeInstanceOf(QueueClient);
      expect(client.messages).toBeInstanceOf(MessageClient);
      expect(client.schedules).toBeInstanceOf(ScheduleClient);
    });

    it("should start disconnected", () => {
      expect(client.isConnected()).toBe(false);
    });

    it("should accept optional workerId in config", () => {
      const clientWithWorkerId = new NzovuClient({
        connection: {
          address: "localhost:9000",
        },
        workerId: "worker-123",
      });
      expect(clientWithWorkerId.workerId).toBe("worker-123");
    });

    it("should pass workerId to MessageClient", () => {
      const clientWithWorkerId = new NzovuClient({
        connection: {
          address: "localhost:9000",
        },
        workerId: "worker-456",
      });
      expect(clientWithWorkerId.messages.getWorkerId()).toBe("worker-456");
    });

    it("should have undefined workerId when not provided", () => {
      expect(client.workerId).toBeUndefined();
      expect(client.messages.getWorkerId()).toBeUndefined();
    });
  });

  describe("connection management", () => {
    it("should report connected status", async () => {
      // Initially disconnected
      expect(client.isConnected()).toBe(false);
    });

    it("should have connect method", () => {
      expect(typeof client.connect).toBe("function");
    });

    it("should have disconnect method", () => {
      expect(typeof client.disconnect).toBe("function");
    });
  });
});

describe("Connection", () => {
  let connection: Connection;

  beforeEach(() => {
    connection = new Connection({
      address: "localhost:9000",
    });
  });

  afterEach(async () => {
    if (connection.isConnected()) {
      await connection.disconnect();
    }
  });

  describe("constructor", () => {
    it("should create a new connection instance", () => {
      expect(connection).toBeInstanceOf(Connection);
    });

    it("should start disconnected", () => {
      expect(connection.isConnected()).toBe(false);
    });

    it("should accept custom timeout", () => {
      const customConnection = new Connection({
        address: "localhost:9000",
        timeout: 5000,
      });
      expect(customConnection).toBeInstanceOf(Connection);
    });
  });

  describe("isConnected", () => {
    it("should return false when disconnected", () => {
      expect(connection.isConnected()).toBe(false);
    });
  });
});

describe("QueueClient", () => {
  let connection: Connection;
  let queueClient: QueueClient;

  beforeEach(() => {
    connection = new Connection({
      address: "localhost:9000",
    });
    queueClient = new QueueClient(connection);
  });

  describe("constructor", () => {
    it("should create a new queue client instance", () => {
      expect(queueClient).toBeInstanceOf(QueueClient);
    });

    it("should have createQueue method", () => {
      expect(typeof queueClient.createQueue).toBe("function");
    });

    it("should have deleteQueue method", () => {
      expect(typeof queueClient.deleteQueue).toBe("function");
    });

    it("should have getQueueState method", () => {
      expect(typeof queueClient.getQueueState).toBe("function");
    });

    it("should have listQueues method", () => {
      expect(typeof queueClient.listQueues).toBe("function");
    });
  });
});

describe("MessageClient", () => {
  let connection: Connection;
  let messageClient: MessageClient;

  beforeEach(() => {
    connection = new Connection({
      address: "localhost:9000",
    });
    messageClient = new MessageClient(connection);
  });

  describe("constructor", () => {
    it("should create a new message client instance", () => {
      expect(messageClient).toBeInstanceOf(MessageClient);
    });

    it("should accept optional workerId", () => {
      const clientWithWorkerId = new MessageClient(connection, "worker-123");
      expect(clientWithWorkerId.getWorkerId()).toBe("worker-123");
    });

    it("should have undefined workerId when not provided", () => {
      expect(messageClient.getWorkerId()).toBeUndefined();
    });

    it("should have postMessage method", () => {
      expect(typeof messageClient.postMessage).toBe("function");
    });

    it("should have getNextMessage method", () => {
      expect(typeof messageClient.getNextMessage).toBe("function");
    });

    it("should have acknowledgeMessage method", () => {
      expect(typeof messageClient.acknowledgeMessage).toBe("function");
    });

    it("should have cancelMessage method", () => {
      expect(typeof messageClient.cancelMessage).toBe("function");
    });

    it("should have sendHeartbeat method", () => {
      expect(typeof messageClient.sendHeartbeat).toBe("function");
    });

    it("should have renewMessageLease method", () => {
      expect(typeof messageClient.renewMessageLease).toBe("function");
    });

    it("should have peekQueueMessages method", () => {
      expect(typeof messageClient.peekQueueMessages).toBe("function");
    });

    it("should have hasActiveHeartbeat method", () => {
      expect(typeof messageClient.hasActiveHeartbeat).toBe("function");
    });

    it("should have stopAllHeartbeats method", () => {
      expect(typeof messageClient.stopAllHeartbeats).toBe("function");
    });

    it("should have getHeartbeatHealth method", () => {
      expect(typeof messageClient.getHeartbeatHealth).toBe("function");
    });
  });

  describe("workerId management", () => {
    it("should allow setting workerId after construction", () => {
      expect(messageClient.getWorkerId()).toBeUndefined();
      messageClient.setWorkerId("new-worker-id");
      expect(messageClient.getWorkerId()).toBe("new-worker-id");
    });
  });

  describe("heartbeat tracking", () => {
    it("should return false for hasActiveHeartbeat when no heartbeat exists", () => {
      expect(messageClient.hasActiveHeartbeat("non-existent-message")).toBe(
        false,
      );
    });

    it("should return undefined for getHeartbeatHealth when no heartbeat exists", () => {
      expect(
        messageClient.getHeartbeatHealth("non-existent-message"),
      ).toBeUndefined();
    });

    it("should call stopAllHeartbeats without error when no heartbeats exist", () => {
      expect(() => messageClient.stopAllHeartbeats()).not.toThrow();
    });
  });
});

describe("ScheduleClient", () => {
  let connection: Connection;
  let scheduleClient: ScheduleClient;

  beforeEach(() => {
    connection = new Connection({
      address: "localhost:9000",
    });
    scheduleClient = new ScheduleClient(connection);
  });

  describe("constructor", () => {
    it("should create a new schedule client instance", () => {
      expect(scheduleClient).toBeInstanceOf(ScheduleClient);
    });

    it("should have createSchedule method", () => {
      expect(typeof scheduleClient.createSchedule).toBe("function");
    });

    it("should have getSchedule method", () => {
      expect(typeof scheduleClient.getSchedule).toBe("function");
    });

    it("should have listSchedules method", () => {
      expect(typeof scheduleClient.listSchedules).toBe("function");
    });

    it("should have deleteSchedule method", () => {
      expect(typeof scheduleClient.deleteSchedule).toBe("function");
    });

    it("should have pauseSchedule method", () => {
      expect(typeof scheduleClient.pauseSchedule).toBe("function");
    });

    it("should have resumeSchedule method", () => {
      expect(typeof scheduleClient.resumeSchedule).toBe("function");
    });
  });
});
