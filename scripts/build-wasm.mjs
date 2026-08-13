import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { runTreeSitter } from "./tree-sitter-cli.mjs";

const outputDirectory = resolve(process.env.TREE_SITTER_BUILD_DIR ?? "build");
mkdirSync(outputDirectory, { recursive: true });

const outputPath = resolve(outputDirectory, "tree-sitter-logrotate.wasm");
const result = runTreeSitter(["build", "--wasm", "--output", outputPath], {
  encoding: "utf8",
  stdio: "inherit",
});

if (result.error !== undefined) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(`WASM parser build exited with code ${String(result.status)}.`);
}
