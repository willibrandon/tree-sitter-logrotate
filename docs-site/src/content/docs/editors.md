---
title: Editors
description: Integrate tree-sitter-logrotate with Neovim, Helix, Zed, and other Tree-sitter hosts.
---

The grammar is designed for editor use, but the grammar release and an editor integration are
different deliverables. An editor has built-in support only after its integration is accepted,
pinned, and tested by that editor.

## Current status

| Editor | Status |
| --- | --- |
| Neovim | Grammar and queries are ready; built-in integration is not yet claimed |
| Helix | Grammar and queries are ready; upstream language entry is not yet claimed |
| Zed | Grammar is ready for the separate extension; published support is not yet claimed |

This page describes the integration contract. It does not imply that a stock editor already ships
Logrotate support.

## Shared integration files

Pin one repository commit and use the generated parser at that revision. Keep
`queries/highlights.scm`, `queries/injections.scm`, and `queries/folds.scm` on the same commit so
their node names stay aligned.

The language name is `logrotate`, its scope is `source.logrotate`, and its generated symbol is
`tree_sitter_logrotate`. Script injection expects an available Bash parser.

File detection should remain narrow. High-confidence names are `logrotate.conf`, files directly
below a `logrotate.d` directory, `*.logrotate`, and `*.logrotate.conf`. A file beginning with
`logrotate state -- version 1` or `logrotate state -- version 2` is a state file and must not select
this grammar.

## Neovim

Neovim searches for a native parser at `parser/logrotate.so` or, when built with Wasmtime support,
a WASM parser at `parser/logrotate.wasm` on `runtimepath`. Queries belong under
`queries/logrotate/`.

After the parser and filetype are available, Neovim’s built-in API can load and start it:

```lua
if vim.treesitter.language.add("logrotate") then
  vim.treesitter.start(0, "logrotate")
end
```

Filetype detection and parser installation belong to the Neovim runtime or a parser manager. They
are not performed by this grammar package.

## Helix

Helix integrations pin a grammar repository and revision in `languages.toml`, add a `logrotate`
language entry, and place editor queries under `runtime/queries/logrotate/`.

The portable highlight and injection queries are suitable starting points. Helix-specific
indentation, text objects, and file detection should be reviewed with the editor integration. The
Bash injection requires Helix’s Bash grammar to be present.

## Zed

A Zed language extension registers the grammar in `extension.toml` using the repository URL and a
full commit. Language metadata belongs in `languages/logrotate/config.toml`; query files live in
that same language directory.

Zed’s extension format owns suffix matching, first-line detection, brackets, comments, indentation,
outline items, and other editor behavior. The separate extension can reuse the portable highlight,
injection, and fold queries, then add Zed-specific queries where they improve the editing
experience.

## Other hosts

Any Tree-sitter host can use the C source, native packages, or standalone WASM parser. The minimum
contract is ABI 15 support and the generated `tree_sitter_logrotate` language symbol. A host that
supports standard query captures can also reuse the repository’s portable queries.

When adding a new host, test file detection, malformed input, raw scripts, Bash injection, and query
captures against the exact grammar revision being shipped.
