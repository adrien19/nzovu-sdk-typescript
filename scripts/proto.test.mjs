import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  symlinkSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ROOT, generate, updateSources, verifySources } from "./proto.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "nzovu-proto-test-"));
  cpSync(join(ROOT, "proto"), join(root, "proto"), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("manifest covers the ten vendored protocol sources", () => {
  const manifest = verifySources();
  assert.equal(Object.keys(manifest.files).length, 10);
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
});

for (const change of ["modified", "missing", "extra"]) {
  test(`rejects ${change} protocol source`, (t) => {
    const root = fixture(t);
    const path = join(root, "proto/common/v1/common.proto");
    if (change === "modified") writeFileSync(path, readFileSync(path) + "\n");
    if (change === "missing") unlinkSync(path);
    if (change === "extra")
      writeFileSync(join(root, "proto/extra.proto"), 'syntax = "proto3";');
    assert.throws(
      () => verifySources(root),
      /checksum mismatch|file set differs/,
    );
  });
}

test("requires explicit immutable source; invalid update preserves existing files", (t) => {
  const root = fixture(t);
  const before = readFileSync(join(root, "proto/SOURCE.json"));
  for (const [source, commit] of [
    [undefined, undefined],
    [ROOT, "main"],
    [ROOT, "f8d512a"],
  ]) {
    assert.throws(
      () => updateSources(source, commit, root),
      /requires --source/,
    );
  }
  assert.deepEqual(readFileSync(join(root, "proto/SOURCE.json")), before);
});

test("vendors committed bytes, ignoring uncommitted source edits", (t) => {
  const source = fixture(t);
  const target = fixture(t);
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: source,
      stdio: ["ignore", "pipe", "pipe"],
    });
  git("init");
  git("add", "proto");
  git(
    "-c",
    "user.name=Protocol Test",
    "-c",
    "user.email=protocol-test@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    "fixture",
  );
  const commit = git("rev-parse", "HEAD").toString().trim();
  const path = "proto/common/v1/common.proto";
  const expected = readFileSync(join(source, path));
  writeFileSync(join(source, path), "uncommitted invalid data");
  updateSources(source, commit, target);
  assert.deepEqual(readFileSync(join(target, path)), expected);
  assert.equal(verifySources(target).commit, commit);
});

function generatedFixture(t) {
  const root = fixture(t);
  const pkg = join(root, "packages/proto");
  mkdirSync(join(pkg, "src"), { recursive: true });
  symlinkSync(
    join(ROOT, "packages/proto/node_modules"),
    join(pkg, "node_modules"),
    "dir",
  );
  symlinkSync(join(ROOT, "node_modules"), join(root, "node_modules"), "dir");
  generate(false, root);
  return root;
}

test("generation is deterministic and drift checks never rewrite outputs", (t) => {
  const root = generatedFixture(t);
  generate(true, root);
  const output = join(
    root,
    "packages/proto/src/generated/proto/common/v1/common.ts",
  );
  writeFileSync(output, "modified generated output");
  assert.throws(() => generate(true, root), /Generated protocol drift/);
  assert.equal(readFileSync(output, "utf8"), "modified generated output");
});

test("compiler failure preserves the previous complete output", (t) => {
  const root = generatedFixture(t);
  const output = join(
    root,
    "packages/proto/src/generated/proto/common/v1/common.ts",
  );
  const before = readFileSync(output);
  const path = "proto/common/v1/common.proto";
  const invalid = "invalid protocol syntax";
  writeFileSync(join(root, path), invalid);
  const manifestPath = join(root, "proto/SOURCE.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.files[path] = createHash("sha256").update(invalid).digest("hex");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.throws(() => generate(false, root));
  assert.deepEqual(readFileSync(output), before);
});
