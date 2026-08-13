import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const treeSitterJson = JSON.parse(await readFile("tree-sitter.json", "utf8"));
const toolchains = JSON.parse(await readFile("toolchains.json", "utf8"));
const nvmVersion = (await readFile(".nvmrc", "utf8")).trim();

const errors = [];
const expectEqual = (actual, expected, description) => {
  if (actual !== expected) {
    errors.push(`${description}: expected ${String(expected)}, found ${String(actual)}`);
  }
};

expectEqual(packageJson.version, "0.1.0", "npm package version");
expectEqual(treeSitterJson.metadata?.version, packageJson.version, "Tree-sitter metadata version");
expectEqual(packageJson.engines?.node, toolchains.node, "Node.js version");
expectEqual(nvmVersion, toolchains.node, ".nvmrc version");
expectEqual(packageJson.packageManager, `npm@${toolchains.npm}`, "npm version");
expectEqual(packageJson.devDependencies?.["tree-sitter-cli"], toolchains.treeSitter, "Tree-sitter CLI version");

if (errors.length > 0) {
  throw new Error(`Version metadata is inconsistent:\n${errors.join("\n")}`);
}
