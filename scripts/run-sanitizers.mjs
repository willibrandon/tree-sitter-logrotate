import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

if (process.platform === "win32") {
  throw new Error("The sanitizer harness requires a Unix Clang runtime.");
}

const outputDirectory = resolve(process.env.TREE_SITTER_BUILD_DIR ?? "build", "sanitizers");
mkdirSync(outputDirectory, { recursive: true });

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    shell: false,
    stdio: "inherit",
    ...options,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${String(result.status)}.`);
  }
}

run("clang", [
  "-std=c99",
  "-pedantic-errors",
  "-Wall",
  "-Wextra",
  "-Werror",
  "-Isrc",
  "-c",
  "src/scanner.c",
  "-o",
  resolve(outputDirectory, "scanner-c99.o"),
]);

const executable = resolve(outputDirectory, "parser-smoke");
run("clang", [
  "-std=c11",
  "-O1",
  "-g",
  "-fsanitize=address,undefined",
  "-fno-omit-frame-pointer",
  "-D_DEFAULT_SOURCE",
  "-D_POSIX_C_SOURCE=200112L",
  "-I",
  "node_modules/tree-sitter/vendor/tree-sitter/lib/include",
  "-I",
  "node_modules/tree-sitter/vendor/tree-sitter/lib/src",
  "scripts/sanitizer-smoke.c",
  "src/parser.c",
  "src/scanner.c",
  "node_modules/tree-sitter/vendor/tree-sitter/lib/src/lib.c",
  "-o",
  executable,
]);
run(executable, [], {
  env: {
    ...process.env,
    ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1",
    UBSAN_OPTIONS: "halt_on_error=1:print_stacktrace=1",
  },
});

process.stdout.write("C99 scanner and sanitizer checks passed.\n");
