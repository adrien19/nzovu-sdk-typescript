import { NzovuClient, Message, Queue, LeaseClaim } from "@nzovu/client";
import { QueueServiceTypes, Timestamp } from "@nzovu/proto";
const client = new NzovuClient({
  connection: { address: "localhost:9000", insecure: true },
});
const message = Message.Message.fromPartial({
  messageId: "fixture",
  metadata: { priority: "4" },
});
const timestamp: Timestamp = { seconds: "9007199254740993", nanos: 123456789 };
const queue = Queue.QueueMetadata.fromPartial({
  leaseDuration: { seconds: "30", nanos: 0 },
});
const request: QueueServiceTypes.PostMessageRequest = {
  queueName: "fixture",
  message,
};
const claim: LeaseClaim = {
  queueName: "fixture",
  messageId: message.messageId,
  workerId: "w",
  attemptId: "a",
};
void [client, timestamp, queue, request, claim];
