import * as grpc from "@grpc/grpc-js";
import {
  Common,
  Message,
  Queue,
  QueueService,
  QueueServiceTypes as R,
  Schedule,
  Schema,
} from "@nzovu/proto";
import {
  Connection,
  DLQClient,
  MessageClient,
  QueueClient,
  ScheduleClient,
  SchemaClient,
  ErrorCode,
  NzovuError,
  parseDuration,
  durationToMs,
  msToDuration,
  timestampToISOString,
} from "../src";

const instant = { seconds: "1790000000", nanos: 123456789 };
const lease = { seconds: "30", nanos: 1 };
const binaryHeaders = [
  { key: "x-data", value: Uint8Array.from([0, 255, 128]) },
  { key: "x-data", value: Uint8Array.from([1]) },
];
const input = Message.Message.fromPartial({
  messageId: "m",
  metadata: {
    priority: "4",
    headers: binaryHeaders,
    leaseDuration: lease,
    leasePolicy: { maxRenewals: 0 },
    scheduledTime: instant,
    payload: {
      data: { nested: [true, null, 1, "text"] },
      schemaId: "schema",
      schemaVersion: 2,
      contentType: "application/json",
    },
  },
});
const delivered = Message.Message.fromPartial({
  ...input,
  metadata: {
    ...input.metadata,
    state: Message.Message_Metadata_State.RUNNING,
    attemptsLeft: 2,
    maxAttempts: 3,
    leaseExpiry: "9007199254740993",
    leaseRenewalCount: 1,
    priorityLevel: 4,
    currentAttempt: { attemptId: "a", workerId: "w" },
  },
});
const metadata = Queue.QueueMetadata.fromPartial({
  leasePolicy: { maxRenewals: 0 },
  schemaId: "schema",
  schemaRequired: true,
  allowedContentTypes: ["application/json"],
});
const calendar = Schedule.CalendarSchedule.fromPartial({
  timezone: "UTC",
  rules: [{ executionTimes: [{ hour: 9, minute: 30, second: 1 }] }],
});
const schedule = Schedule.Schedule.fromPartial({
  scheduleId: "s",
  metadata: {
    queueName: "q",
    calendarSchedule: calendar,
    priority: "4",
    headers: binaryHeaders,
    payload: input.metadata!.payload,
    leaseDuration: lease,
  },
});
const returnedSchedule = Schedule.Schedule.fromPartial({
  ...schedule,
  metadata: {
    ...schedule.metadata,
    nextRun: instant,
    lastRun: instant,
    createdAt: instant,
    updatedAt: instant,
    nextRuns: [instant],
    hasMaxMessages: true,
    maxMessages: "9007199254740993",
    stateMessage: "active",
  },
});
const history = Schedule.ScheduleHistory.fromPartial({
  scheduleId: "s",
  messages: [delivered],
  nextRun: instant,
  lastRun: instant,
  createdAt: instant,
  updatedAt: instant,
  executions: [
    {
      messageId: "m",
      executedAt: instant,
      success: false,
      errorMessage: "failed",
      message: delivered,
    },
  ],
});
const schema = Schema.Schema.fromPartial({
  schemaId: "schema",
  version: 2,
  name: "Schema",
  description: "Description",
  content: "{}",
  contentType: "json-schema",
  createdAt: "9007199254740993",
  updatedAt: "9007199254740994",
  isActive: true,
  metadata: { owner: "test" },
});
const paging = { pageSize: 7, pageToken: "opaque-input" };
const list = { ...paging, prefix: "prefix" };
const owner = { queueName: "q", messageId: "m", workerId: "w", attemptId: "a" };

