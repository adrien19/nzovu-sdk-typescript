import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { ROOT } from "./proto.mjs";

const packages = {
  proto: "@nzovu/proto",
  client: "@nzovu/client",
  mcp: "@nzovu/mcp-server",
};
for (const [directory, name] of Object.entries(packages)) {
  const manifest = JSON.parse(
    readFileSync(
      new URL(`../packages/${directory}/package.json`, import.meta.url),
    ),
  );
  assert.equal(manifest.name, name);
  assert.equal(manifest.version, "0.0.1-dev.0");
  assert.equal(manifest.private, true);
}
const common = `
  const assert = require('node:assert/strict');
  const { NzovuClient, NzovuError } = require('@nzovu/client');
  const { QueueService } = require('@nzovu/proto');
  assert.equal(typeof NzovuClient, 'function');
  assert.equal(typeof NzovuError, 'function');
  assert.equal(Object.keys(QueueService.QueueServiceService).length, 31);
`;
execFileSync(process.execPath, ["-e", common], { cwd: ROOT, stdio: "inherit" });
const esm = `
  import assert from 'node:assert/strict';
  import { NzovuClient, NzovuError } from '@nzovu/client';
  import { QueueService } from '@nzovu/proto';
  import { createMCPServer } from './packages/mcp/dist/server.js';
  import { VERSION } from './packages/mcp/dist/version.js';
  assert.equal(typeof NzovuClient, 'function');
  assert.equal(typeof NzovuError, 'function');
  assert.equal(Object.keys(QueueService.QueueServiceService).length, 31);
  assert.equal(typeof createMCPServer, 'function');
  assert.equal(VERSION, '0.0.1-dev.0');
`;
execFileSync(process.execPath, ["--input-type=module", "-e", esm], {
  cwd: ROOT,
  stdio: "inherit",
});
console.log("CommonJS/ESM SDK imports and MCP module/version verified");
