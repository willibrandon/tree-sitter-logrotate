import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { findNeovim, repositoryRoot } from "./neovim-runtime.mjs";

const referenceTreesitter =
  process.env.NVIM_TREESITTER_SOURCE ?? "/home/brandon/src/nvim-treesitter";
const referenceLazy =
  process.env.LAZY_NVIM_SOURCE ?? "/home/brandon/.local/share/nvim/lazy/lazy.nvim";
const referenceLazyVim = process.env.LAZYVIM_SOURCE ?? "/home/brandon/src/LazyVim";
const timeout = 600_000;
const packageVersion = JSON.parse(
  await readFile(join(repositoryRoot, "package.json"), "utf8"),
).version;
const versionRange = packageVersion.split(".").slice(0, 2).join(".");

const run = (command, arguments_, options = {}) => {
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
    stdio: options.stdio ?? "inherit",
    timeout,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `${command} ${arguments_.join(" ")} exited with code ${String(result.status)}.${details === "" ? "" : `\n${details}`}`,
    );
  }
  return result.stdout?.trim();
};

const git = (directory, ...arguments_) =>
  run("git", ["-c", "safe.directory=*", "-C", directory, ...arguments_], {
    stdio: "pipe",
  });

const pluginUrl = (path) => pathToFileURL(path).href;

const initializeRepository = (directory, message) => {
  run("git", ["init", "--initial-branch=main", directory], { stdio: "pipe" });
  git(directory, "config", "user.name", "Neovim install test");
  git(directory, "config", "user.email", "neovim-install-test@example.invalid");
  git(directory, "add", ".");
  git(directory, "commit", "--message", message);
};

const createPluginRepository = async (temporaryRoot) => {
  const source = join(temporaryRoot, "tree-sitter-logrotate");
  await mkdir(source, { recursive: true });
  for (const path of [
    "doc",
    "build.lua",
    "grammar.js",
    "LICENSE",
    "lua",
    "package.json",
    "pkg.json",
    "plugin",
    "queries",
    "src",
    "tree-sitter.json",
  ]) {
    await cp(join(repositoryRoot, path), join(source, path), { recursive: true });
  }
  initializeRepository(source, "Test current worktree");
  git(source, "tag", `v${packageVersion}`);
  return source;
};

const createReferenceRepository = async (temporaryRoot, reference, name) => {
  const staged = join(temporaryRoot, "references", name);
  await mkdir(staged, { recursive: true });
  git(
    reference,
    "checkout-index",
    "--all",
    "--force",
    `--prefix=${staged}${sep}`,
  );
  initializeRepository(staged, `Stage ${name}`);
  return staged;
};

const profileEnvironment = (root) => ({
  ...process.env,
  ...(process.platform === "win32"
    ? {
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "core.longpaths",
        GIT_CONFIG_VALUE_0: "true",
      }
    : {}),
  NVIM_APPNAME: "nvim",
  TREE_SITTER_LOGROTATE_ROOT: repositoryRoot,
  XDG_CACHE_HOME: join(root, "cache"),
  XDG_CONFIG_HOME: join(root, "config"),
  XDG_DATA_HOME: join(root, "data"),
  XDG_STATE_HOME: join(root, "state"),
});

const verificationScript = (integrationTest) => [
  `local ok, err = pcall(dofile, ${JSON.stringify(integrationTest)})`,
  "if not ok then",
  '  io.stderr:write(vim.fn.execute("messages") .. "\\n")',
  '  io.stderr:write(tostring(err) .. "\\n")',
  '  vim.cmd("cquit 1")',
  "end",
  'vim.cmd("checkhealth tree-sitter-logrotate")',
  'local report = table.concat(vim.api.nvim_buf_get_lines(0, 0, -1, false), "\\n")',
  'if report:find("ERROR", 1, true) or report:find("WARNING", 1, true) then',
  '  io.stderr:write(report .. "\\n")',
  '  vim.cmd("cquit 1")',
  "end",
  'vim.cmd("qa")',
  "",
].join("\n");

const neovim = await findNeovim();
const temporaryRoot = await mkdtemp(join(tmpdir(), "tslr-"));