type Clients = {
  queues: QueueClient;
  messages: MessageClient;
  schedules: ScheduleClient;
  schemas: SchemaClient;
  dlq: DLQClient;
};
type Contract = {
  rpc: keyof typeof QueueService.QueueServiceService;
  invoke: (c: Clients) => Promise<unknown>;
  request: object;
  response: object;
  project?: (response: any) => unknown;
};
const success = (response: any) => response.success;
const contracts: Contract[] = [
  {
    rpc: "createQueue",
    invoke: (c) => c.queues.createQueue("q", metadata),
    request: R.CreateQueueRequest.fromPartial({ name: "q", metadata }),
    response: R.CreateQueueResponse.fromPartial({ success: true }),
    project: success,
  },
  {
    rpc: "deleteQueue",
    invoke: (c) => c.queues.deleteQueue("q"),
    request: R.DeleteQueueRequest.fromPartial({ name: "q" }),
    response: R.DeleteQueueResponse.fromPartial({ success: true }),
    project: success,
  },
  {
    rpc: "getQueueState",
    invoke: (c) => c.queues.getQueueState("q"),
    request: R.GetQueueStateRequest.fromPartial({ queueName: "q" }),
    response: R.GetQueueStateResponse.fromPartial({
      stateCounts: { RUNNING: "9007199254740993" },
      earliestDeadline: instant,
    }),
  },
  {
    rpc: "listQueues",
    invoke: (c) => c.queues.listQueues(list),
    request: R.ListQueuesRequest.fromPartial(list),
    response: R.ListQueuesResponse.fromPartial({
      queues: [{ name: "q", metadata }],
      nextPageToken: "next",
    }),
  },
  {
    rpc: "postMessage",
    invoke: (c) => c.messages.postMessage("q", input),
    request: R.PostMessageRequest.fromPartial({
      queueName: "q",
      message: input,
    }),
    response: R.PostMessageResponse.fromPartial({ success: true }),
    project: success,
  },
  {
    rpc: "postMessagesBulk",
    invoke: (c) =>
      c.messages.postMessagesBulk(
        "q",
        [input, input],
        R.PostMessagesBulkRequest_TransactionMode.BEST_EFFORT,
      ),
    request: R.PostMessagesBulkRequest.fromPartial({
      queueName: "q",
      messages: [input, input],
      transactionMode: 1,
    }),
    response: R.PostMessagesBulkResponse.fromPartial({
      success: true,
      successfulCount: 1,
      failedCount: 1,
      results: [
        { messageId: "m", success: true },
        { messageId: "m", success: false, error: "duplicate", errorCode: 2 },
      ],
    }),
  },
  {
    rpc: "getNextMessage",
    invoke: (c) =>
      c.messages.getNextMessage(
        "q",
        lease,
        "key",
        false,
        1000,
        "w",
        undefined,
        "a",
      ),
    request: R.GetNextMessageRequest.fromPartial({
      queueName: "q",
      leaseDuration: lease,
      exclusivityKey: "key",
      workerId: "w",
      attemptId: "a",
    }),
    response: R.GetNextMessageResponse.fromPartial({
      message: delivered,
      workerId: "w",
      attemptId: "a",
    }),
    project: (r) => ({ ...r, stopHeartbeat: undefined }),
  },
  {
    rpc: "acknowledgeMessage",
    invoke: (c) =>
      c.messages.acknowledgeMessage(
        "q",
        "m",
        Message.Message_Metadata_State.COMPLETED,
        "w",
        "a",
      ),
    request: R.AcknowledgeMessageRequest.fromPartial({
      ...owner,
      state: Message.Message_Metadata_State.COMPLETED,
    }),
    response: R.AcknowledgeMessageResponse.fromPartial({ success: true }),
    project: success,
  },
  {
    rpc: "cancelMessage",
    invoke: (c) => c.messages.cancelMessage("q", "m", "reason"),
    request: R.CancelMessageRequest.fromPartial({
      queueName: "q",
      messageId: "m",
      reason: "reason",
    }),
    response: R.CancelMessageResponse.fromPartial({ success: true }),
    project: success,
  },
  {
    rpc: "sendMessageHeartBeat",
    invoke: (c) => c.messages.sendHeartbeat("q", "m", "w", "a"),
    request: R.SendMessageHeartBeatRequest.fromPartial(owner),
    response: R.SendMessageHeartBeatResponse.fromPartial({
      remainingTime: lease,
      state: 0,
    }),
  },
  {
    rpc: "renewMessageLease",
    invoke: (c) => c.messages.renewMessageLease("q", "m", lease, "w", "a"),
    request: R.RenewMessageLeaseRequest.fromPartial({
      ...owner,
      leaseDuration: lease,
    }),
    response: R.RenewMessageLeaseResponse.fromPartial({
      remainingTime: lease,
      state: 0,
    }),
  },
  {
    rpc: "peekQueueMessages",
    invoke: (c) =>
      c.messages.peekQueueMessages("q", {
        ...paging,
        priorityRange: { min: "0", max: "4" },
      }),
    request: R.PeekQueueMessagesRequest.fromPartial({
      queueName: "q",
      ...paging,
      priorityRange: { min: "0", max: "4" },
    }),
    response: R.PeekQueueMessagesResponse.fromPartial({
      messages: [delivered],
      nextPageToken: "next",
    }),
  },
  {
    rpc: "createSchedule",
    invoke: (c) => c.schedules.createSchedule(schedule),
    request: R.CreateScheduleRequest.fromPartial({ schedule }),
    response: R.CreateScheduleResponse.fromPartial({ success: true }),
    project: success,
  },
  {
    rpc: "getSchedule",
    invoke: (c) => c.schedules.getSchedule("s"),
    request: R.GetScheduleRequest.fromPartial({ scheduleId: "s" }),
    response: R.GetScheduleResponse.fromPartial({ schedule: returnedSchedule }),
    project: (r) => r.schedule,
  },
  {
    rpc: "listSchedules",
    invoke: (c) => c.schedules.listSchedules(list),
    request: R.ListSchedulesRequest.fromPartial(list),
    response: R.ListSchedulesResponse.fromPartial({
      schedules: [returnedSchedule],
      nextPageToken: "next",
    }),
  },
  {
    rpc: "deleteSchedule",
    invoke: (c) => c.schedules.deleteSchedule("s"),
    request: R.DeleteScheduleRequest.fromPartial({ scheduleId: "s" }),
    response: R.DeleteScheduleResponse.fromPartial({ success: true }),
    project: success,
  },
  {
    rpc: "pauseSchedule",
    invoke: (c) => c.schedules.pauseSchedule("s"),
    request: R.PauseScheduleRequest.fromPartial({ scheduleId: "s" }),
    response: R.PauseScheduleResponse.fromPartial({ success: true }),
    project: success,
  },
  {
    rpc: "resumeSchedule",
    invoke: (c) => c.schedules.resumeSchedule("s"),
    request: R.ResumeScheduleRequest.fromPartial({ scheduleId: "s" }),
    response: R.ResumeScheduleResponse.fromPartial({ success: true }),
    project: success,
  },
  {
    rpc: "getScheduleHistory",
    invoke: (c) => c.schedules.getScheduleHistory("s", paging),
    request: R.GetScheduleHistoryRequest.fromPartial({
      scheduleId: "s",
      ...paging,
    }),
    response: R.GetScheduleHistoryResponse.fromPartial({
      scheduleHistory: history,
      nextPageToken: "next",
    }),
  },
  {
    rpc: "validateCalendarSchedule",
    invoke: (c) => c.schedules.validateCalendarSchedule(calendar),
    request: R.ValidateCalendarScheduleRequest.fromPartial({
      calendarSchedule: calendar,
    }),
    response: R.ValidateCalendarScheduleResponse.fromPartial({
      valid: false,
      errorMessage: "invalid",
      validationIssues: [
        {
          severity: "error",
          ruleIndex: -1,
          field: "rules",
          message: "missing",
          suggestion: "add rule",
        },
      ],
    }),
  },
  {
    rpc: "previewCalendarSchedule",
    invoke: (c) => c.schedules.previewCalendarSchedule(calendar, 2),
    request: R.PreviewCalendarScheduleRequest.fromPartial({
      calendarSchedule: calendar,
      count: 2,
    }),
    response: R.PreviewCalendarScheduleResponse.fromPartial({
      executionTimes: [instant],
      timezone: "UTC",
      previewStart: instant,
      totalCount: 1,
    }),
  },
  {
    rpc: "getDlqMessages",
    invoke: (c) => c.dlq.getDLQMessages("dlq", paging),
    request: R.GetDLQMessagesRequest.fromPartial({ dlqName: "dlq", ...paging }),
    response: R.GetDLQMessagesResponse.fromPartial({
      messages: [delivered],
      nextPageToken: "next",
    }),
  },
  {
    rpc: "requeueFromDlq",
    invoke: (c) => c.dlq.requeueFromDLQ("dlq", "m", "q"),
    request: R.RequeueFromDLQRequest.fromPartial({
      dlqName: "dlq",
      messageId: "m",
      targetQueue: "q",
    }),
    response: R.RequeueFromDLQResponse.fromPartial({ success: true }),
    project: success,
  },
  {
    rpc: "deleteFromDlq",
    invoke: (c) => c.dlq.deleteFromDLQ("dlq", "m"),
    request: R.DeleteFromDLQRequest.fromPartial({
      dlqName: "dlq",
      messageId: "m",
    }),
    response: R.DeleteFromDLQResponse.fromPartial({ success: true }),
    project: success,
  },
  {
    rpc: "purgeDlq",
    invoke: (c) => c.dlq.purgeDLQ("dlq"),
    request: R.PurgeDLQRequest.fromPartial({ dlqName: "dlq" }),
    response: R.PurgeDLQResponse.fromPartial({ success: true }),
    project: success,
  },
  {
    rpc: "getDlqStats",
    invoke: (c) => c.dlq.getDLQStats("dlq"),
    request: R.GetDLQStatsRequest.fromPartial({ dlqName: "dlq" }),
    response: R.GetDLQStatsResponse.fromPartial({
      name: "dlq",
      messageCount: "9007199254740993",
      createdAt: "9007199254740994",
      updatedAt: "9007199254740995",
    }),
  },
  {
    rpc: "registerSchema",
    invoke: (c) =>
      c.schemas.registerSchema("schema", "{}", {
        name: "Schema",
        description: "Description",
        contentType: "json-schema",
        metadata: { owner: "test" },
      }),
    request: R.RegisterSchemaRequest.fromPartial({
      schemaId: "schema",
      content: "{}",
      name: "Schema",
      description: "Description",
      contentType: "json-schema",
      metadata: { owner: "test" },
    }),
    response: R.RegisterSchemaResponse.fromPartial({
      schemaId: "schema",
      version: 2,
      createdAt: "9007199254740993",
    }),
  },
  {
    rpc: "getSchema",
    invoke: (c) => c.schemas.getSchema("schema", 2),
    request: R.GetSchemaRequest.fromPartial({ schemaId: "schema", version: 2 }),
    response: R.GetSchemaResponse.fromPartial({ schema }),
    project: (r) => r.schema,
  },
  {
    rpc: "listSchemas",
    invoke: (c) => c.schemas.listSchemas({ ...list, activeOnly: false }),
    request: R.ListSchemasRequest.fromPartial({ ...list, activeOnly: false }),
    response: R.ListSchemasResponse.fromPartial({
      schemas: [
        {
          schemaId: "schema",
          name: "Schema",
          description: "Description",
          latestVersion: 2,
          versionCount: 3,
          isActive: true,
          createdAt: "9007199254740993",
          updatedAt: "9007199254740994",
        },
      ],
      totalCount: 27,
      nextPageToken: "next",
    }),
  },
  {
    rpc: "deleteSchema",
    invoke: (c) => c.schemas.deleteSchema("schema", 0),
    request: R.DeleteSchemaRequest.fromPartial({
      schemaId: "schema",
      version: 0,
    }),
    response: R.DeleteSchemaResponse.fromPartial({
      success: true,
      versionsDeleted: 3,
    }),
  },
  {
    rpc: "validatePayload",
    invoke: (c) => c.schemas.validatePayload("schema", { key: 1 }, 2),
    request: R.ValidatePayloadRequest.fromPartial({
      schemaId: "schema",
      payload: '{"key":1}',
      version: 2,
    }),
    response: R.ValidatePayloadResponse.fromPartial({
      valid: false,
      schemaId: "schema",
      schemaVersion: 2,
      errors: [
        {
          field: "key",
          errorCode: "INVALID_TYPE",
          message: "wrong type",
          details: { expected: "string", actual: "number" },
        },
      ],
    }),
  },
];

