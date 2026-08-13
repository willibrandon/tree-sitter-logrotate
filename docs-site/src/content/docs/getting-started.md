---
title: Getting started
description: Install tree-sitter-logrotate and parse a configuration.
---

A parser needs the Logrotate grammar and a Tree-sitter runtime. The two objects are separate so an
application can load several grammars into one runtime.

## Node.js

Install the grammar with the compatible Node runtime:

```sh
npm install tree-sitter-logrotate tree-sitter@^0.25.1
```

Create a parser, set its language, and parse text:

```js
import Parser from "tree-sitter";
import Logrotate from "tree-sitter-logrotate";

const parser = new Parser();
parser.setLanguage(Logrotate);

const source = `/var/log/application.log {
  daily
  rotate 7
}`;

const tree = parser.parse(source);
console.log(tree.rootNode.toString());
console.log(tree.rootNode.hasError);
```

`hasError` is `false` when the complete input matches the grammar. The parser still returns a tree
for incomplete input, which allows editors to keep working while a file is being changed.

## Python

The `core` extra installs a compatible Python Tree-sitter runtime with the grammar:

```sh
python -m pip install "tree-sitter-logrotate[core]"
```

```python
from tree_sitter import Language, Parser
from tree_sitter_logrotate import language

parser = Parser(Language(language()))
source = b"/var/log/application.log {\n  daily\n  rotate 7\n}\n"
tree = parser.parse(source)

print(tree.root_node)
print(tree.root_node.has_error)
```

The Python binding exposes a capsule through `language()`. Wrap that capsule in
`tree_sitter.Language` before passing it to `Parser`.

## WebAssembly

Install `web-tree-sitter` and `tree-sitter-logrotate`, then serve both WASM files with the
application:

```sh
npm install web-tree-sitter tree-sitter-logrotate
```

```js
import { Language, Parser } from "web-tree-sitter";

await Parser.init({
  locateFile: () => "/web-tree-sitter.wasm",
});

const logrotate = await Language.load("/tree-sitter-logrotate.wasm");
const parser = new Parser();
parser.setLanguage(logrotate);

const tree = parser.parse("/var/log/application.log {\n  daily\n}\n");
console.log(tree.rootNode.toString());
```

Copy `web-tree-sitter.wasm` from the `web-tree-sitter` package and
`tree-sitter-logrotate.wasm` from the grammar package into the application’s public assets. The
browser build and Node build use the same public syntax tree.

## Read the result

The example produces a `source_file` containing one `rotation_block`. The block has a `paths`
field and repeated `body` fields for its directives. See [Syntax tree](../syntax-tree/) for the named
nodes, fields, and recovery behavior that consumers can rely on.
