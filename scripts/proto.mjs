import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
const REPOSITORY = "https://github.com/adrien19/nzovu";
const SHA = /^[a-f0-9]{40}$/;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function files(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Symlink not allowed: ${path}`);
      return entry.isDirectory() ? files(path) : [path];
    })
    .sort();
}

export function verifySources(root = ROOT) {
  const manifest = JSON.parse(
    readFileSync(join(root, "proto/SOURCE.json"), "utf8"),
  );
  if (manifest.repository !== REPOSITORY || !SHA.test(manifest.commit)) {
    throw new Error("Invalid protocol repository or full commit SHA");
  }
  const actual = files(join(root, "proto"))
    .filter((path) => path.endsWith(".proto"))
    .map((path) => relative(root, path).replaceAll("\\", "/"));
  const expected = Object.keys(manifest.files).sort();
  if (!expected.length || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Protocol file set differs from SOURCE.json");
  }
  for (const path of expected) {
    if (hash(readFileSync(join(root, path))) !== manifest.files[path]) {
      throw new Error(`Protocol checksum mismatch: ${path}`);
    }
  }
  return manifest;
}

function replaceDirectory(prepared, destination) {
  const backup = `${prepared}.previous`;
  const existed = existsSync(destination);
  if (existed) renameSync(destination, backup);
  try {
    renameSync(prepared, destination);
  } catch (error) {
    if (existed) renameSync(backup, destination);
    throw error;
  }
  rmSync(backup, { recursive: true, force: true });
}

export function updateSources(source, commit, root = ROOT) {
  if (!source || !commit || !SHA.test(commit)) {
    throw new Error("update requires --source checkout and --commit full SHA");
  }
  const git = (...args) =>
    execFileSync("git", ["-C", resolve(source), ...args]);
  const resolved = git("rev-parse", `${commit}^{commit}`).toString().trim();
  if (resolved !== commit) throw new Error("Source commit does not match");
  const paths = git("ls-tree", "-rz", "--name-only", commit, "--", "proto/")
    .toString()
    .split("\0")
    .filter((path) => path.endsWith(".proto"))
    .sort();
  if (
    !paths.length ||
    paths.some((path) => !/^proto\/[\w/.-]+\.proto$/.test(path))
  ) {
    throw new Error("Invalid source protocol file set");
  }
  const temporary = mkdtempSync(join(root, ".proto-update-"));
  try {
    const prepared = join(temporary, "proto");
    const manifest = { repository: REPOSITORY, commit, files: {} };
    for (const path of paths) {
      const bytes = git("show", `${commit}:${path}`);
      const target = join(temporary, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
      manifest.files[path] = hash(bytes);
    }
    writeFileSync(
      join(prepared, "SOURCE.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    verifySources(temporary);
    replaceDirectory(prepared, join(root, "proto"));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function generate(check = false, root = ROOT) {
  const manifest = verifySources(root);
  const pkg = join(root, "packages/proto");
  for (const [name, expected] of [
    ["protoc", "33.1.0"],
    ["ts-proto", "2.8.3"],
  ]) {
    const { version } = JSON.parse(
      readFileSync(join(pkg, "node_modules", name, "package.json"), "utf8"),
    );
    if (version !== expected)
      throw new Error(`Expected ${name}@${expected}, got ${version}`);
  }
  const temporary = mkdtempSync(join(pkg, ".proto-generate-"));
  try {
    const output = join(temporary, "generated");
    mkdirSync(output);
    const bin = join(pkg, "node_modules/.bin");
    execFileSync(
      join(bin, "protoc"),
      [
        `--plugin=protoc-gen-ts_proto=${join(bin, "protoc-gen-ts_proto")}`,
        `--ts_proto_out=${output}`,
        "--ts_proto_opt=outputServices=grpc-js,esModuleInterop=true,forceLong=string,useOptionals=messages",
        `-I${root}`,
        ...Object.keys(manifest.files).sort(),
      ],
      { cwd: root, stdio: "inherit" },
    );
    const destination = join(pkg, "src/generated");
    if (check) {
      const snapshot = (dir) =>
        files(dir).map((path) => [
          relative(dir, path),
          hash(readFileSync(path)),
        ]);
      if (
        JSON.stringify(snapshot(output)) !==
        JSON.stringify(snapshot(destination))
      ) {
        throw new Error("Generated protocol drift; run make gen-proto");
      }
    } else {
      replaceDirectory(output, destination);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { values, positionals } = parseArgs({
      options: { source: { type: "string" }, commit: { type: "string" } },
      allowPositionals: true,
    });
    if (positionals.length !== 1)
      throw new Error("Choose verify, generate, check or update");
    switch (positionals[0]) {
      case "verify":
        verifySources();
        break;
      case "generate":
        generate();
        break;
      case "check":
        generate(true);
        break;
      case "update":
        updateSources(values.source, values.commit);
        break;
      default:
        throw new Error(`Unknown operation: ${positionals[0]}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
