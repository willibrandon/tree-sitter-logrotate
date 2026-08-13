---
title: Queries
description: Use the portable highlight, injection, and fold queries.
---

The `queries/` directory contains editor-neutral Tree-sitter queries. They use common capture names
and avoid predicates tied to a particular host.

## Highlighting

`queries/highlights.scm` captures comments, paths, quoted values, escapes, numbers, braces,
operators, and directive names. Known Logrotate directives use `@keyword`; an unknown directive
uses `@property`.

```scheme
((directive
   name: (directive_name) @keyword)
 (#match? @keyword "^(daily|weekly|monthly|rotate|compress)$"))

[
  (path_pattern)
  (quoted_path)
] @string.special.path
```

The repository’s full query contains the complete reviewed directive set. Copy the file unchanged
when an editor supports the standard captures, then add host-specific refinements in the editor
integration.

## Shell injection

`queries/injections.scm` assigns Bash to `script_body`:

```scheme
((script_body) @injection.content
 (#set! injection.language "bash"))
```

Only the body is injected. The opening directive and `endscript` remain Logrotate syntax. The parser
does not execute the captured text.

## Folding

`queries/folds.scm` marks complete rotation blocks and script blocks:

```scheme
[
  (rotation_block)
  (script_block)
] @fold
```

An editor may translate `@fold` to a host-specific capture name or reuse it directly.

## Package access

The npm package exports the query files through `tree-sitter-logrotate/queries/*`. Node and Python
bindings also expose highlight and injection query strings when their binding generator supports
those constants. Rust includes query constants behind the corresponding build configuration.

Editors commonly copy queries into their runtime layout. Pin the grammar commit and query files
together because query node names form part of the compatibility contract.

## Validate changes

Run the parser and highlight checks after changing a node or query:

```sh
npm run test:parser
npm run test:highlight
npm run test:node
```

The highlight test rejects invalid captures and patterns. Node tests confirm the expected query
matches and syntax tree.
