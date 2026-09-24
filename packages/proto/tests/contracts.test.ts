import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Common, Message, QueueService, QueueServiceTypes } from "../src";

it("exposes precisely the pinned server RPC paths in the Nzovu namespace", () => {
  const source = readFileSync(
    resolve(__dirname, "../../../proto/queueservice/v1/service.proto"),
    "utf8",
  );
  const expected = [...source.matchAll(/\brpc\s+(\w+)/g)]
    .map((match) => `/nzovu.api.queueservice.v1.QueueService/${match[1]}`)
    .sort();
  const actual = Object.values(QueueService.QueueServiceService)
    .map((method) => method.path)
    .sort();
  expect(expected).toHaveLength(31);
  expect(actual).toEqual(expected);
});

it("round-trips ordered binary headers and int64 values without precision loss", () => {
  const original = Message.Message.fromPartial({
    messageId: "binary-headers",
    metadata: {
      headers: [
        { key: "x-data", value: Uint8Array.from([0, 255, 128]) },
        { key: "x-data", value: Uint8Array.from([1]) },
      ],
      leaseExpiry: "9007199254740993",
      priority: "0",
    },
  });
  const decoded = Message.Message.decode(
    Message.Message.encode(original).finish(),
  );
  expect(decoded).toEqual(original);
});

it("preserves absent versus explicitly zero lease renewal limits", () => {
  const absent = Common.LeasePolicy.fromPartial({});
  const zero = Common.LeasePolicy.fromPartial({ maxRenewals: 0 });
  expect(
    Common.LeasePolicy.decode(Common.LeasePolicy.encode(absent).finish())
      .maxRenewals,
  ).toBeUndefined();
  expect(
    Common.LeasePolicy.decode(Common.LeasePolicy.encode(zero).finish())
      .maxRenewals,
  ).toBe(0);
});

it("round-trips current pagination and claim ownership fields", () => {
  const page = QueueServiceTypes.PeekQueueMessagesRequest.fromPartial({
    queueName: "q",
    pageSize: 1000,
    pageToken: "opaque-token",
  });
  expect(
    QueueServiceTypes.PeekQueueMessagesRequest.decode(
      QueueServiceTypes.PeekQueueMessagesRequest.encode(page).finish(),
    ),
  ).toEqual(page);
  const claim = QueueServiceTypes.RenewMessageLeaseRequest.fromPartial({
    queueName: "q",
    messageId: "m",
    workerId: "w",
    attemptId: "a",
  });
  expect(
    QueueServiceTypes.RenewMessageLeaseRequest.decode(
      QueueServiceTypes.RenewMessageLeaseRequest.encode(claim).finish(),
    ),
  ).toEqual(claim);
});

it("preserves nanosecond timestamps in both wire and JSON round trips", () => {
  const original =
    QueueServiceTypes.PreviewCalendarScheduleResponse.fromPartial({
      executionTimes: [{ seconds: "253402300799", nanos: 999999999 }],
      previewStart: { seconds: "-1", nanos: 1 },
      timezone: "UTC",
      totalCount: 1,
    });
  const codec = QueueServiceTypes.PreviewCalendarScheduleResponse;
  expect(codec.decode(codec.encode(original).finish())).toEqual(original);
  expect(codec.fromJSON(codec.toJSON(original))).toEqual(original);
});
