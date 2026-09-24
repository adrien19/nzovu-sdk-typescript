import * as grpc from "@grpc/grpc-js";
import { Message, QueueServiceTypes as R } from "@nzovu/proto";
import { Connection } from "../src/connection";
import { MessageClient, LeaseClaim } from "../src/message";
import { ErrorCode } from "../src/types";

const running = Message.Message_Metadata_State.RUNNING;
const completed = Message.Message_Metadata_State.COMPLETED;
const fail = (code: grpc.status, details: string) =>
  Object.assign(new Error(details), {
    code,
    details,
    metadata: new grpc.Metadata(),
  });
let client: MessageClient;
let connection: Connection;
let rpc: Record<string, jest.Mock>;
const claim = (queueName = "q", attemptId = "a"): LeaseClaim => ({
  queueName,
  messageId: "m",
  workerId: "w",
  attemptId,
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(Math, "random").mockReturnValue(0.5);
  rpc = {
    getNextMessage: jest.fn((request, cb) =>
      cb(
        null,
        R.GetNextMessageResponse.fromPartial({
          message: { messageId: "m" },
          workerId: "w",
          attemptId: request.attemptId ?? "a",
        }),
      ),
    ),
    acknowledgeMessage: jest.fn((_request, cb) => cb(null, { success: true })),
    cancelMessage: jest.fn((_request, cb) => cb(null, { success: true })),
    sendMessageHeartBeat: jest.fn((_request, cb) =>
      cb(null, { state: running }),
    ),
    renewMessageLease: jest.fn((_request, cb) => cb(null, { state: running })),
  };
  connection = new Connection({ address: "localhost:9000", insecure: true });
  jest.spyOn(connection, "getQueueServiceClient").mockReturnValue(rpc as any);
  client = new MessageClient(connection);
});
afterEach(async () => {
  client.stopAllHeartbeats();
  await client.drain();
  jest.restoreAllMocks();
  jest.useRealTimers();
});
const acquire = (
  queueName = "q",
  attemptId = "a",
  auto = true,
  callback?: (id: string, error: Error, count: number) => void,
) =>
  client.getNextMessage(
    queueName,
    undefined,
    undefined,
    auto,
    100,
    "w",
    callback,
    attemptId,
  );

