import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { ROOT } from "./proto.mjs";
for (const directory of [
  ".",
  "packages/proto",
  "packages/client",
  "packages/mcp",
  "packages/examples",
  "packages/examples/agent-worker",
  "packages/examples/trip-planner-worker",
]) {
  test(`${directory}: packaging and publication remain blocked`, () => {
    const cwd = resolve(ROOT, directory);
    const manifest = JSON.parse(
      readFileSync(resolve(cwd, "package.json"), "utf8"),
    );
    assert.equal(manifest.private, true);
    for (const name of ["prepack", "prepublishOnly"]) {
      const script = manifest.scripts[name];
      assert.match(script, /^node (?:\.\.\/)*scripts\/block-release\.mjs$/);
      const guard = resolve(cwd, script.slice(5));
      assert.ok(existsSync(guard));
      const result = spawnSync(process.execPath, [guard], {
        cwd,
        encoding: "utf8",
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /disabled|blocked/i);
    }
  });
}
