---
title: Troubleshooting
description: Diagnose parser loading, syntax trees, queries, and WebAssembly setup.
---

Most failures occur while loading a runtime or native library. Syntax errors appear later, after a
parser has accepted the language.

## The language will not load

Confirm that the runtime supports language ABI 15 and that its package version matches the selected
binding. A language-version or ABI error means the parser and runtime are incompatible, not that the
Logrotate input is invalid.

For Node.js, install `tree-sitter` 0.25.x beside the grammar. For Python, the simplest supported
setup is `tree-sitter-logrotate[core]`. Java applications need JTreeSitter and its compatible native
Tree-sitter runtime in addition to the grammar artifact.

## A native library is missing

Check the current operating system and CPU architecture against [Compatibility](../compatibility/).
Package managers may skip optional native artifacts when an install was created for another
platform. Reinstall dependencies on the machine that will execute the parser rather than copying
`node_modules`, a virtual environment, or a build directory across platforms.

The source distribution can build the parser locally when a prebuilt artifact is unavailable. It
needs a C11 compiler and the normal build tools for that binding.

## WebAssembly cannot start

`web-tree-sitter` needs its runtime WASM file before it can load the Logrotate language WASM file.
Serve both files as static assets and make `locateFile` return the actual runtime URL.

If `Language.load()` fails, inspect the network response. A 404 page returned with status 200 is
still invalid WASM. Also confirm that the server sends the grammar from
`tree-sitter-logrotate.wasm`, not a native library or source archive.

## Valid text contains an error node

Inspect the smallest subtree containing `ERROR` or a missing node. Common causes are a rotation
path without `{`, a missing `}`, or a raw script block without `endscript`.

An unfinished script is represented by `unterminated_script_block` so an editor can preserve its
body during recovery. The parser is incremental and should not discard the rest of a file because
one stanza is incomplete.

## Includes are not resolved

This grammar does not read the filesystem. An include remains an `include_directive` whether its
path exists, contains a glob, or points to a directory.

Applications that need a combined configuration must resolve includes separately, parse each
resource, and decide how inherited settings should flow. Those decisions depend on host state and
Logrotate semantics.

## Script bodies have no shell highlighting

The injection query labels `script_body` as Bash. The host must support injections and have a Bash
parser and highlight query available. Confirm that the host copied `queries/injections.scm` from
the same grammar revision.

## An unknown directive has no syntax error

That behavior is intentional. Unknown and vendor-specific names are ordinary `directive` nodes.
Use a version-aware language server or an installed Logrotate validation pass when the application
needs directive diagnostics.

## Report a reproducible problem

Open a [GitHub issue](https://github.com/willibrandon/tree-sitter-logrotate/issues) with the package
and runtime versions, platform, a minimal sanitized configuration, and the resulting syntax tree or
loader error. Include whether the failure occurs with the native parser, WASM parser, or both.