it("records immutable ownership even without automatic heartbeat", async () => {
  const response = await acquire("q", "a", false);
  expect(response.claim).toEqual(claim());
  expect(Object.isFrozen(response.claim)).toBe(true);
  expect(client.getHeartbeatHealth(response.claim!)).toMatchObject({
    isActive: false,
  });
  await expect(
    client.acknowledgeMessage("q", "m", completed),
  ).rejects.toMatchObject({ code: ErrorCode.INVALID_ARGUMENT });
  expect(rpc.acknowledgeMessage).not.toHaveBeenCalled();
});
it("keeps duplicate message IDs in different queues independent", async () => {
  await acquire("q1");
  await acquire("q2");
  await client.acknowledgeMessage("q1", "m", completed, "w", "a");
  expect(client.hasActiveHeartbeat(claim("q1"))).toBe(false);
  expect(client.hasActiveHeartbeat(claim("q2"))).toBe(true);
  await jest.advanceTimersByTimeAsync(100);
  expect(rpc.sendMessageHeartBeat).toHaveBeenCalledWith(
    claim("q2"),
    expect.any(Function),
  );
});
it("never substitutes a new attempt when acknowledging an older claim", async () => {
  await acquire("q", "old");
  await acquire("q", "new");
  await client.acknowledgeMessage("q", "m", completed, "w", "old");
  expect(rpc.acknowledgeMessage.mock.calls[0][0].attemptId).toBe("old");
  expect(client.hasActiveHeartbeat(claim("q", "new"))).toBe(true);
});
it.each([
  grpc.status.UNAVAILABLE,
  grpc.status.INTERNAL,
  grpc.status.DEADLINE_EXCEEDED,
])("retains heartbeat on transient ACK error %s", async (code) => {
  await acquire();
  rpc.acknowledgeMessage.mockImplementation((_req, cb) =>
    cb(fail(code, "transport failure")),
  );
  await expect(
    client.acknowledgeMessage("q", "m", completed, "w", "a"),
  ).rejects.toThrow("transport failure");
  expect(client.hasActiveHeartbeat(claim())).toBe(true);
  expect(rpc.acknowledgeMessage).toHaveBeenCalledTimes(1);
});
it("retains claim on a false ACK, stops after confirmed success", async () => {
  await acquire();
  rpc.acknowledgeMessage.mockImplementationOnce((_req, cb) =>
    cb(null, { success: false }),
  );
  expect(await client.acknowledgeMessage("q", "m", completed, "w", "a")).toBe(
    false,
  );
  expect(client.hasActiveHeartbeat(claim())).toBe(true);
  await client.acknowledgeMessage("q", "m", completed, "w", "a");
  expect(client.getHeartbeatHealth(claim())).toBeUndefined();
});
describe.each([
  ["acknowledgeMessage", "failed to acknowledge message"],
  ["renewMessageLease", "failed to renew message lease"],
  ["sendMessageHeartBeat", "failed to send message heartbeat"],
])("ownership errors from %s", (method, prefix) => {
  const invoke = () =>
    method === "acknowledgeMessage"
      ? client.acknowledgeMessage("q", "m", completed, "w", "a")
      : method === "renewMessageLease"
        ? client.renewMessageLease("q", "m", undefined, "w", "a")
        : client.sendHeartbeat("q", "m", "w", "a");

  it.each([
    [grpc.status.FAILED_PRECONDITION, "message is owned by another attempt"],
    [grpc.status.FAILED_PRECONDITION, "message is not running"],
    [
      grpc.status.FAILED_PRECONDITION,
      "message state changed during the operation",
    ],
    [grpc.status.DEADLINE_EXCEEDED, "message lease has expired"],
    [grpc.status.NOT_FOUND, "message missing"],
  ])("releases only the lost claim on %s / %s", async (code, reason) => {
    await acquire();
    await acquire("q", "new");
    const details = `${prefix}: ${reason}`;
    rpc[method].mockImplementation((_req, cb) =>
      cb(fail(code as grpc.status, details)),
    );
    await expect(invoke()).rejects.toMatchObject({ message: details, details });
    expect(client.getHeartbeatHealth(claim())).toBeUndefined();
    expect(client.hasActiveHeartbeat(claim("q", "new"))).toBe(true);
  });

  it.each([
    [
      grpc.status.FAILED_PRECONDITION,
      "lease renewal limit reached: 1/1 renewals used",
    ],
    [grpc.status.FAILED_PRECONDITION, "lease cannot be extended"],
    [grpc.status.DEADLINE_EXCEEDED, "Deadline exceeded after 0.100s"],
  ])("retains the claim on %s / %s", async (code, reason) => {
    await acquire();
    const details = `${prefix}: ${reason}`;
    rpc[method].mockImplementation((_req, cb) =>
      cb(fail(code as grpc.status, details)),
    );
    await expect(invoke()).rejects.toMatchObject({ message: details, details });
    expect(client.hasActiveHeartbeat(claim())).toBe(true);
  });
});
it("never overlaps automatic heartbeat calls", async () => {
  let complete: Function;
  rpc.sendMessageHeartBeat.mockImplementation((_req, cb) => {
    complete = cb;
  });
  await acquire();
  await jest.advanceTimersByTimeAsync(1000);
  expect(rpc.sendMessageHeartBeat).toHaveBeenCalledTimes(1);
  complete!(null, { state: running });
  await jest.advanceTimersByTimeAsync(100);
  expect(rpc.sendMessageHeartBeat).toHaveBeenCalledTimes(2);
});
it("retains health after bounded failures and isolates callback errors", async () => {
  const onFailure = jest.fn(() => {
    throw new Error("user callback");
  });
  rpc.sendMessageHeartBeat.mockImplementation((_req, cb) =>
    cb(fail(grpc.status.UNAVAILABLE, "temporary")),
  );
  await acquire("q", "a", true, onFailure);
  await jest.advanceTimersByTimeAsync(300);
  expect(onFailure).toHaveBeenCalledTimes(3);
  expect(client.getHeartbeatHealth(claim())).toMatchObject({
    isActive: false,
    consecutiveFailures: 3,
  });
});
it("resets consecutive heartbeat failures after recovery", async () => {
  rpc.sendMessageHeartBeat.mockImplementationOnce((_req, cb) =>
    cb(fail(grpc.status.UNAVAILABLE, "temporary")),
  );
  await acquire();
  await jest.advanceTimersByTimeAsync(100);
  expect(client.getHeartbeatHealth(claim())?.consecutiveFailures).toBe(1);
  await jest.advanceTimersByTimeAsync(100);
  expect(client.getHeartbeatHealth(claim())?.consecutiveFailures).toBe(0);
});
it("rejects acquisitions at capacity before claiming additional work", async () => {
  client = new MessageClient(connection, undefined, undefined, 1);
  await acquire("q", "a", false);
  await expect(acquire("other")).rejects.toMatchObject({
    code: ErrorCode.RESOURCE_EXHAUSTED,
  });
  expect(rpc.getNextMessage).toHaveBeenCalledTimes(1);
  client.releaseClaim(claim());
  await acquire("other");
});
it("reserves capacity during concurrent acquisitions and frees it on error", async () => {
  client = new MessageClient(connection, undefined, undefined, 1);
  let complete: Function;
  rpc.getNextMessage.mockImplementationOnce((_req, cb) => {
    complete = cb;
  });
  const first = acquire();
  const checked = expect(first).rejects.toThrow("failed");
  await expect(acquire()).rejects.toMatchObject({
    code: ErrorCode.RESOURCE_EXHAUSTED,
  });
  complete!(new Error("failed"));
  await checked;
  await acquire();
});
it("disconnect cancels in-flight work and ignores late acquisition callbacks", async () => {
  let complete: Function;
  rpc.getNextMessage.mockImplementation((_req, cb) => {
    complete = cb;
    return { cancel: jest.fn() };
  });
  const pending = acquire();
  const checked = expect(pending).rejects.toMatchObject({
    code: ErrorCode.CANCELLED,
  });
  await connection.disconnect();
  await checked;
  await client.drain();
  complete!(null, {
    message: { messageId: "m" },
    workerId: "w",
    attemptId: "a",
  });
  expect(client.getHeartbeatHealth(claim())).toBeUndefined();
  expect(jest.getTimerCount()).toBe(0);
});
it("shutdown cancels an outstanding heartbeat and prevents rescheduling", async () => {
  const cancel = jest.fn();
  let complete: Function;
  rpc.sendMessageHeartBeat.mockImplementation((_req, cb) => {
    complete = cb;
    return { cancel };
  });
  await acquire();
  await jest.advanceTimersByTimeAsync(100);
  client.stopAllHeartbeats();
  await client.drain();
  expect(cancel).toHaveBeenCalledTimes(1);
  complete!(null, { state: running });
  await jest.advanceTimersByTimeAsync(1000);
  expect(rpc.sendMessageHeartBeat).toHaveBeenCalledTimes(1);
});
it("retains claims until cancellation succeeds", async () => {
  await acquire();
  rpc.cancelMessage.mockImplementationOnce((_req, cb) =>
    cb(fail(grpc.status.UNAVAILABLE, "transient")),
  );
  await expect(client.cancelMessage("q", "m")).rejects.toThrow();
  expect(client.hasActiveHeartbeat(claim())).toBe(true);
  await client.cancelMessage("q", "m");
  expect(client.hasActiveHeartbeat(claim())).toBe(false);
});
it("rejects acquisition responses without ownership", async () => {
  rpc.getNextMessage.mockImplementation((_req, cb) =>
    cb(null, { message: { messageId: "m" } }),
  );
  await expect(acquire()).rejects.toMatchObject({ code: ErrorCode.DATA_LOSS });
});

it("coalesces manual heartbeat with an active automatic heartbeat", async () => {
  let complete: Function;
  rpc.sendMessageHeartBeat.mockImplementation((_req, cb) => {
    complete = cb;
  });
  await acquire();
  await jest.advanceTimersByTimeAsync(100);
  const manual = client.sendHeartbeat("q", "m", "w", "a");
  expect(rpc.sendMessageHeartBeat).toHaveBeenCalledTimes(1);
  complete!(null, { state: running });
  await manual;
});
