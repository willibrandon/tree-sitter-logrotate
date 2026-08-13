# tree-sitter-logrotate

`tree-sitter-logrotate` parses logrotate configuration files with Tree-sitter. It recognizes global
directives, rotation stanzas, path lists, comments, includes, quoted arguments, and all five raw
script blocks. Unknown and vendor-specific directives remain valid syntax. Script text is preserved
as `script_body` and is never executed.

The committed parser uses Tree-sitter language ABI 15. The reviewed syntax baseline is logrotate
revision `3be1e9ccffe0c2245ed596183c74913d553f9f18`, which includes the logrotate 3.22 syntax reviewed
for the first release.

The [user and integration documentation](https://willibrandon.github.io/tree-sitter-logrotate/)
covers package setup, syntax trees, portable queries, editor integration, and compatibility.

## Consumers

The repository publishes the same generated parser through C source, npm, PyPI, crates.io, Maven
Central, Go, Swift Package Manager, Zig, and a standalone WASM artifact. The portable highlight,
shell-injection, and fold queries live in `queries/`.

Helix, Neovim, and Zed integrations are separate delivery phases. None is claimed as an upstream
editor integration until its editor repository accepts and tests the pinned grammar revision. See
[the design](docs/tree-sitter-logrotate-design.md) for that work.

## Local development

The [development container](.devcontainer/README.md) is the reference environment. It pins every
toolchain, does not forward host credentials, and keeps platform-specific output in named volumes.

For a native checkout, install the versions in `toolchains.json`, then run:

```sh
nvm use
npm install --global npm@12.0.2
npm ci
npm run verify
npm run test:bindings
npm run test:wasm
npm run test:fixtures
npm run test:sanitizers
npm run test:performance
```

Run `npm run generate` after changing `grammar.js`. Generated parser files are committed and must
pass `npm run check:generated`. `TREE_SITTER_BUILD_DIR` relocates native and WASM output; its default
is the ignored `build` directory.

More native setup details are in [docs/native-development.md](docs/native-development.md).

The documentation site has a separate locked dependency tree. Its local development and preview
commands are described in [docs/documentation-site.md](docs/documentation-site.md).

## Binding examples

Every example parses supplied text. None reads a configuration from disk or starts logrotate.

### C

```c
#include <string.h>
#include <tree_sitter/api.h>
#include <tree_sitter/tree-sitter-logrotate.h>

const char *source = "/var/log/app.log {\n  rotate 7\n}\n";
TSParser *parser = ts_parser_new();
ts_parser_set_language(parser, tree_sitter_logrotate());
TSTree *tree = ts_parser_parse_string(parser, NULL, source, strlen(source));
TSNode root = ts_tree_root_node(tree);

ts_tree_delete(tree);
ts_parser_delete(parser);
```

### Node.js

```js
import Parser from "tree-sitter";
import Logrotate from "tree-sitter-logrotate";

const parser = new Parser();
parser.setLanguage(Logrotate);
const tree = parser.parse("/var/log/app.log {\n  rotate 7\n}\n");
console.log(tree.rootNode.toString());
```

### Python

```python
from tree_sitter import Language, Parser
from tree_sitter_logrotate import language

parser = Parser(Language(language()))
tree = parser.parse(b"/var/log/app.log {\n  rotate 7\n}\n")
print(tree.root_node)
```

### Rust

```rust
let mut parser = tree_sitter::Parser::new();
parser
    .set_language(&tree_sitter_logrotate::LANGUAGE.into())
    .expect("load logrotate grammar");
let tree = parser
    .parse("/var/log/app.log {\n  rotate 7\n}\n", None)
    .expect("parse logrotate configuration");
println!("{}", tree.root_node());
```

### Go

```go
language := sitter.NewLanguage(logrotate.Language())
parser := sitter.NewParser()
defer parser.Close()
if err := parser.SetLanguage(language); err != nil {
	panic(err)
}
tree := parser.Parse([]byte("/var/log/app.log {\n  rotate 7\n}\n"), nil)
defer tree.Close()
```

The imports are `github.com/tree-sitter/go-tree-sitter` as `sitter` and
`github.com/willibrandon/tree-sitter-logrotate/bindings/go` as `logrotate`.

### Java

```java
var language = new Language(Objects.requireNonNull(TreeSitterLogrotate.language()));
try (var parser = new Parser(language);
     var tree = parser.parse("/var/log/app.log {\n  rotate 7\n}\n").orElseThrow()) {
    System.out.println(tree.getRootNode().toSexp());
}
```

The Maven coordinates are `io.github.willibrandon:jtreesitter-logrotate`. Java applications also
need JTreeSitter 0.26 and its compatible native Tree-sitter runtime. The grammar artifact includes
the platform grammar library; it does not replace the Tree-sitter runtime used by JTreeSitter.

### Swift

```swift
let parser = Parser()
try parser.setLanguage(Language(language: tree_sitter_logrotate()))
let tree = parser.parse("/var/log/app.log {\n  rotate 7\n}\n")
print(tree?.rootNode as Any)
```

### Zig

```zig
const parser = Parser.create();
defer parser.destroy();
const language = Language.fromRaw(logrotate.language());
defer language.destroy();
try parser.setLanguage(language);
const tree = parser.parseString("/var/log/app.log {\n  rotate 7\n}\n", null).?;
defer tree.destroy();
```

### Browser WASM

```js
import { Language, Parser } from "web-tree-sitter";

await Parser.init({ locateFile: () => "/web-tree-sitter.wasm" });
const language = await Language.load("/tree-sitter-logrotate.wasm");
const parser = new Parser();
parser.setLanguage(language);
const tree = parser.parse("/var/log/app.log {\n  rotate 7\n}\n");
console.log(tree.rootNode.toString());
```

## File names

Editor integrations should recognize only high-confidence configuration names:

- `logrotate.conf`
- files directly below a `logrotate.d` directory
- `*.logrotate`
- `*.logrotate.conf`

Content detection may recognize an extensionless file whose first meaningful line is a complete
absolute or tilde-prefixed path stanza ending in `{`. The `logrotate state -- version 1` and
`logrotate state -- version 2` headers are state files and must not select this grammar.

## Syntax boundary

This is a syntax grammar. It does not resolve includes or globs, inspect users and groups, apply
inherited settings, check filesystem permissions, validate directives against an installed
logrotate version, or execute scripts. Those operations require host state and belong in a language
server or another semantic tool.

An include path remains an `include_directive` node even when the referenced file does not exist.
Unknown directives remain ordinary `directive` nodes so newer logrotate releases and vendor builds
do not become syntax errors.

## Compatibility and releases

Tree-sitter CLI 0.26.3 is the tested minimum and 0.26.12 is the pinned generation version. The Node
binding uses `tree-sitter` 0.25.1 or later in the 0.25 line; the standalone WASM artifact uses
`web-tree-sitter` 0.26. Releases use Semantic Versioning and treat named nodes, fields, and query
captures as compatibility surfaces even before 1.0.

Each release aligns every package version, builds from committed generated source, and publishes a
source archive, WASM parser, checksums, CycloneDX SBOMs, and GitHub provenance attestations. See
[docs/compatibility.md](docs/compatibility.md) and [docs/release.md](docs/release.md).

## License

MIT
