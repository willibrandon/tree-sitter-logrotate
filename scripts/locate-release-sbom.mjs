import { readdir } from "node:fs/promises";
import { join } from "node:path";

const directory = process.argv[2] ?? "dist";
const entries = await readdir(directory, { withFileTypes: true });
const sboms = entries
  .filter((entry) => entry.isFile() && /^tree-sitter-logrotate-.+-release\.cdx\.json$/u.test(entry.name))
  .map(({ name }) => join(directory, name))
  .sort();

if (sboms.length !== 1) {
  throw new Error(`Expected exactly one release SBOM in ${directory}, found ${sboms.length}.`);
}

process.stdout.write(`path=${sboms[0]}\n`);
