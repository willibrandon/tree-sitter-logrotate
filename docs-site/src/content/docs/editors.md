---
title: Editors
description: Configure tree-sitter-logrotate for Neovim, Helix, Zed, and other Tree-sitter hosts.
---

Use one released grammar revision for each parser, its queries, and its language configuration.

## Shared integration files

Pin one repository commit and use both generated parsers at that revision. Keep the configuration
queries and `src/state/queries/highlights.scm` on the same commit so their node names stay aligned.

The language name is `logrotate`, its scope is `source.logrotate`, and its generated symbol is
`tree_sitter_logrotate`. Script injection expects an available Bash parser.

The state language name is `logrotate_state`, its scope is `source.logrotate.state`, and its symbol
is `tree_sitter_logrotate_state`.

Editor integrations should recognize `logrotate.conf`, files directly below a `logrotate.d`
directory, `*.logrotate`, and `*.logrotate.conf`. Hosts with content detection may also recognize
an otherwise unclassified file when its first physical line is a complete log-path stanza. The
line may contain one or more absolute or `~/` paths, including quoted or escaped paths, followed by
`{`, optional whitespace, and an optional trailing comment. Detectors should examine no more than
8,192 characters. Generic configuration text, incomplete stanzas, shell functions, shebangs, and
logrotate state files must not select this grammar.

Files resolved through an `include` directive from an open configuration root also select
`logrotate`. Existing relative, absolute, quoted, Windows, and directly enumerated directory files
are covered. Missing targets, nested directory entries, and unexpanded wildcard targets are not
associated.

State detection recognizes `logrotate.status`, paths ending in `logrotate/status`, and otherwise
unclassified files whose first physical line is exactly `logrotate state -- version 1` or
`logrotate state -- version 2`. The first-line detector uses the same 8,192-character limit and
rejects unsupported versions, extra whitespace, and generic or nested `status` paths.

## Neovim

Neovim 0.12.0 or newer, the current `main` branch of nvim-treesitter, the Tree-sitter CLI, and a C
compiler are required.

### Native vim.pack

Add nvim-treesitter first so the parser installer is available when the logrotate package runs its
install hook:

```lua
vim.api.nvim_create_autocmd("PackChanged", {
  callback = function(event)
    local name, kind = event.data.spec.name, event.data.kind
    if name == "tree-sitter-logrotate" and (kind == "install" or kind == "update") then
      vim.cmd.source(vim.fs.joinpath(event.data.path, "build.lua"))
    end
  end,
})

vim.pack.add({
  {
    src = "https://github.com/nvim-treesitter/nvim-treesitter",
    version = "main",
  },
}, { load = true })

vim.pack.add({
  {
    src = "https://github.com/willibrandon/tree-sitter-logrotate",
    version = vim.version.range("0.2"),
  },
}, { load = true })
```

The `PackChanged` hook runs the package's parser build after installation and update. Define the
hook before the first `vim.pack.add()` call so it also handles a fresh lockfile installation.

### LazyVim

Create `lua/plugins/logrotate.lua` in the LazyVim configuration:

```lua
return {
  {
    "willibrandon/tree-sitter-logrotate",
    version = "*",
    dependencies = { "nvim-treesitter/nvim-treesitter" },
  },
}
```

lazy.nvim detects the package's `build.lua` and compiles the parsers during installation and
updates. Restart Neovim, then run `:checkhealth tree-sitter-logrotate`. The health check verifies
the compiler tools, three parsers, and all runtime queries.

### Usage

Open `logrotate.conf`, a direct child of `logrotate.d`, `*.logrotate`, `*.logrotate.conf`,
`logrotate.status`, or `logrotate/status`. The bounded first-line detectors recognize otherwise
unclassified configuration and state files. Opening a configuration root also associates the
existing files and direct directory children reached by its `include` directives.

Configuration buffers provide directive completion through Neovim's standard omnifunc. Use
`CTRL-X CTRL-O` to request it. LazyVim's Blink completion loads the same source automatically. Use
`CTRL-Y` to accept a selected directive; `Enter` inserts an indented newline.
Completion follows logrotate scope: global directives appear at the top level, rotation directives
and script openers appear inside a rotation block, and `endscript` appears inside a script body.

The runtime configures `#` comments, Tree-sitter indentation, rotation and script folds, and `%`
matching between each script opener and `endscript`. Insert-mode newlines indent rotation directives
and shell bodies, continue comments, and align `endscript`, shell closing keywords, and the closing
rotation brace with their openers.

Use `:LogrotateInstall`, `:LogrotateUpdate`, and `:LogrotateUninstall` to manage the two parsers.
The shared Bash parser remains installed when the logrotate parsers are removed.

### Development checkout

The repository includes an isolated runtime that builds both parsers from the current working tree,
loads the matching queries, and enables the shared file-recognition rules:

```sh
npm run test:neovim
npm run test:neovim:install
npm run test:neovim:local -- /path/to/logrotate.conf
npm run test:neovim:clean -- /path/to/logrotate.conf
```

The first command runs the headless parser, query, file-recognition, and include-resolution tests.
The install command creates separate empty Neovim and LazyVim profiles, installs the tagged package
through each package manager, and runs the same 141 assertions in both profiles. CI runs these
profiles with stable Neovim on Linux x64, macOS arm64, and Windows x64, plus a pinned Neovim
development revision on Linux. The local command
opens the requested file with the normal Neovim configuration and colorscheme. The clean command
opens the temporary runtime with `--clean`. All temporary profiles are removed after the command.

Directive completion stays out of arguments and shell commands. Tree-sitter folds replace
Neovim's default indentation-based fold setup while preserving an explicitly configured fold
method.

Neovim searches for native parsers at `parser/logrotate.so` and `parser/logrotate_state.so` or,
when built with Wasmtime support, their `.wasm` equivalents on `runtimepath`. Queries belong under
`queries/logrotate/` and `queries/logrotate_state/`.

## Helix

The Helix configuration pins one released commit for the `logrotate` and `logrotate_state`
grammars. Its `languages.toml` entries handle the automatic file names above with Helix's current
glob support. Update the pin and queries together after grammar, query, indentation, and workspace
tests pass.

Helix uses `{ glob = "logrotate.d/*", literal-separator = true }` for the directory rule. The
path-aware option recognizes direct children without also matching nested descendants.

Helix does not support first-line file type detection. Open an extensionless file with a complete
first-line stanza, then run `:set-language logrotate`; `:lang logrotate` is the short form. This is
the editor's documented fallback for content that cannot be identified by its file name.

Helix-specific queries provide path and directive highlighting, Bash injection in all five script
blocks, rotation-block indentation and text objects, comment text objects, and a section tag named
from the stanza's path list. Bash injection requires Helix's Bash grammar.

## Zed

A Zed language extension registers both grammars in `extension.toml` using the repository URL and a
full commit. Language metadata belongs in `languages/logrotate/config.toml` and
`languages/logrotate-state/config.toml`; query files live with their corresponding language.

Zed’s extension format owns suffix matching, first-line detection, brackets, comments, indentation,
outline items, and other editor behavior. The separate extension can reuse the portable highlight,
injection, and fold queries, then add Zed-specific queries where they improve the editing
experience.

## Other hosts

Any Tree-sitter host can use the C sources, native packages, or standalone WASM parsers. The minimum
contract is ABI 15 support and the generated `tree_sitter_logrotate` and
`tree_sitter_logrotate_state` symbols. A host that supports standard query captures can also reuse
the repository’s portable queries.

When adding a new host, test file detection, malformed input, raw scripts, Bash injection, and query
captures against the exact grammar revision being shipped.
