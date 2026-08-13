---
title: Syntax tree
description: Understand the public nodes, fields, and recovery behavior.
---

The grammar preserves the structure needed by editors and code tools without deciding whether a
directive is valid for a particular installed Logrotate version.

## A complete tree

This configuration contains ordinary directives and a raw script block:

```logrotate
/var/log/application.log {
  daily
  rotate 7
  postrotate
    systemctl reload application
  endscript
}
```

Its named tree is:

```text
(source_file
  (rotation_block
    paths: (path_list
      (path_pattern))
    body: (directive
      name: (directive_name))
    body: (directive
      name: (directive_name)
      arguments: (directive_arguments
        (argument
          (integer))))
    body: (script_block
      directive: (script_directive)
      script: (script_body)
      terminator: (endscript))))
```

Fields give consumers stable navigation points. A `rotation_block` has `paths` and `body`; a
`directive` has `name`, optional `operator`, and optional `arguments`; an `include_directive`
has a `path`.

## Public named nodes

| Node | Meaning |
| --- | --- |
| `source_file` | Complete configuration input |
| `rotation_block` | One or more paths followed by a directive body |
| `include_directive` | An include keyword and path |
| `directive` | A known, unknown, or vendor-specific directive |
| `directive_arguments` and `argument` | Values following a directive name |
| `path_list`, `path_pattern`, and `quoted_path` | Rotation targets and include paths |
| `script_block`, `script_directive`, and `script_body` | A raw shell script section |
| `unterminated_script_block` | Recovery node for a missing `endscript` |
| `integer` and `size` | Numeric values recognized without semantic interpretation |
| `comment` and `escape_sequence` | Preserved source details |

The generated [node-types.json](https://github.com/willibrandon/tree-sitter-logrotate/blob/main/src/node-types.json)
is the exact machine-readable contract.

## Error recovery

Tree-sitter returns a tree even when input is incomplete. A missing closing brace or malformed path
can introduce an `ERROR` or missing node. A script directive without `endscript` produces
`unterminated_script_block` so the remaining script text stays available to an editor.

Consumers should inspect `has_error` or the equivalent binding property when correctness matters.
Interactive editors can still use intact subtrees while the user repairs the file.

## Intentional acceptance

An unknown name such as `vendor_rotate_policy` parses as a normal `directive`. The grammar checks
the shape of the language, not the directive registry of one Logrotate release. A language server
or installed Logrotate process can provide version-aware diagnostics later.

An include path also remains valid syntax when its target does not exist. Resolution depends on the
host filesystem and is outside the parser.
