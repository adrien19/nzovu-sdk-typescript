import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT } from "./proto.mjs";

export const packages = [
  { directory: "proto", name: "@nzovu/proto", output: "lib", dependencies: [] },
  {
    directory: "client",
    name: "@nzovu/client",
    output: "lib",
    dependencies: ["@nzovu/proto"],
  },
  {
    directory: "mcp",
    name: "@nzovu/mcp-server",
    output: "dist",
    dependencies: ["@nzovu/client"],
  },
];
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const normalized = (path) => path.replace(/^\.\//, "");

export function validateInventory(spec, manifest, files, version) {
  assert.equal(manifest.name, spec.name);
  assert.equal(manifest.version, version);
  assert.equal(manifest.private, true, "Publication must remain disabled");
  assert.equal(manifest.license, "MIT");
  assert.equal(manifest.publishConfig?.access, "public");
  assert.equal(manifest.publishConfig?.registry, "https://registry.npmjs.org/");
  const internal = Object.entries(manifest.dependencies ?? {}).filter(
    ([name]) => name.startsWith("@nzovu/"),
  );
  assert.deepEqual(
    internal.map(([name]) => name).sort(),
    [...spec.dependencies].sort(),
  );
  for (const [, range] of internal) assert.equal(range, "workspace:*");
  for (const [name, range] of Object.entries(manifest.dependencies ?? {}))
    if (!name.startsWith("@nzovu/"))
      assert.ok(
        !/^(file:|link:|workspace:)/.test(range),
        `Local dependency: ${name}`,
      );
  const paths = new Set(files.map((file) => file.path));
  assert.equal(paths.size, files.length, "Duplicate package paths");
  for (const path of paths) {
    assert.equal(posix.normalize(path), path, `Noncanonical path: ${path}`);
    assert.ok(
      !path.startsWith("/") && !path.startsWith("../") && !path.includes("\\"),
      `Unsafe path: ${path}`,
    );
    assert.ok(
      [
        "package.json",
        "README.md",
        "LICENCE",
        "scripts/block-release.mjs",
      ].includes(path) ||
        (path.startsWith(`${spec.output}/`) &&
          /\.(js|d\.ts|js\.map)$/.test(path)),
      `Unexpected distribution file: ${path}`,
    );
    assert.ok(
      !/(?:^|\/)(?:__tests__|tests|node_modules)(?:\/|$)|\.(?:test|spec)\.|migration|\.tsbuildinfo$/i.test(
        path,
      ),
      `Unwanted file: ${path}`,
    );
  }
  for (const path of [
    "package.json",
    "README.md",
    "LICENCE",
    "scripts/block-release.mjs",
    manifest.main,
    manifest.types,
    ...Object.values(manifest.bin ?? {}),
  ]) {
    assert.equal(typeof path, "string", "Missing entry point");
    assert.ok(paths.has(normalized(path)), `Missing package file: ${path}`);
  }
  function checkExports(value) {
    if (typeof value === "string") {
      assert.ok(value.startsWith("./"), `Invalid export target: ${value}`);
      if (!value.includes("*"))
        assert.ok(paths.has(normalized(value)), `Missing export: ${value}`);
      else {
        const [prefix, suffix] = normalized(value).split("*");
        assert.ok(
          [...paths].some(
            (path) => path.startsWith(prefix) && path.endsWith(suffix),
          ),
          `Empty export pattern: ${value}`,
        );
      }
    } else for (const child of Object.values(value ?? {})) checkExports(child);
  }
  checkExports(manifest.exports);
  assert.ok(manifest.exports?.["."]?.types, "Root type export required");
  for (const hook of ["prepack", "prepublishOnly"])
    assert.equal(manifest.scripts?.[hook], "node scripts/block-release.mjs");
  for (const hook of ["preinstall", "install", "postinstall", "prepare"])
    assert.equal(
      manifest.scripts?.[hook],
      undefined,
      `Unexpected install lifecycle: ${hook}`,
    );
}

function link(target, path) {
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path, "dir");
}
export function checkDistribution() {
  const rootManifest = json(join(ROOT, "package.json"));
  const directory = mkdtempSync(join(tmpdir(), "nzovu-consumer-"));
  try {
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({ private: true, type: "module" }),
    );
    const license = readFileSync(join(ROOT, "LICENCE"), "utf8");
    for (const spec of packages) {
      const source = join(ROOT, "packages", spec.directory);
      const manifest = json(join(source, "package.json"));
      const inventory = JSON.parse(
        execFileSync(
          "npm",
          ["pack", "--dry-run", "--ignore-scripts", "--offline", "--json"],
          {
            cwd: source,
            encoding: "utf8",
            timeout: 30000,
            env: { ...process.env, npm_config_update_notifier: "false" },
          },
        ),
      );
      assert.equal(inventory.length, 1);
      const { files } = inventory[0];
      validateInventory(spec, manifest, files, rootManifest.version);
      assert.equal(
        readFileSync(join(source, "LICENCE"), "utf8"),
        license,
        "License must preserve the source notice",
      );
      const destination = join(directory, "node_modules", spec.name);
      for (const { path } of files) {
        const from = join(source, path),
          to = join(destination, path);
        assert.ok(
          lstatSync(from).isFile(),
          `Nonregular distribution file: ${path}`,
        );
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(from, to);
        if (path.endsWith(".js.map")) {
          const map = json(to);
          assert.equal(
            map.sourcesContent?.length,
            map.sources.length,
            `Missing embedded source: ${path}`,
          );
          assert.ok(
            map.sourcesContent.every((content) => typeof content === "string"),
          );
        }
      }
      const guard = spawnSync(process.execPath, ["scripts/block-release.mjs"], {
        cwd: destination,
        encoding: "utf8",
        timeout: 5000,
      });
      assert.equal(guard.status, 1, "Packaged release guard must reject");
      assert.match(guard.stderr, /disabled|blocked/i);
      for (const name of Object.keys(manifest.dependencies ?? {})) {
        if (name.startsWith("@nzovu/")) continue;
        link(
          realpathSync(join(source, "node_modules", name)),
          join(destination, "node_modules", name),
        );
      }
      for (const [name, path] of Object.entries(manifest.bin ?? {})) {
        const target = join(destination, path);
        assert.ok(
          readFileSync(target, "utf8").startsWith("#!/usr/bin/env node\n"),
          `Missing CLI shebang: ${name}`,
        );
        chmodSync(target, 0o755);
        mkdirSync(join(directory, "node_modules/.bin"), { recursive: true });
        symlinkSync(target, join(directory, "node_modules/.bin", name));
      }
      console.log(
        `${spec.name}: ${files.length} dry-run files, license, exports and guards verified`,
      );
    }
    link(
      realpathSync(join(ROOT, "node_modules/@types/node")),
      join(directory, "node_modules/@types/node"),
    );
    for (const name of [
      "consumer.cts",
      "consumer.mts",
      "runtime.cjs",
      "runtime.mjs",
    ])
      copyFileSync(join(ROOT, "scripts/consumer", name), join(directory, name));
    execFileSync(
      process.execPath,
      [
        join(ROOT, "node_modules/typescript/bin/tsc"),
        "--noEmit",
        "--strict",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        "--target",
        "ES2022",
        "--types",
        "node",
        "consumer.cts",
        "consumer.mts",
      ],
      { cwd: directory, stdio: "inherit", timeout: 60000 },
    );
    for (const name of ["runtime.cjs", "runtime.mjs"])
      execFileSync(process.execPath, [name], {
        cwd: directory,
        stdio: "inherit",
        timeout: 15000,
      });
    console.log(
      "Isolated distribution files: CJS/ESM, declarations and MCP CLI passed; no archives created",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  checkDistribution();
