import { resolve } from "node:path";
import { sha256 } from "./release-common.mjs";

const [path, expected] = process.argv.slice(2);

if (path === undefined || expected === undefined) {
  throw new Error("Usage: node scripts/check-file-sha256.mjs <path> <sha256>");
}
if (!/^[0-9a-f]{64}$/u.test(expected)) {
  throw new Error(`Invalid SHA-256 digest: ${expected}`);
}

const actual = await sha256(resolve(path));
if (actual !== expected) {
  throw new Error(`SHA-256 mismatch for ${path}: expected ${expected}, received ${actual}`);
}

console.log(`Verified SHA-256 for ${path}.`);
