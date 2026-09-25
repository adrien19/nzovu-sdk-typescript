import assert from "node:assert/strict";
import { test } from "node:test";
import { packages, validateInventory } from "./check-distribution.mjs";
const version = "0.0.1-dev.0";
function fixture() {
  return {
    manifest: {
      name: "@nzovu/client",
      version,
      private: true,
      license: "MIT",
      main: "lib/index.js",
      types: "lib/index.d.ts",
      exports: {
        ".": { types: "./lib/index.d.ts", default: "./lib/index.js" },
      },
      publishConfig: {
        access: "public",
        registry: "https://registry.npmjs.org/",
      },
      dependencies: { "@nzovu/proto": "workspace:*" },
      scripts: {
        prepack: "node scripts/block-release.mjs",
        prepublishOnly: "node scripts/block-release.mjs",
      },
    },
    files: [
      "package.json",
      "README.md",
      "LICENCE",
      "scripts/block-release.mjs",
      "lib/index.js",
      "lib/index.d.ts",
    ].map((path) => ({ path })),
  };
}
const check = (value) =>
  validateInventory(packages[1], value.manifest, value.files, version);
test("accepts a closed distribution with portable lifecycle guards", () =>
  check(fixture()));
for (const path of [
  "LICENCE",
  "lib/index.js",
  "lib/index.d.ts",
  "scripts/block-release.mjs",
])
  test(`rejects missing ${path}`, () => {
    const value = fixture();
    value.files = value.files.filter((f) => f.path !== path);
    assert.throws(() => check(value), /Missing package file/);
  });
for (const path of [
  "src/index.ts",
  "lib/secret.test.js",
  "lib/__tests__/fixture.js",
  "lib/index.d.ts.map",
  "../outside.js",
  "lib/../index.js",
  "MIGRATION.md",
])
  test(`rejects unwanted or unsafe ${path}`, () => {
    const value = fixture();
    value.files.push({ path });
    assert.throws(
      () => check(value),
      /Unexpected|Unwanted|Unsafe|Noncanonical/,
    );
  });
test("rejects dependency identity and version drift", () => {
  const value = fixture();
  value.manifest.dependencies["@nzovu/proto"] = "latest";
  assert.throws(() => check(value));
  value.manifest.dependencies = { "@nzovu/client": "workspace:*" };
  assert.throws(() => check(value));
});
test("rejects registry/version drift and accidental publication enablement", () => {
  for (const patch of [
    { private: false },
    { version: "9.0.0" },
    {
      publishConfig: {
        access: "restricted",
        registry: "https://example.invalid",
      },
    },
  ]) {
    const value = fixture();
    Object.assign(value.manifest, patch);
    assert.throws(() => check(value));
  }
});
test("rejects lifecycle scripts that depend on the repository or run during install", () => {
  const value = fixture();
  value.manifest.scripts.prepack = "node ../../scripts/block-release.mjs";
  assert.throws(() => check(value));
  value.manifest.scripts.prepack = "node scripts/block-release.mjs";
  value.manifest.scripts.postinstall = "node setup.js";
  assert.throws(() => check(value), /Unexpected install lifecycle/);
});
test("rejects missing exports and duplicate inventory paths", () => {
  const value = fixture();
  value.manifest.exports["."].types = "./lib/missing.d.ts";
  assert.throws(() => check(value), /Missing export/);
  value.manifest.exports["."].types = "./lib/index.d.ts";
  value.files.push(value.files[0]);
  assert.throws(() => check(value), /Duplicate/);
});
