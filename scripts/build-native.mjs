import { spawnSync } from "node:child_process";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(process.env.TREE_SITTER_BUILD_DIR ?? "build");
const buildDirectory = resolve(outputDirectory, "native-cmake");
await rm(buildDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });

const run = (command, arguments_) => {
  const result = spawnSync(command, arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${String(result.status)}.`);
  }
};

run("cmake", [
  "-S",
  repositoryRoot,
  "-B",
  buildDirectory,
  "-G",
  "Ninja",
  "-DBUILD_TESTING=OFF",
  "-DBUILD_SHARED_LIBS=ON",
  "-DCMAKE_BUILD_TYPE=Release",
]);
run("cmake", ["--build", buildDirectory, "--target", "tree-sitter-logrotate"]);

const builtName = process.platform === "win32"
  ? "tree-sitter-logrotate.dll"
  : process.platform === "darwin"
    ? "libtree-sitter-logrotate.dylib"
    : "libtree-sitter-logrotate.so";
const outputName = process.platform === "win32"
  ? "tree-sitter-logrotate.dll"
  : process.platform === "darwin"
    ? "tree-sitter-logrotate.dylib"
    : "tree-sitter-logrotate.so";
await copyFile(resolve(buildDirectory, builtName), resolve(outputDirectory, outputName));
