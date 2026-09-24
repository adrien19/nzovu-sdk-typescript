#!/usr/bin/env node

import { VERSION } from './version.js';

/**
 * Nzovu MCP Server
 *
 * Entry point for the Model Context Protocol server that exposes
 * Nzovu operations as AI-accessible tools.
 */

import { createMCPServer } from './server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

async function main() {
  try {
    const server = await createMCPServer();
    const transport = new StdioServerTransport();

    await server.connect(transport);

    // Log to stderr to avoid interfering with MCP protocol on stdout
    console.error('Nzovu MCP Server running on stdio');
    console.error(`Version: ${VERSION}`);
  } catch (error) {
    console.error('Fatal error starting MCP server:', error);
    process.exit(1);
  }
}

main();
