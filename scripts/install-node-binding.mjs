import { spawnSync } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

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
