import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const generatedFiles = [
  "grammar.json",
  "node-types.json",
  "parser.c",
  "tree_sitter/alloc.h",
  "tree_sitter/array.h",
  "tree_sitter/parser.h",
];
const temporaryDirectory = await mkdtemp(join(tmpdir(), "tree-sitter-logrotate-generated-"));
const outputDirectory = join(temporaryDirectory, "src");

try {
  const result = spawnSync(
    "tree-sitter",
    ["generate", "--abi", "15", "--output", outputDirectory, "grammar.js"],
    { encoding: "utf8", shell: false },
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Generation failed:\n${result.stderr}`);
  }

  const mismatches = [];
  for (const path of generatedFiles) {
    const committed = await readFile(resolve("src", path));
    const generated = await readFile(join(outputDirectory, path));
    if (!committed.equals(generated)) {
      mismatches.push(`src/${path}`);
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `Generated files are out of date or not reproducible: ${mismatches.join(", ")}. Run npm run generate.`,
    );
  }
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
