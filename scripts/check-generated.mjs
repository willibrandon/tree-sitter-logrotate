import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runTreeSitter } from "./tree-sitter-cli.mjs";

const generatedFiles = [
  "grammar.json",
  "node-types.json",
  "parser.c",
  "tree_sitter/alloc.h",
  "tree_sitter/array.h",
  "tree_sitter/parser.h",
];
const temporaryDirectory = await mkdtemp(join(tmpdir(), "tree-sitter-logrotate-generated-"));
const grammars = [
  {
    committedDirectory: resolve("src"),
    grammar: "grammar.js",
    outputDirectory: join(temporaryDirectory, "src"),
  },
  {
    committedDirectory: resolve("src/state/src"),
    grammar: "src/state/grammar.js",
    outputDirectory: join(temporaryDirectory, "state-src"),
  },
];

try {
  const mismatches = [];
  for (const grammar of grammars) {
    const result = runTreeSitter(
      ["generate", "--abi", "15", "--output", grammar.outputDirectory, grammar.grammar],
      { encoding: "utf8" },
    );
    if (result.error !== undefined) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`Generation failed for ${grammar.grammar}:\n${result.stderr}`);
    }

    for (const path of generatedFiles) {
      const committedPath = join(grammar.committedDirectory, path);
      const committed = await readFile(committedPath);
      const generated = await readFile(join(grammar.outputDirectory, path));
      if (!committed.equals(generated)) {
        mismatches.push(committedPath);
      }
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