try {
  const treesitterSource = await createReferenceRepository(
    temporaryRoot,
    referenceTreesitter,
    "nvim-treesitter",
  );
  const lazySource = await createReferenceRepository(
    temporaryRoot,
    referenceLazy,
    "lazy.nvim",
  );
  const lazyVimSource = await createReferenceRepository(
    temporaryRoot,
    referenceLazyVim,
    "LazyVim",
  );
  const source = await createPluginRepository(temporaryRoot);
  const profile = join(temporaryRoot, "native");
  const config = join(profile, "config", "nvim");
  await mkdir(config, { recursive: true });
  const treesitterRevision = git(treesitterSource, "rev-parse", "HEAD");
  await writeFile(
    join(config, "init.lua"),
    [
      'vim.api.nvim_create_autocmd("PackChanged", {',
      "  callback = function(event)",
      "    local name, kind = event.data.spec.name, event.data.kind",
      '    if name == "tree-sitter-logrotate" and (kind == "install" or kind == "update") then',
      '      vim.cmd.source(vim.fs.joinpath(event.data.path, "build.lua"))',
      "    end",
      "  end,",
      "})",
      "vim.pack.add({",
      `  { src = ${JSON.stringify(pluginUrl(treesitterSource))}, version = ${JSON.stringify(treesitterRevision)} },`,
      "}, { confirm = false, load = true })",
      "vim.pack.add({",
      `  { src = ${JSON.stringify(pluginUrl(source))}, version = vim.version.range(${JSON.stringify(versionRange)}) },`,
      "}, { confirm = false, load = true })",
      "",
    ].join("\n"),
  );
  const environment = profileEnvironment(profile);
  const verification = join(temporaryRoot, "verify-native.lua");
  await writeFile(
    verification,
    verificationScript(
      join(repositoryRoot, "test", "editors", "neovim", "file-recognition.lua"),
    ),
  );

  run(neovim, ["--headless", "+qa"], { env: environment });
  run(neovim, ["--headless", "-c", `luafile ${verification}`], {
    env: environment,
  });

  console.log("Clean native Neovim installation passed.");

  const lazyProfile = join(temporaryRoot, "lazyvim");
  const lazyConfig = join(lazyProfile, "config", "nvim");
  const dataApplicationName = process.platform === "win32" ? "nvim-data" : "nvim";
  const lazyData = join(lazyProfile, "data", dataApplicationName, "lazy");
  await mkdir(join(lazyConfig, "lua", "config"), { recursive: true });
  await mkdir(join(lazyConfig, "lua", "plugins"), { recursive: true });
  await mkdir(lazyData, { recursive: true });

  const lazyRevision = git(lazySource, "rev-parse", "HEAD");
  const lazyVimRevision = git(lazyVimSource, "rev-parse", "HEAD");
  run("git", ["clone", "--no-hardlinks", lazySource, join(lazyData, "lazy.nvim")], {
    stdio: "pipe",
  });
  git(join(lazyData, "lazy.nvim"), "checkout", "-B", "stable", lazyRevision);

  await writeFile(join(lazyConfig, "init.lua"), 'require("config.lazy")\n');
  await writeFile(
    join(lazyConfig, "lua", "config", "lazy.lua"),
    [
      'local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"',
      "vim.opt.runtimepath:prepend(lazypath)",
      'require("lazy").setup({',
      "  spec = {",
      `    { url = ${JSON.stringify(pluginUrl(lazyVimSource))}, name = "LazyVim", branch = "main", commit = ${JSON.stringify(lazyVimRevision)}, import = "lazyvim.plugins" },`,
      '    { import = "plugins" },',
      "  },",
      "  defaults = { lazy = false, version = false },",
      '  install = { colorscheme = { "habamax" } },',
      "  checker = { enabled = false },",
      "  change_detection = { notify = false },",
      "})",
      "",
    ].join("\n"),
  );
  await writeFile(
    join(lazyConfig, "lua", "plugins", "logrotate.lua"),
    [
      "return {",
      "  {",
      `    url = ${JSON.stringify(pluginUrl(source))},`,
      '    name = "tree-sitter-logrotate",',
      '    branch = "main",',
      '    version = "*",',
      '    dependencies = { "nvim-treesitter/nvim-treesitter" },',
      "  },",
      "}",
      "",
    ].join("\n"),
  );

  const lazyEnvironment = profileEnvironment(lazyProfile);
  const lazyInstallVerification = join(temporaryRoot, "verify-lazyvim-install.lua");
  await writeFile(
    lazyInstallVerification,
    [
      'local missing = {}',
      'for name, plugin in pairs(require("lazy.core.config").plugins) do',
      '  if not plugin._.installed and plugin._.kind ~= "disabled" then',
      '    table.insert(missing, name)',
      '  end',
      'end',
      'table.sort(missing)',
      'if #missing > 0 then',
      '  io.stderr:write("LazyVim did not install: " .. table.concat(missing, ", ") .. "\\n")',
      '  vim.cmd("cquit 1")',
      'end',
      '',
    ].join("\n"),
  );
  const lazyVerification = join(temporaryRoot, "verify-lazyvim.lua");
  await writeFile(
    lazyVerification,
    verificationScript(
      join(repositoryRoot, "test", "editors", "neovim", "file-recognition.lua"),
    ),
  );

  run(neovim, ["--headless", "+Lazy! sync", "-c", `luafile ${lazyInstallVerification}`, "+qa"], {
    env: lazyEnvironment,
    stdio: "pipe",
  });
  run(neovim, ["--headless", "-c", `luafile ${lazyVerification}`], {
    env: lazyEnvironment,
  });

  console.log("Clean LazyVim installation passed.");
} finally {
  if (process.env.KEEP_NEOVIM_TEST_PROFILES === "1") {
    console.log(`Preserved test profiles at ${temporaryRoot}`);
  } else {
    // Some LazyVim plugin build commands briefly outlive the headless Neovim
    // process. Retry transient non-empty-directory failures while those
    // children finish closing their output files.
    await rm(temporaryRoot, {
      force: true,
      maxRetries: 10,
      recursive: true,
      retryDelay: 250,
    });
  }
}
