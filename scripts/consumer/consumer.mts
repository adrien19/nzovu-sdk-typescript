import { NzovuClient, RpcOptions } from "@nzovu/client";
import { Message } from "@nzovu/proto";
import { createMCPServer } from "@nzovu/mcp-server";
const client = new NzovuClient({
  connection: { address: "localhost:9000", insecure: true },
});
const options: RpcOptions = {
  timeoutMs: 1000,
  signal: new AbortController().signal,
};
const start = () => createMCPServer({ client, signalHandlers: false });
const input = Message.Message.fromPartial({ messageId: "fixture" });
void [start, options, input];
