import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { runTreeSitter } from "./tree-sitter-cli.mjs";

const outputDirectory = resolve(process.env.TREE_SITTER_BUILD_DIR ?? "build");
mkdirSync(outputDirectory, { recursive: true });

const outputPath = resolve(outputDirectory, "tree-sitter-logrotate.wasm");
const maximumDownloadAttempts = 3;
let result;

for (let attempt = 1; attempt <= maximumDownloadAttempts; attempt += 1) {
  result = runTreeSitter(["build", "--wasm", "--output", outputPath], { encoding: "utf8" });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const wasiDownloadFailed = /Failed to download wasi-sdk/u.test(output);
  if (result.status === 0 || result.error !== undefined || !wasiDownloadFailed) {
    break;
  }

  if (attempt < maximumDownloadAttempts) {
    process.stderr.write(`Retrying the WASI SDK download (${String(attempt + 1)}/${String(maximumDownloadAttempts)}).\n`);
    await setTimeout(attempt * 2_000);
  }
}

if (result.error !== undefined) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(`WASM parser build exited with code ${String(result.status)}.`);
}
