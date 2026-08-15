import { spawnSync } from "node:child_process";
import { access, mkdir, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const repositoryRoot = resolve(".");
const prebuildsDirectory = resolve(repositoryRoot, "prebuilds");
const prebuiltBinding = resolve(
  prebuildsDirectory,
  `${process.platform}-${process.arch}`,
  "tree-sitter-logrotate.node",
);
const forceBuild = process.argv.includes("--force");

if (!forceBuild) {
  try {
    await access(prebuiltBinding);
    createRequire(import.meta.url)(prebuiltBinding);
    process.exit(0);
  } catch {
    // A source checkout has no prebuilds. Compile the committed generated parsers.
  }
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
