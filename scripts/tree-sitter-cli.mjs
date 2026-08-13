import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const treeSitterCli = fileURLToPath(new URL("../node_modules/tree-sitter-cli/cli.js", import.meta.url));

export function runTreeSitter(arguments_, options = {}) {
  return spawnSync(process.execPath, [treeSitterCli, ...arguments_], {
    shell: false,
    ...options,
  });
}
