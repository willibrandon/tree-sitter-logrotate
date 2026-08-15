import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { runTreeSitter } from "./tree-sitter-cli.mjs";

const outputDirectory = resolve(process.env.TREE_SITTER_BUILD_DIR ?? "build");
mkdirSync(outputDirectory, { recursive: true });

const maximumDownloadAttempts = 3;
const parsers = [
  ["tree-sitter-logrotate", undefined],
  ["tree-sitter-logrotate-state", "src/state"],
];

for (const [name, grammarPath] of parsers) {
  const outputPath = resolve(outputDirectory, `${name}.wasm`);
  let result;

  for (let attempt = 1; attempt <= maximumDownloadAttempts; attempt += 1) {
    const arguments_ = ["build", "--wasm", "--output", outputPath];
    if (grammarPath !== undefined) arguments_.push(grammarPath);
    result = runTreeSitter(arguments_, { encoding: "utf8" });
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
    throw new Error(`${name} WASM build exited with code ${String(result.status)}.`);
  }
}
