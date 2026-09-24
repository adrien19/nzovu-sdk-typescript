import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import { VERSION } from './version.js';
import { NzovuClient, NzovuError, SilentLogger } from '@nzovu/client';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFileSync } from 'node:fs';
import { loadConfig, ServerConfig } from './config.js';
import { handleToolCall } from './tools/handlers.js';
import { allTools } from './tools/index.js';
import { toolSchemas, ToolName } from './tools/validation.js';

export async function createMCPServer(
  options: { client?: NzovuClient; config?: ServerConfig; signalHandlers?: boolean } = {}
): Promise<McpServer> {
  const config = options.config ?? loadConfig();
  const client =
    options.client ??
    new NzovuClient({
      connection: {
        address: config.nzovuAddress,
        insecure: config.insecure,
        apiKey: config.apiKey,
        tls:
          config.caPath || config.certPath
            ? {
                ...(config.caPath ? { ca: readFileSync(config.caPath) } : {}),
                ...(config.certPath
                  ? { cert: readFileSync(config.certPath), key: readFileSync(config.keyPath!) }
                  : {}),
              }
            : undefined,
        timeout: config.timeoutMs,
      },
      requestTimeout: config.timeoutMs,
      maxManagedClaims: config.maxManagedClaims,
      logger: new SilentLogger(),
    });
  const server = new McpServer(
    { name: 'nzovu-mcp', version: VERSION },
    { capabilities: { tools: {} } }
  );
  const close = server.close.bind(server);
  let closing: Promise<void> | undefined;
  const shutdown = () => {
    void server.close().catch(() => {
      process.exitCode = 1;
    });
  };
  server.close = () =>
    (closing ??= (async () => {
      process.off('SIGINT', shutdown);
      process.off('SIGTERM', shutdown);
      try {
        await client.disconnect();
      } finally {
        await close();
      }
    })());
  server.server.onclose = shutdown;
  try {
    await client.connect();
  } catch (error) {
    await server.close();
    throw error;
  }
  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: toolSchemas[tool.name as ToolName] as z.AnyZodObject,
        annotations: tool.annotations,
      },
      async (
        args: Record<string, unknown>,
        extra: { signal: AbortSignal }
      ): Promise<CallToolResult> => {
        try {
          const result = await client.runWithOptions({ signal: extra.signal }, () =>
            handleToolCall(tool.name, args, client)
          );
          return {
            structuredContent: result,
            content: [{ type: 'text', text: JSON.stringify(result) }],
          };
        } catch (error) {
          const redact = (value: string) =>
            config.apiKey ? value.split(config.apiKey).join('[redacted]') : value;
          const detail = error instanceof Error ? redact(error.message) : 'Tool operation failed';
          const result = {
            error: {
              code: error instanceof NzovuError ? error.code : 'INVALID_ARGUMENT',
              grpcCode: error instanceof NzovuError ? error.grpcCode : undefined,
              details: detail,
            },
          };
          return {
            isError: true,
            structuredContent: result,
            content: [{ type: 'text', text: JSON.stringify(result) }],
          };
        }
      }
    );
  }
  if (options.signalHandlers !== false) {
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
  return server;
}
