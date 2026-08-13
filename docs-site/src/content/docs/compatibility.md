---
title: Compatibility
description: Supported Tree-sitter ABI, runtime versions, platforms, and release guarantees.
---

The 0.1 release line uses Tree-sitter language ABI 15. Parser source is generated with Tree-sitter
CLI 0.26.12 and rebuilt in CI with 0.26.3, the declared minimum.

## Tested matrix

| Surface | Tested versions and platforms |
| --- | --- |
| Native parser | Linux x64 and arm64, macOS arm64, Windows x64 and arm64 |
| Tree-sitter CLI | 0.26.3 and 0.26.12 |
| Node.js | Node.js 24.19.0 with `tree-sitter` 0.25.1 |
| Python | CPython 3.10 through 3.14 |
| Rust | Rust 1.85.0 and 1.97.1 |
| Go | Go 1.23 and 1.26.5 |
| Java | Java 25 with JTreeSitter 0.26 |
| Swift | Swift 6.3.3 on macOS arm64 and Linux |
| Zig | Zig 0.16.0 on Linux, macOS, and Windows |
| WebAssembly | `web-tree-sitter` 0.26.12 in Node.js and Chromium |

Package installation and release consumer tests build from committed `src/parser.c` and
`src/scanner.c`. Consumers do not need `tree-sitter generate`.

## ABI compatibility

The language ABI is checked when a runtime loads the parser. A runtime that does not support ABI 15
will reject it before parsing. Runtime package versions differ by language, so use the version range
documented for the selected binding rather than assuming all packages share one number.

Changing the generated language ABI requires an explicit compatibility update and release note. A
release does not silently raise the minimum CLI or runtime requirements.

## Tree contract

Named nodes, fields, and portable query captures are compatibility surfaces. The exact named-node
vocabulary is committed in `src/node-types.json`.

Before 1.0, release notes identify node additions, removals, field changes, query capture changes,
and ABI changes. Breaking changes are avoided unless use by real consumers shows that the existing
shape is unsuitable.

## Syntax baseline

The reviewed syntax baseline is Logrotate revision
`3be1e9ccffe0c2245ed596183c74913d553f9f18`, including the Logrotate 3.22 syntax reviewed for the
first release.

Unknown directives intentionally remain valid syntax. This allows newer releases and vendor builds
to parse without forcing the grammar to pretend that every directive has known semantics.

## Release integrity

Each release aligns package versions across all binding manifests. GitHub release assets include
source archives, native packages, the WASM parser, checksums, CycloneDX SBOMs, signatures where the
registry requires them, and GitHub provenance attestations.

Use an immutable release tag or commit for editor integration. The [GitHub release
page](https://github.com/willibrandon/tree-sitter-logrotate/releases) is the source for checksums and
attested downloadable artifacts.
