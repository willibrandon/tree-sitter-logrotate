---
title: Bindings
description: Use the Logrotate grammar from C, Node.js, Python, Rust, Go, Java, Swift, Zig, or WebAssembly.
---

Every binding wraps the same generated C parser. Choose the package that matches the application’s
Tree-sitter runtime.

## Node.js

Install `tree-sitter-logrotate` with the 0.25 Node runtime:

```sh
npm install tree-sitter-logrotate tree-sitter@^0.25.1
```

```js
import Parser from "tree-sitter";
import Logrotate, { stateLanguage } from "tree-sitter-logrotate";

const parser = new Parser();
parser.setLanguage(Logrotate);
const tree = parser.parse("/var/log/app.log {\n  rotate 7\n}\n");

parser.setLanguage(stateLanguage);
const stateTree = parser.parse(
  'logrotate state -- version 2\n"/var/log/app.log" 2026-8-14-12:30:45\n',
);
```

The default export is the language object. It also contains `nodeTypeInfo` and packaged query
strings provided by the Tree-sitter binding generator.

## Python

Use the `core` extra to install the matching runtime:

```sh
python -m pip install "tree-sitter-logrotate[core]"
```

```python
from tree_sitter import Language, Parser
from tree_sitter_logrotate import language, state_language

parser = Parser(Language(language()))
tree = parser.parse(b"/var/log/app.log {\n  rotate 7\n}\n")

parser.language = Language(state_language())
state_tree = parser.parse(
    b'logrotate state -- version 2\n"/var/log/app.log" 2026-8-14-12:30:45\n'
)
```

The grammar wheels use Python’s stable ABI where supported. Python 3.10 through 3.14 is covered by
the release matrix.

## Rust

```sh
cargo add tree-sitter-logrotate tree-sitter
```

```rust
let mut parser = tree_sitter::Parser::new();
parser
    .set_language(&tree_sitter_logrotate::LANGUAGE.into())
    .expect("load logrotate grammar");

let tree = parser
    .parse("/var/log/app.log {\n  rotate 7\n}\n", None)
    .expect("parse input");

parser
    .set_language(&tree_sitter_logrotate::STATE_LANGUAGE.into())
    .expect("load logrotate state grammar");
let state_tree = parser
    .parse(
        "logrotate state -- version 2\n\"/var/log/app.log\" 2026-8-14-12:30:45\n",
        None,
    )
    .expect("parse logrotate state");
```

`LANGUAGE` is a `tree_sitter_language::LanguageFn`. The crate also publishes `NODE_TYPES` and
query constants selected by its build configuration.

## Go

```sh
go get github.com/willibrandon/tree-sitter-logrotate/bindings/go
go get github.com/tree-sitter/go-tree-sitter
```

```go
package main

import (
    logrotate "github.com/willibrandon/tree-sitter-logrotate/bindings/go"
    sitter "github.com/tree-sitter/go-tree-sitter"
)

func main() {
    language := sitter.NewLanguage(logrotate.Language())
    parser := sitter.NewParser()
    defer parser.Close()

    if err := parser.SetLanguage(language); err != nil {
        panic(err)
    }

    tree := parser.Parse([]byte("/var/log/app.log {\n  rotate 7\n}\n"), nil)
    defer tree.Close()

    if err := parser.SetLanguage(sitter.NewLanguage(logrotate.StateLanguage())); err != nil {
        panic(err)
    }
    stateTree := parser.Parse([]byte(
        "logrotate state -- version 2\n\"/var/log/app.log\" 2026-8-14-12:30:45\n",
    ), nil)
    defer stateTree.Close()
}
```

The Go module is the repository root. Import the grammar from its `bindings/go` package.

## Java

The Java binding requires Java 25 and JTreeSitter 0.26:

```xml
<dependency>
  <groupId>io.github.willibrandon</groupId>
  <artifactId>jtreesitter-logrotate</artifactId>
  <version>0.2.0</version>
</dependency>
<dependency>
  <groupId>io.github.tree-sitter</groupId>
  <artifactId>jtreesitter</artifactId>
  <version>0.26.1</version>
</dependency>
```

