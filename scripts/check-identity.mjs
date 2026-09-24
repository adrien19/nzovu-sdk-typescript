import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { ROOT } from "./proto.mjs";

const candidates = new Set(
  execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: ROOT },
  )
    .toString()
    .split("\0")
    .filter(Boolean),
);
const walk = (path) => {
  if (!existsSync(path)) return;
  for (const item of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, item.name);
    if (item.isDirectory()) walk(child);
    else if (item.isFile()) candidates.add(child);
  }
};
for (const output of [
  "packages/proto/src/generated",
  "packages/proto/lib",
  "packages/client/lib",
  "packages/mcp/dist",
])
  walk(join(ROOT, output));
const forbidden = /chrono[_-]?queue/i;
const failures = [];
for (const path of candidates) {
  const target = isAbsolute(path) ? path : join(ROOT, path);
  if (!existsSync(target)) continue;
  const label = relative(ROOT, target).replaceAll("\\", "/");
  if (forbidden.test(label) || forbidden.test(readFileSync(target, "utf8"))) {
    failures.push(label);
  }
}
if (failures.length) {
  console.error("Legacy identity references:", failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Active source and local build identities verified");
}
