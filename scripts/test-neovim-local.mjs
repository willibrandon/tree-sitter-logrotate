import { resolve } from "node:path";
import {
  findNeovim,
  prepareNeovimRuntime,
  runConfiguredNeovim,
} from "./neovim-runtime.mjs";

const files = process.argv.slice(2).map((file) => resolve(file));
const neovim = await findNeovim();
const runtime = await prepareNeovimRuntime();

try {
  process.exitCode = runConfiguredNeovim(neovim, runtime, files);
} finally {
  await runtime.remove();
}
