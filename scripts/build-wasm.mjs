import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const outputDirectory = resolve(process.env.TREE_SITTER_BUILD_DIR ?? "build");
mkdirSync(outputDirectory, { recursive: true });

const outputPath = resolve(outputDirectory, "tree-sitter-logrotate.wasm");
const result = spawnSync("tree-sitter", ["build", "--wasm", "--output", outputPath], {
  encoding: "utf8",
  shell: false,
  stdio: "inherit",
});

if (result.error !== undefined) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(`WASM parser build exited with code ${String(result.status)}.`);
}
