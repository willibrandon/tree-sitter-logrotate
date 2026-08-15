import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFile(join(root, path), "utf8");

test("Neovim package exposes the standard runtime and parser lifecycle", async () => {
  const manifest = JSON.parse(await read("pkg.json"));
  const npmManifest = JSON.parse(await read("package.json"));
  const runtime = await read("lua/tree-sitter-logrotate/init.lua");
  const installer = await read("build.lua");
  const plugin = await read("plugin/tree-sitter-logrotate.lua");
  const help = await read("doc/tree-sitter-logrotate.txt");

  assert.equal(manifest.engines.nvim, ">=0.12.0");
  assert.equal(manifest.scripts, undefined);
  assert.deepEqual(manifest.lazy.dependencies, [
    "nvim-treesitter/nvim-treesitter",
  ]);
  for (const path of [
    "doc/**",
    "lua/**",
    "pkg.json",
    "plugin/**",
    "queries/**",
    "build.lua",
    "src/parser.c",
    "src/scanner.c",
    "src/state/src/**",
  ]) {
    assert.ok(npmManifest.files.includes(path), `${path} is not packaged`);
  }
  assert.doesNotMatch(npmManifest.files.join("\n"), /integrations\/neovim/u);
  assert.ok(!npmManifest.files.includes("src/**"));
  assert.match(runtime, /function M\.register_parsers\(\)/u);
  assert.match(runtime, /function M\.install\(options\)/u);
  assert.match(runtime, /function M\.update\(options\)/u);
  assert.match(runtime, /function M\.uninstall\(options\)/u);
  assert.match(installer, /logrotate\.update\(\{ summary = true \}\)/u);
  assert.match(plugin, /require\("tree-sitter-logrotate"\)\.setup\(\)/u);
  assert.match(help, /:LogrotateInstall/u);
  assert.match(help, /:LogrotateUpdate/u);
  assert.match(help, /:LogrotateUninstall/u);
});

test("Neovim query mirrors stay identical to the portable queries", async () => {
  const pairs = [
    ["queries/highlights.scm", "queries/logrotate/highlights.scm"],
    ["queries/injections.scm", "queries/logrotate/injections.scm"],
    ["queries/folds.scm", "queries/logrotate/folds.scm"],
    [
      "src/state/queries/highlights.scm",
      "queries/logrotate_state/highlights.scm",
    ],
  ];

  for (const [portable, runtime] of pairs) {
    assert.equal(await read(runtime), await read(portable), `${runtime} drifted`);
  }
});
