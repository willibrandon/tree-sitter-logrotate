import { cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(".");
const packageMetadata = JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8"));
const target = packageMetadata.engines?.node;

if (typeof target !== "string" || target.length === 0) {
  throw new Error("package.json must declare the exact Node.js target in engines.node.");
}

const isolatedOutputRoot = resolve(
  process.env.TREE_SITTER_BUILD_DIR ?? resolve(repositoryRoot, "build"),
);
const stagingDirectory = resolve(isolatedOutputRoot, "node-prebuild");
const prebuildify = resolve(repositoryRoot, "node_modules/prebuildify/bin.js");
const nodeGyp = resolve(
  repositoryRoot,
  "node_modules/.bin",
  process.platform === "win32" ? "node-gyp.cmd" : "node-gyp",
);
const prebuildsDirectory = resolve(repositoryRoot, "prebuilds");

await rm(stagingDirectory, { recursive: true, force: true });
await mkdir(resolve(stagingDirectory, "bindings/node"), { recursive: true });

try {
  await cp(resolve(repositoryRoot, "binding.gyp"), resolve(stagingDirectory, "binding.gyp"));
  await cp(resolve(repositoryRoot, "package.json"), resolve(stagingDirectory, "package.json"));
  await cp(
    resolve(repositoryRoot, "bindings/node/binding.cc"),
    resolve(stagingDirectory, "bindings/node/binding.cc"),
  );
  await cp(resolve(repositoryRoot, "src"), resolve(stagingDirectory, "src"), { recursive: true });

  const result = spawnSync(
    process.execPath,
    [
      prebuildify,
      "--napi",
      "--strip",
      "--target",
      target,
      "--cwd",
      stagingDirectory,
      "--out",
      stagingDirectory,
      "--node-gyp",
      nodeGyp,
    ],
    {
      encoding: "utf8",
      shell: false,
      stdio: "inherit",
    },
  );

  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`prebuildify exited with code ${String(result.status)}.`);
  }

  await mkdir(prebuildsDirectory, { recursive: true });
  for (const entry of await readdir(resolve(stagingDirectory, "prebuilds"), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const destination = resolve(prebuildsDirectory, entry.name);
    await rm(destination, { recursive: true, force: true });
    await cp(resolve(stagingDirectory, "prebuilds", entry.name), destination, {
      recursive: true,
    });
  }
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
}
