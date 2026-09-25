const assert = require("node:assert/strict");
const { NzovuClient, NzovuError } = require("@nzovu/client");
const { Message, QueueService, QueueServiceTypes } = require("@nzovu/proto");
const deep = require("@nzovu/proto/lib/generated/proto/message/v1/message");
assert.equal(typeof NzovuClient, "function");
assert.equal(typeof NzovuError, "function");
assert.equal(deep.Message, Message.Message);
assert.equal(Object.keys(QueueService.QueueServiceService).length, 31);
const request = QueueServiceTypes.GetDLQStatsResponse.fromPartial({
  messageCount: "9007199254740993",
});
assert.equal(
  QueueServiceTypes.GetDLQStatsResponse.decode(
    QueueServiceTypes.GetDLQStatsResponse.encode(request).finish(),
  ).messageCount,
  request.messageCount,
);
const message = Message.Message.fromPartial({
  messageId: "fixture",
  metadata: { headers: [{ key: "x-test", value: Uint8Array.from([0, 255]) }] },
});
assert.deepEqual(
  [
    ...Message.Message.decode(Message.Message.encode(message).finish()).metadata
      .headers[0].value,
  ],
  [0, 255],
);