```java
import io.github.treesitter.jtreesitter.Language;
import io.github.treesitter.jtreesitter.Parser;
import io.github.treesitter.jtreesitter.logrotate.TreeSitterLogrotate;
import java.util.Objects;

var language =
    new Language(Objects.requireNonNull(TreeSitterLogrotate.language()));

try (var parser = new Parser(language);
     var tree = parser.parse("/var/log/app.log {\n  rotate 7\n}\n").orElseThrow()) {
    System.out.println(tree.getRootNode().toSexp());
}

var stateLanguage =
    new Language(Objects.requireNonNull(TreeSitterLogrotate.stateLanguage()));
try (var parser = new Parser(stateLanguage);
     var tree = parser.parse(
         "logrotate state -- version 2\n\"/var/log/app.log\" 2026-8-14-12:30:45\n"
     ).orElseThrow()) {
    System.out.println(tree.getRootNode().toSexp());
}
```

The grammar artifact carries its platform grammar library. The application still needs the native
Tree-sitter runtime compatible with JTreeSitter.

## Swift

Add the tagged package and the Swift Tree-sitter runtime:

```swift
dependencies: [
    .package(
        url: "https://github.com/willibrandon/tree-sitter-logrotate",
        from: "0.2.0"
    ),
    .package(
        url: "https://github.com/tree-sitter/swift-tree-sitter",
        from: "0.25.0"
    ),
]
```

```swift
import SwiftTreeSitter
import TreeSitterLogrotate

let parser = Parser()
try parser.setLanguage(Language(language: tree_sitter_logrotate()))
let tree = parser.parse("/var/log/app.log {\n  rotate 7\n}\n")

try parser.setLanguage(Language(language: tree_sitter_logrotate_state()))
let stateTree = parser.parse(
    "logrotate state -- version 2\n\"/var/log/app.log\" 2026-8-14-12:30:45\n"
)
```

The tagged repository is the Swift Package Manager distribution.

## Zig

The repository exports a `tree-sitter-logrotate` module from `build.zig`. Pin a release tag or
commit in the consuming package, then import the module:

```zig
const logrotate = @import("tree-sitter-logrotate");
const ts = @import("tree-sitter");

const parser = ts.Parser.create();
defer parser.destroy();
const language: *const ts.Language = ts.Language.fromRaw(logrotate.language());
defer language.destroy();
try parser.setLanguage(language);
const tree = parser.parseString("/var/log/app.log {\n  rotate 7\n}\n", null).?;
defer tree.destroy();

const state_language: *const ts.Language = ts.Language.fromRaw(logrotate.stateLanguage());
defer state_language.destroy();
try parser.setLanguage(state_language);
const state_tree = parser.parseString(
    "logrotate state -- version 2\n\"/var/log/app.log\" 2026-8-14-12:30:45\n",
    null,
).?;
defer state_tree.destroy();
```

The bundled build compiles `src/parser.c` and `src/scanner.c`, installs `node-types.json`, and
copies the portable queries. The tested Zig version is listed in [Compatibility](../compatibility/).

## C

Include the public header and link the generated parser:

```c
#include <string.h>
#include <tree_sitter/api.h>
#include <tree_sitter/tree-sitter-logrotate.h>

const char *source = "/var/log/app.log {\n  rotate 7\n}\n";
TSParser *parser = ts_parser_new();
ts_parser_set_language(parser, tree_sitter_logrotate());
TSTree *tree = ts_parser_parse_string(parser, NULL, source, strlen(source));

const char *state_source =
    "logrotate state -- version 2\n\"/var/log/app.log\" 2026-8-14-12:30:45\n";
ts_parser_set_language(parser, tree_sitter_logrotate_state());
TSTree *state = ts_parser_parse_string(
    parser, NULL, state_source, strlen(state_source));

ts_tree_delete(tree);
ts_tree_delete(state);
ts_parser_delete(parser);
```

Release archives contain the committed generated sources. Building a consumer does not require the
Tree-sitter CLI.

## WebAssembly

The npm package and GitHub release include both WASM parsers:

```js
import { Language, Parser } from "web-tree-sitter";

await Parser.init({ locateFile: () => "/web-tree-sitter.wasm" });
const parser = new Parser();
parser.setLanguage(await Language.load("/tree-sitter-logrotate.wasm"));
const tree = parser.parse("/var/log/app.log {\n  rotate 7\n}\n");

parser.setLanguage(await Language.load("/tree-sitter-logrotate-state.wasm"));
const stateTree = parser.parse(
  'logrotate state -- version 2\n"/var/log/app.log" 2026-8-14-12:30:45\n',
);
```

Browser and Node WASM tests run against the same committed parsers before release.
