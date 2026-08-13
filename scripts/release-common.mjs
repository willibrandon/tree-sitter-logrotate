import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function packageMetadata() {
  return JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8"));
}

export function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
    stdio: options.capture === true ? "pipe" : "inherit",
    ...options,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    const output = options.capture === true ? `\n${result.stdout ?? ""}${result.stderr ?? ""}` : "";
    throw new Error(`${command} ${arguments_.join(" ")} exited with code ${String(result.status)}.${output}`);
  }
  return result;
}

export function npmRun(script, extraArguments = [], options = {}) {
  const npmCli = process.env.npm_execpath ?? resolve(repositoryRoot, "node_modules/npm/bin/npm-cli.js");
  return run(process.execPath, [npmCli, "run", script, "--", ...extraArguments], options);
}

export async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export async function listFiles(directory) {
  const result = [];
  const visit = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        result.push(path);
      }
    }
  };
  await visit(directory);
  return result.sort();
}

export function optionValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

export function mediaType(path) {
  if (path.endsWith(".wasm")) return "application/wasm";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".jar")) return "application/java-archive";
  if (path.endsWith(".whl")) return "application/zip";
  if (path.endsWith(".tgz") || path.endsWith(".tar.gz") || path.endsWith(".crate")) return "application/gzip";
  if (path.endsWith(".pom")) return "application/xml";
  return "application/octet-stream";
}
