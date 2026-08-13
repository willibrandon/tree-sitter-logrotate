import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { runTreeSitter } from "./tree-sitter-cli.mjs";

const root = resolve(import.meta.dirname, "..");
const output = resolve(process.env.TREE_SITTER_BUILD_DIR ?? resolve(root, "build"), "fuzz");
const runDirectory = await mkdtemp(resolve(tmpdir(), "tree-sitter-logrotate-fuzz-"));
const iterationsIndex = process.argv.indexOf("--iterations");
const editsIndex = process.argv.indexOf("--edits");
const iterations = iterationsIndex === -1 ? "10000" : process.argv[iterationsIndex + 1];
const edits = editsIndex === -1 ? "5" : process.argv[editsIndex + 1];

if (iterations === undefined || edits === undefined || !/^\d+$/u.test(iterations) || !/^\d+$/u.test(edits)) {
  throw new Error("--iterations and --edits require non-negative integers.");
}

const execute = (arguments_, environment = {}) => runTreeSitter(arguments_, {
  cwd: runDirectory,
  encoding: "utf8",
  env: { ...process.env, ...environment },
});

try {
  await rm(output, { force: true, recursive: true });
  const arguments_ = [
    "fuzz",
    "--grammar-path",
    root,
    "--edits",
    edits,
    "--iterations",
    iterations,
  ];
  const result = execute(arguments_);
  const transcript = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");

  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, "fuzz.log"), transcript);
  if (result.error !== undefined) throw result.error;

  const reportedFailure = /Incorrect parse for|Unexpected scope change in seed|corpus tests failed fuzzing|AddressSanitizer|UndefinedBehaviorSanitizer/iu.test(transcript);
  if (result.status !== 0 || reportedFailure) {
    const failureSeed = transcript.match(/(?:Incorrect parse for[^\n]* - seed|Unexpected scope change in seed) (\d+)/u)?.[1];
    if (failureSeed !== undefined) {
      const replay = execute([
        "fuzz",
        "--grammar-path",
        root,
        "--edits",
        edits,
        "--iterations",
        "1",
      ], {
        TREE_SITTER_DUMP_EDITS: "1",
        TREE_SITTER_SEED: failureSeed,
      });
      await writeFile(resolve(output, "replay.log"), `${replay.stdout ?? ""}${replay.stderr ?? ""}`);
      await cp(resolve(runDirectory, "fuzz"), resolve(output, "edited-inputs"), {
        force: true,
        recursive: true,
      });
    }
    throw new Error(`Tree-sitter fuzzing reported a failure. Reproduction data is in ${output}.`);
  }

  process.stdout.write(`Tree-sitter fuzzing passed ${iterations} incremental-edit iterations per corpus case.\n`);
} finally {
  await rm(runDirectory, { force: true, recursive: true });
}
