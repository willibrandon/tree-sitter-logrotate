import { join } from "node:path";
import {
  findNeovim,
  prepareNeovimRuntime,
  repositoryRoot,
  runNeovim,
} from "./neovim-runtime.mjs";

const neovim = await findNeovim();
const runtime = await prepareNeovimRuntime();

try {
  process.exitCode = runNeovim(neovim, runtime, [
    "--headless",
    "-l",
    join(repositoryRoot, "test", "editors", "neovim", "file-recognition.lua"),
  ]);
} finally {
  await runtime.remove();
}