function setup(rpc: string, handler: (request: any, callback: any) => void) {
  const call = jest.fn(handler);
  const connection = new Connection({
    address: "localhost:9000",
    retry: { enabled: false },
  });
  jest
    .spyOn(connection, "getQueueServiceClient")
    .mockReturnValue({ [rpc]: call } as any);
  const clients: Clients = {
    queues: new QueueClient(connection),
    messages: new MessageClient(connection),
    schedules: new ScheduleClient(connection),
    schemas: new SchemaClient(connection),
    dlq: new DLQClient(connection),
  };
  return { clients, call };
}

it("covers every pinned RPC exactly once", () => {
  expect(contracts.map((c) => c.rpc).sort()).toEqual(
    Object.keys(QueueService.QueueServiceService).sort(),
  );
  expect(contracts).toHaveLength(31);
});

describe.each(contracts)("$rpc wire contract", (contract) => {
  const descriptor = QueueService.QueueServiceService[
    contract.rpc
  ] as grpc.MethodDefinition<any, any>;
  it("encodes every request field and preserves the complete decoded response", async () => {
    const response = descriptor.responseDeserialize(
      descriptor.responseSerialize(contract.response),
    );
    const { clients, call } = setup(contract.rpc, (request, callback) => {
      expect(
        descriptor.requestDeserialize(descriptor.requestSerialize(request)),
      ).toEqual(
        descriptor.requestDeserialize(
          descriptor.requestSerialize(contract.request),
        ),
      );
      callback(null, response);
    });
    expect(await contract.invoke(clients)).toEqual(
      contract.project ? contract.project(response) : response,
    );
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("propagates server errors and the original cause", async () => {
    const error = Object.assign(new Error("RPC failed"), {
      code: grpc.status.INVALID_ARGUMENT,
      details: "server validation",
      metadata: new grpc.Metadata(),
    });
    const { clients, call } = setup(contract.rpc, (_request, callback) =>
      callback(error),
    );
    await expect(contract.invoke(clients)).rejects.toMatchObject({
      code: ErrorCode.INVALID_ARGUMENT,
      message: "server validation",
      cause: error,
    });
    expect(call).toHaveBeenCalledTimes(1);
  });
  it.each([null, undefined])(
    "rejects missing response %s",
    async (response) => {
      const { clients } = setup(contract.rpc, (_request, callback) =>
        callback(null, response),
      );
      await expect(contract.invoke(clients)).rejects.toThrow(
        "Empty response from server",
      );
    },
  );
});

it.each(["-1", "5", "1.5", "9007199254740993", 2])(
  "rejects invalid priority %s before RPC",
  async (priority) => {
    const { clients, call } = setup("postMessage", () => {
      throw new Error("unexpected RPC");
    });
    await expect(
      clients.messages.postMessage("q", {
        ...input,
        metadata: { ...input.metadata!, priority: priority as string },
      }),
    ).rejects.toBeInstanceOf(NzovuError);
    expect(call).not.toHaveBeenCalled();
  },
);
it.each([-1, 1001, 1.5, NaN, Infinity])(
  "rejects invalid page size %s across every page method",
  async (pageSize) => {
    const { clients } = setup("unused", () => {});
    const operations = [
      () => clients.queues.listQueues({ pageSize }),
      () => clients.schedules.listSchedules({ pageSize }),
      () => clients.schedules.getScheduleHistory("s", { pageSize }),
      () => clients.schemas.listSchemas({ pageSize }),
      () => clients.messages.peekQueueMessages("q", { pageSize }),
      () => clients.dlq.getDLQMessages("dlq", { pageSize }),
    ];
    for (const operation of operations)
      await expect(operation()).rejects.toMatchObject({
        code: ErrorCode.INVALID_ARGUMENT,
      });
  },
);
it.each([
  "x-nzovu-secret",
  "x-internal-secret",
  "x-system-secret",
  "Upper",
  "",
  "key_name",
])("rejects invalid header %s", async (key) => {
  const { clients } = setup("unused", () => {});
  await expect(
    clients.messages.postMessage(
      "q",
      Message.Message.fromPartial({
        ...input,
        metadata: {
          ...input.metadata,
          headers: [{ key, value: new Uint8Array(1) }],
        },
      }),
    ),
  ).rejects.toThrow("header");
});
it("enforces header byte limits without disallowing duplicate keys", async () => {
  const { clients, call } = setup("postMessage", (_request, callback) =>
    callback(null, { success: true }),
  );
  const post = (headers: Message.Message_Metadata_Header[]) =>
    clients.messages.postMessage("q", {
      ...input,
      metadata: { ...input.metadata!, headers },
    });
  await expect(post([{ key: "a", value: new Uint8Array(4096) }])).resolves.toBe(
    true,
  );
  await expect(
    post([{ key: "a", value: new Uint8Array(4097) }]),
  ).rejects.toThrow("4096");
  await expect(
    post(
      Array.from({ length: 8 }, () => ({
        key: "a",
        value: new Uint8Array(4095),
      })),
    ),
  ).resolves.toBe(true);
  await expect(
    post(
      Array.from({ length: 8 }, () => ({
        key: "a",
        value: new Uint8Array(4096),
      })),
    ),
  ).rejects.toThrow("32768");
  expect(call).toHaveBeenCalledTimes(2);
});
it.each(["", "x".repeat(257), "has space", "路径"])(
  "rejects invalid message ID %s",
  async (messageId) => {
    const { clients } = setup("unused", () => {});
    await expect(
      clients.messages.postMessage("q", { ...input, messageId }),
    ).rejects.toThrow("messageId");
  },
);
it.each([
  { state: Message.Message_Metadata_State.PENDING },
  { leaseExpiry: "1" },
  { leaseRenewalCount: 1 },
  { priorityLevel: 1 },
  {
    currentAttempt: Message.Message_Metadata_AttemptRuntime.fromPartial({
      workerId: "w",
    }),
  },
])("rejects server runtime field %j", async (fields) => {
  const { clients } = setup("unused", () => {});
  await expect(
    clients.messages.postMessage("q", {
      ...input,
      metadata: { ...input.metadata!, ...fields },
    }),
  ).rejects.toThrow("managed by the server");
});
it("leaves BEST_EFFORT item validation to the server", async () => {
  const response = R.PostMessagesBulkResponse.fromPartial({
    failedCount: 1,
    results: [{ messageId: "bad id", errorCode: 1, error: "invalid id" }],
  });
  const { clients, call } = setup("postMessagesBulk", (_request, callback) =>
    callback(null, response),
  );
  await expect(
    clients.messages.postMessagesBulk(
      "q",
      [{ ...input, messageId: "bad id" }],
      1,
    ),
  ).resolves.toEqual(response);
  expect(call).toHaveBeenCalledTimes(1);
});
it("preserves absent queue metadata and optional zero renewal policy", async () => {
  const { clients, call } = setup("createQueue", (_request, callback) =>
    callback(null, { success: true }),
  );
  await clients.queues.createQueue("q");
  expect(call.mock.calls[0][0].metadata).toBeUndefined();
  expect(
    Common.LeasePolicy.decode(
      Common.LeasePolicy.encode({ maxRenewals: 0 }).finish(),
    ).maxRenewals,
  ).toBe(0);
});
it("validates schema metadata, versions, lease ownership, and DLQ destination", async () => {
  const { clients } = setup("unused", () => {});
  await expect(
    clients.schemas.registerSchema("s", "{}", { name: "" }),
  ).rejects.toThrow("name");
  await expect(
    clients.schemas.registerSchema("s", "{}", {
      name: "s",
      contentType: "avro",
    }),
  ).rejects.toThrow("contentType");
  await expect(
    clients.schemas.registerSchema("s", "{}", {
      name: "s",
      metadata: { a: 1 } as any,
    }),
  ).rejects.toThrow("metadata");
  for (const version of [-1, 0.1, 2147483648, NaN]) {
    await expect(clients.schemas.getSchema("s", version)).rejects.toThrow(
      "version",
    );
    await expect(clients.schemas.deleteSchema("s", version)).rejects.toThrow(
      "version",
    );
    await expect(
      clients.schemas.validatePayload("s", {}, version),
    ).rejects.toThrow("version");
  }
  await expect(
    clients.messages.renewMessageLease("q", "m", lease),
  ).rejects.toThrow("workerId");
  await expect(
    clients.messages.renewMessageLease("q", "m", lease, "w"),
  ).rejects.toThrow("attemptId");
  await expect(clients.dlq.requeueFromDLQ("dlq", "m", "")).rejects.toThrow(
    "targetQueue",
  );
  await expect(
    clients.schedules.previewCalendarSchedule(calendar, -1),
  ).rejects.toThrow("count");
  await expect(
    clients.schedules.previewCalendarSchedule(calendar, 1.5),
  ).rejects.toThrow("count");
  await expect(
    clients.schedules.createSchedule({
      ...schedule,
      metadata: { ...schedule.metadata!, exclusivityKey: "old" },
    } as any),
  ).rejects.toThrow("exclusivityKey");
});
it("passes preview default and capped-count requests unchanged to the server", async () => {
  const { clients, call } = setup(
    "previewCalendarSchedule",
    (_request, callback) =>
      callback(null, R.PreviewCalendarScheduleResponse.fromPartial({})),
  );
  await clients.schedules.previewCalendarSchedule(calendar);
  await clients.schedules.previewCalendarSchedule(calendar, 101);
  expect(call.mock.calls.map(([request]) => request.count)).toEqual([0, 101]);
});
it("preserves exact nanoseconds and rejects lossy duration conversions", () => {
  expect(parseDuration("1.000000001s")).toEqual({ seconds: "1", nanos: 1 });
  expect(parseDuration("1ns")).toEqual({ seconds: "0", nanos: 1 });
  expect(parseDuration("1.5ms")).toEqual({ seconds: "0", nanos: 1500000 });
  expect(durationToMs(parseDuration("1.999999999s"))).toBe(1999);
  expect(msToDuration(1001)).toEqual({ seconds: "1", nanos: 1000000 });
  for (const value of ["0.1ns", "-1s", "315576000001s"])
    expect(() => parseDuration(value)).toThrow();
  for (const value of [-1, Infinity, 0.5, Number.MAX_SAFE_INTEGER])
    expect(() => msToDuration(value)).toThrow();
  expect(timestampToISOString({ seconds: "0", nanos: 1 })).toBe(
    "1970-01-01T00:00:00.000000001Z",
  );
  expect(timestampToISOString({ seconds: "-1", nanos: 999999999 })).toBe(
    "1969-12-31T23:59:59.999999999Z",
  );
  expect(
    timestampToISOString({ seconds: "253402300799", nanos: 999999999 }),
  ).toBe("9999-12-31T23:59:59.999999999Z");
  expect(timestampToISOString(undefined)).toBeUndefined();
  expect(() =>
    timestampToISOString({ seconds: "253402300800", nanos: 0 }),
  ).toThrow();
  expect(() =>
    timestampToISOString({ seconds: "0", nanos: 1000000000 }),
  ).toThrow();
});

it.each([null, false, 0, [1, "a"], { nested: { value: true } }])(
  "validates JSON value %j without rewriting it",
  async (payload) => {
    const { clients, call } = setup("validatePayload", (_request, callback) =>
      callback(null, R.ValidatePayloadResponse.fromPartial({ valid: true })),
    );
    await clients.schemas.validatePayload("s", payload);
    expect(call.mock.calls[0][0].payload).toBe(JSON.stringify(payload));
  },
);
it("rejects lossy JSON values before serialization", async () => {
  const cyclic: any = {};
  cyclic.self = cyclic;
  const { clients } = setup("unused", () => {});
  for (const payload of [
    { value: undefined },
    { value: Infinity },
    { value: 1n },
    Buffer.from("x"),
    new Date(),
    cyclic,
  ]) {
    await expect(clients.schemas.validatePayload("s", payload)).rejects.toThrow(
      "payload",
    );
    await expect(
      clients.messages.postMessage("q", {
        ...input,
        metadata: {
          ...input.metadata!,
          payload: { ...input.metadata!.payload!, data: payload },
        },
      }),
    ).rejects.toThrow("payload");
  }
});
