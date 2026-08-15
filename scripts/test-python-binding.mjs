import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputRoot = resolve(process.env.TREE_SITTER_BUILD_DIR ?? resolve(root, "build"), "bindings/python");
const environmentDirectory = resolve(outputRoot, "venv");
await rm(outputRoot, { force: true, recursive: true });
await mkdir(outputRoot, { recursive: true });

const python = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
const run = (command, arguments_) => {
  const result = spawnSync(command, arguments_, { cwd: root, encoding: "utf8", shell: false, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${String(result.status)}.`);
};

run(python, ["-m", "venv", environmentDirectory]);
const environmentPython = process.platform === "win32"
  ? resolve(environmentDirectory, "Scripts/python.exe")
  : resolve(environmentDirectory, "bin/python");
run(environmentPython, ["-m", "pip", "install", "--disable-pip-version-check", ".[core]"]);
run(environmentPython, ["-m", "unittest", "discover", "-s", "bindings/python/tests", "-v"]);
run(environmentPython, [resolve(root, "scripts", "test-python-package.py")]);
