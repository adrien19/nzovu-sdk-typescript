#!/usr/bin/env node
import { createMCPServer } from './server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

async function main(): Promise<void> {
  const server = await createMCPServer();
  const close = server.close.bind(server);
  let closing: Promise<void> | undefined;
  const shutdown = () =>
    (closing ??= close().finally(() => {
      process.stdin.off('end', onEnd);
      process.stdin.off('error', onError);
      process.stdout.off('error', onError);
    }));
  const onEnd = () => {
    void shutdown().catch(() => {
      process.exitCode = 1;
    });
  };
  const onError = () => {
    process.exitCode = 1;
    onEnd();
  };
  server.close = shutdown;
  process.stdin.once('end', onEnd);
  process.stdin.once('error', onError);
  process.stdout.once('error', onError);
  try {
    await server.connect(new StdioServerTransport());
  } catch (error) {
    await shutdown();
    throw error;
  }
}
void main().catch(() => {
  console.error('Unable to start Nzovu MCP server; verify configuration and server access.');
  process.exitCode = 1;
});
