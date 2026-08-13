---
title: tree-sitter-logrotate
description: Parse Logrotate configuration files with Tree-sitter.
---

`tree-sitter-logrotate` turns Logrotate configuration text into a stable concrete syntax tree. It
recognizes global directives, rotation stanzas, path lists, includes, quoted arguments, comments,
and every raw script block supported by Logrotate.

```logrotate
/var/log/application.log {
  daily
  rotate 7
  compress

  postrotate
    systemctl reload application
  endscript
}
```

## What the grammar provides

The repository publishes one generated parser through C, Node.js, Python, Rust, Go, Java, Swift,
Zig, and WebAssembly. Each package uses the same ABI 15 parser and the same public node names.

Portable Tree-sitter queries provide highlighting, Bash injection for script bodies, and folding.
Editor integrations can add indentation, text objects, file detection, and other host-specific
behavior without changing the grammar.

## What parsing means

Parsing is local and deterministic. The grammar accepts supplied text and returns a syntax tree. It
does not read included files, expand globs, inspect users or groups, start Logrotate, or execute
script bodies.

Unknown and vendor-specific directives remain valid `directive` nodes. This keeps the parser useful
with newer Logrotate releases and downstream builds while semantic tools handle version-specific
validation.

## Choose a package

| Environment | Package |
| --- | --- |
| Node.js | [tree-sitter-logrotate on npm](https://www.npmjs.com/package/tree-sitter-logrotate) |
| Python | [tree-sitter-logrotate on PyPI](https://pypi.org/project/tree-sitter-logrotate/) |
| Rust | [tree-sitter-logrotate on crates.io](https://crates.io/crates/tree-sitter-logrotate) |
| Java | [jtreesitter-logrotate on Maven Central](https://central.sonatype.com/artifact/io.github.willibrandon/jtreesitter-logrotate) |
| Go | [Go package documentation](https://pkg.go.dev/github.com/willibrandon/tree-sitter-logrotate/bindings/go) |
| Swift, Zig, C, and WASM | [Tagged source and release assets](https://github.com/willibrandon/tree-sitter-logrotate/releases) |

Start with [Getting started](getting-started/) for a complete parse, or open [Bindings](bindings/) to
find the package for a particular runtime.

## Editor status

The grammar and portable queries are ready for editor integration. Helix, Neovim, and Zed support
will be reported as available only after the corresponding integration is accepted and tested.
[Editors](editors/) describes the current integration surfaces without promising support that has
not landed.
