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
| Helix | Grammar and queries are ready; built-in integration is not yet available |
| Zed | Grammar is ready for the separate extension; published support is not yet claimed |

This page describes the integration contract. It does not imply that a stock editor already ships
Logrotate support.

## Shared integration files

Pin one repository commit and use the generated parser at that revision. Keep
`queries/highlights.scm`, `queries/injections.scm`, and `queries/folds.scm` on the same commit so
their node names stay aligned.

The language name is `logrotate`, its scope is `source.logrotate`, and its generated symbol is
`tree_sitter_logrotate`. Script injection expects an available Bash parser.

Editor integrations should recognize `logrotate.conf`, files directly below a `logrotate.d`
directory, `*.logrotate`, and `*.logrotate.conf`. Hosts with content detection may also recognize
an otherwise unclassified file when its first physical line is a complete log-path stanza. The
line may contain one or more absolute or `~/` paths, including quoted or escaped paths, followed by
`{`, optional whitespace, and an optional trailing comment. Detectors should examine no more than
8,192 characters. Generic configuration text, incomplete stanzas, shell functions, shebangs, and
logrotate state files must not select this grammar.

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

The Phase 3 Helix integration pins grammar release 0.1.3 at commit
`6f0297864e944728fd5922ec6f15d986df1a0719`. Its `languages.toml` entry handles the automatic file
names above with Helix's current glob support. The pin is updated only after the replacement
revision passes Helix's grammar, query, indentation, and workspace tests.

Helix uses `{ glob = "logrotate.d/*", literal-separator = true }` for the directory rule. The
path-aware option recognizes direct children without also matching nested descendants.

Helix does not support first-line file type detection. Open an extensionless file with a complete
first-line stanza, then run `:set-language logrotate`; `:lang logrotate` is the short form. This is
the editor's documented fallback for content that cannot be identified by its file name.

Helix-specific queries provide path and directive highlighting, Bash injection in all five script
blocks, rotation-block indentation and text objects, comment text objects, and a section tag named
from the stanza's path list. Bash injection requires Helix's Bash grammar.

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
