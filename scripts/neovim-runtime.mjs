import { spawnSync } from "node:child_process";
import {
  access,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, extname, join, resolve } from "node:path";

export const repositoryRoot = resolve(import.meta.dirname, "..");

const executableCandidates = () => [
  process.env.NVIM,
  ...String(process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, process.platform === "win32" ? "nvim.exe" : "nvim")),
  join(homedir(), ".local", "neovim", "bin", process.platform === "win32" ? "nvim.exe" : "nvim"),
].filter(Boolean);

export const findNeovim = async () => {
  for (const candidate of executableCandidates()) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("Neovim was not found. Set NVIM to its executable path.");
};

const findNvimTreesitter = async () => {
  const candidates = [
    process.env.NVIM_TREESITTER_RUNTIME,
    join(homedir(), ".local", "share", "nvim", "lazy", "nvim-treesitter"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(join(candidate, "lua", "nvim-treesitter", "init.lua"));
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error(
    "nvim-treesitter was not found. Set NVIM_TREESITTER_RUNTIME to its checkout directory.",
  );
};

const runBuild = () => {
  const result = spawnSync(process.execPath, [join(repositoryRoot, "scripts", "build-native.mjs")], {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Native parser build exited with code ${String(result.status)}.`);
  }
};

const libraryName = process.platform === "win32"
  ? "tree-sitter-logrotate.dll"
  : process.platform === "darwin"
    ? "tree-sitter-logrotate.dylib"
    : "tree-sitter-logrotate.so";

const parserExtension = extname(libraryName);

const copyOptionalBashRuntime = async (runtime) => {
  const dataRoots = [
    ...String(process.env.XDG_DATA_DIRS ?? "").split(":").filter(Boolean),
    join(homedir(), ".local", "share", "nvim", "site"),
  ];
  for (const dataRoot of dataRoots) {
    const parser = join(dataRoot, "parser", `bash${parserExtension}`);
    const queries = join(dataRoot, "queries", "bash");
    try {
      await access(parser);
    } catch {
      continue;
    }
    await mkdir(join(runtime, "parser"), { recursive: true });
    await copyFile(parser, join(runtime, "parser", `bash${parserExtension}`));
    try {
      await access(queries);
      await cp(queries, join(runtime, "queries", "bash"), { recursive: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return;
  }
};

export const prepareNeovimRuntime = async () => {
  runBuild();
  const nvimTreesitter = await findNvimTreesitter();

  const temporaryRoot = await mkdtemp(join(tmpdir(), "tree-sitter-logrotate-neovim-"));
  const runtime = join(temporaryRoot, "runtime");
  const parserDirectory = join(runtime, "parser");
  await mkdir(parserDirectory, { recursive: true });

  const builtLibrary = join(repositoryRoot, "build", libraryName);
  await copyFile(builtLibrary, join(parserDirectory, `logrotate${parserExtension}`));
  await copyFile(builtLibrary, join(parserDirectory, `logrotate_state${parserExtension}`));

  await copyOptionalBashRuntime(runtime);

  const init = join(temporaryRoot, "init.lua");
  await writeFile(
    init,
    [
      `vim.opt.runtimepath:prepend(${JSON.stringify(nvimTreesitter)})`,
      `vim.opt.runtimepath:prepend(${JSON.stringify(runtime)})`,
      `vim.opt.runtimepath:prepend(${JSON.stringify(repositoryRoot)})`,
      'require("tree-sitter-logrotate").setup()',
      "",
    ].join("\n"),
  );

  const environment = {
    ...process.env,
    NVIM_APPNAME: "tree-sitter-logrotate-local",
    TREE_SITTER_LOGROTATE_ROOT: repositoryRoot,
    XDG_CACHE_HOME: join(temporaryRoot, "cache"),
    XDG_CONFIG_HOME: join(temporaryRoot, "config"),
    XDG_DATA_HOME: join(temporaryRoot, "data"),
    XDG_STATE_HOME: join(temporaryRoot, "state"),
  };

  return {
    environment,
    init,
    nvimTreesitter,
    remove: () => rm(temporaryRoot, { force: true, recursive: true }),
    runtime,
    temporaryRoot,
  };
};

export const runNeovim = (neovim, runtime, arguments_, stdio = "inherit") => {
  const result = spawnSync(neovim, ["--clean", "-u", runtime.init, ...arguments_], {
    cwd: repositoryRoot,
    env: runtime.environment,
    shell: false,
    stdio,
  });
  if (result.error !== undefined) throw result.error;
  return result.status ?? 1;
};

export const runConfiguredNeovim = (neovim, runtime, arguments_, stdio = "inherit") => {
  const commands = [
    `lua vim.opt.runtimepath:prepend(${JSON.stringify(runtime.nvimTreesitter)})`,
    `lua vim.opt.runtimepath:prepend(${JSON.stringify(runtime.runtime)})`,
    `lua vim.opt.runtimepath:prepend(${JSON.stringify(repositoryRoot)})`,
  ];
  const commandArguments = commands.flatMap((command) => ["--cmd", command]);
  const setup = `lua ${[
    `vim.opt.runtimepath:prepend(${JSON.stringify(runtime.nvimTreesitter)})`,
    `vim.opt.runtimepath:prepend(${JSON.stringify(runtime.runtime)})`,
    `vim.opt.runtimepath:prepend(${JSON.stringify(repositoryRoot)})`,
    'local module = require("tree-sitter-logrotate")',
    "module.setup()",
    "module.apply_filetype(0)",
  ].join("; ")}`;
  const result = spawnSync(neovim, [...commandArguments, "-c", setup, ...arguments_], {
    cwd: repositoryRoot,
    env: process.env,
    shell: false,
    stdio,
  });
  if (result.error !== undefined) throw result.error;
  return result.status ?? 1;
};
