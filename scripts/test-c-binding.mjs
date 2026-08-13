import { spawnSync } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputRoot = resolve(process.env.TREE_SITTER_BUILD_DIR ?? resolve(root, "build"), "bindings/c");
const buildDirectory = resolve(outputRoot, "build");
const installDirectory = resolve(outputRoot, "install");
await rm(outputRoot, { force: true, recursive: true });
await mkdir(outputRoot, { recursive: true });

const run = (command, arguments_) => {
  const result = spawnSync(command, arguments_, { cwd: root, encoding: "utf8", shell: false, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${String(result.status)}.`);
};

run("cmake", ["-S", root, "-B", buildDirectory, "-G", "Ninja", "-DCMAKE_BUILD_TYPE=Release", `-DCMAKE_INSTALL_PREFIX=${installDirectory}`, "-DBUILD_TESTING=ON"]);
run("cmake", ["--build", buildDirectory]);
run("ctest", ["--test-dir", buildDirectory, "--output-on-failure"]);
run("cmake", ["--install", buildDirectory]);

const installedLibrary = process.platform === "win32"
  ? resolve(installDirectory, "bin/tree-sitter-logrotate.dll")
  : process.platform === "darwin"
    ? resolve(installDirectory, "lib/libtree-sitter-logrotate.dylib")
    : resolve(installDirectory, "lib/libtree-sitter-logrotate.so");
await Promise.all([
  access(resolve(installDirectory, "include/tree_sitter/tree-sitter-logrotate.h")),
  access(resolve(installDirectory, "lib/pkgconfig/tree-sitter-logrotate.pc")),
  access(installedLibrary),
]);
