import { spawnSync } from "node:child_process";
import { access, mkdir, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const repositoryRoot = resolve(".");
const prebuildsDirectory = resolve(repositoryRoot, "prebuilds");

try {
  await access(prebuildsDirectory);
  createRequire(import.meta.url)("node-gyp-build")(repositoryRoot);
  process.exit(0);
} catch {
  // A source checkout has no prebuilds. Compile the committed generated parser.
}

const buildDirectory = resolve("build");
await mkdir(buildDirectory, { recursive: true });

for (const entry of await readdir(buildDirectory)) {
  await rm(resolve(buildDirectory, entry), { force: true, recursive: true });
}

const configuredNodeGyp = process.env.npm_config_node_gyp;
const nodeGyp = configuredNodeGyp === undefined ? (process.platform === "win32" ? "node-gyp.cmd" : "node-gyp") : process.execPath;

for (const command of ["configure", "build"]) {
  const arguments_ = configuredNodeGyp === undefined ? [command] : [configuredNodeGyp, command];
  const result = spawnSync(nodeGyp, arguments_, {
    encoding: "utf8",
    shell: false,
    stdio: "inherit",
  });

  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`node-gyp ${command} exited with code ${String(result.status)}.`);
  }
}
