# tree-sitter-logrotate

`tree-sitter-logrotate` parses [logrotate](https://github.com/logrotate/logrotate) configuration and
state files with Tree-sitter. The configuration grammar recognizes global directives, rotation
stanzas, path lists, comments, includes, quoted arguments, and all five raw script blocks. The state
grammar recognizes version 1 and version 2 headers, quoted paths, and timestamps. Script text is
preserved as `script_body` and is never executed.

The committed parser uses Tree-sitter language ABI 15. The reviewed syntax baseline is logrotate
revision `3be1e9ccffe0c2245ed596183c74913d553f9f18`, which includes the logrotate 3.22 syntax reviewed
for the first release.

The [user and integration documentation](https://willibrandon.github.io/tree-sitter-logrotate/)
covers package setup, syntax trees, portable queries, editor setup, and compatibility.

## Consumers

The repository publishes both generated parsers through C source, npm, PyPI, crates.io, Maven
Central, Go, Swift Package Manager, Zig, and standalone WASM artifacts. Configuration highlight,
shell-injection, and fold queries live in `queries/`; the state highlight query lives in
`src/state/queries/`.

The [editor setup guide](https://willibrandon.github.io/tree-sitter-logrotate/editors/) covers
Neovim, Helix, and Zed. Each setup pins both parsers and their queries to one grammar revision.

## Neovim

Neovim 0.12.0 or newer, the current `main` branch of nvim-treesitter, the Tree-sitter CLI, and a C
compiler are required. Native `vim.pack` users can add both packages in `init.lua`:

### Native vim.pack

```lua
vim.api.nvim_create_autocmd("PackChanged", {
  callback = function(event)
    local name, kind = event.data.spec.name, event.data.kind
    if name == "tree-sitter-logrotate" and (kind == "install" or kind == "update") then
      vim.cmd.source(vim.fs.joinpath(event.data.path, "build.lua"))
    end
  end,
})

vim.pack.add({
  {
    src = "https://github.com/nvim-treesitter/nvim-treesitter",
    version = "main",
  },
}, { load = true })

vim.pack.add({
  {
    src = "https://github.com/willibrandon/tree-sitter-logrotate",
    version = vim.version.range("0.2"),
  },
}, { load = true })
```

### LazyVim

Create `lua/plugins/logrotate.lua`:

```lua
return {
  {
    "willibrandon/tree-sitter-logrotate",
    version = "*",
    dependencies = { "nvim-treesitter/nvim-treesitter" },
  },
}
```

Both installations compile the configuration and state parsers plus the Bash parser used inside
script blocks. Run `:checkhealth tree-sitter-logrotate` after restarting Neovim.

### Usage

Open `logrotate.conf`, a direct child of `logrotate.d`, `*.logrotate`, `*.logrotate.conf`,
`logrotate.status`, or `logrotate/status`. The plugin also recognizes complete first-line stanzas,
state headers, and files reached through an `include` from an open configuration.

Configuration buffers provide Tree-sitter highlighting, Bash highlighting inside all five script
blocks, indentation, folding, `#` comments, `%` matching between script directives and `endscript`,
and directive completion. Use `CTRL-X CTRL-O` for built-in completion; LazyVim's Blink completion
uses the same source automatically.

Use `:LogrotateInstall`, `:LogrotateUpdate`, and `:LogrotateUninstall` to manage the two parsers.
Use `:checkhealth tree-sitter-logrotate` to verify the complete installation.

## Local development

The [development container](https://github.com/willibrandon/tree-sitter-logrotate/blob/main/.devcontainer/README.md)
is the reference environment. It pins every toolchain, does not forward host credentials, and
keeps platform-specific output in named volumes.

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
npm run test:neovim:install
```

Run `npm run generate` after changing `grammar.js`. Generated parser files are committed and must
pass `npm run check:generated`. `TREE_SITTER_BUILD_DIR` relocates native and WASM output; its default
is the ignored `build` directory.

More native setup details are in
[docs/native-development.md](https://github.com/willibrandon/tree-sitter-logrotate/blob/main/docs/native-development.md).

The documentation site has a separate locked dependency tree. Its local development and preview
commands are described in
[docs/documentation-site.md](https://github.com/willibrandon/tree-sitter-logrotate/blob/main/docs/documentation-site.md).

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
TSTree *config = ts_parser_parse_string(parser, NULL, source, strlen(source));

const char *state_source =
    "logrotate state -- version 2\n\"/var/log/app.log\" 2026-8-14-12:30:45\n";
ts_parser_set_language(parser, tree_sitter_logrotate_state());
TSTree *state = ts_parser_parse_string(
    parser, NULL, state_source, strlen(state_source));

ts_tree_delete(config);
ts_tree_delete(state);
ts_parser_delete(parser);
```

### Node.js

```js
import Parser from "tree-sitter";
import Logrotate, { stateLanguage } from "tree-sitter-logrotate";

const parser = new Parser();
parser.setLanguage(Logrotate);
const tree = parser.parse("/var/log/app.log {\n  rotate 7\n}\n");
console.log(tree.rootNode.toString());

parser.setLanguage(stateLanguage);
const stateTree = parser.parse(
  'logrotate state -- version 2\n"/var/log/app.log" 2026-8-14-12:30:45\n',
);
console.log(stateTree.rootNode.toString());
```

### Python

```python
from tree_sitter import Language, Parser
from tree_sitter_logrotate import language, state_language

parser = Parser(Language(language()))
tree = parser.parse(b"/var/log/app.log {\n  rotate 7\n}\n")
print(tree.root_node)

parser.language = Language(state_language())
state_tree = parser.parse(
    b'logrotate state -- version 2\n"/var/log/app.log" 2026-8-14-12:30:45\n'
)
print(state_tree.root_node)
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

parser
    .set_language(&tree_sitter_logrotate::STATE_LANGUAGE.into())
    .expect("load logrotate state grammar");
let state_tree = parser
    .parse(
        "logrotate state -- version 2\n\"/var/log/app.log\" 2026-8-14-12:30:45\n",
        None,
    )
    .expect("parse logrotate state");
println!("{}", state_tree.root_node());
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

if err := parser.SetLanguage(sitter.NewLanguage(logrotate.StateLanguage())); err != nil {
	panic(err)
}
stateTree := parser.Parse([]byte(
	"logrotate state -- version 2\n\"/var/log/app.log\" 2026-8-14-12:30:45\n",
), nil)
defer stateTree.Close()
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

var stateLanguage =
    new Language(Objects.requireNonNull(TreeSitterLogrotate.stateLanguage()));
try (var parser = new Parser(stateLanguage);
     var tree = parser.parse(
         "logrotate state -- version 2\n\"/var/log/app.log\" 2026-8-14-12:30:45\n"
     ).orElseThrow()) {
    System.out.println(tree.getRootNode().toSexp());
}
```

The Maven coordinates are
[`io.github.willibrandon:jtreesitter-logrotate`](https://central.sonatype.com/artifact/io.github.willibrandon/jtreesitter-logrotate).
Java applications also need JTreeSitter 0.26 and its compatible native Tree-sitter runtime. The
grammar artifact includes the platform grammar library; it does not replace the Tree-sitter runtime
used by JTreeSitter.

### Swift

```swift
let parser = Parser()
try parser.setLanguage(Language(language: tree_sitter_logrotate()))
let tree = parser.parse("/var/log/app.log {\n  rotate 7\n}\n")
print(tree?.rootNode as Any)

try parser.setLanguage(Language(language: tree_sitter_logrotate_state()))
let stateTree = parser.parse(
    "logrotate state -- version 2\n\"/var/log/app.log\" 2026-8-14-12:30:45\n"
)
print(stateTree?.rootNode as Any)
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

const state_language = Language.fromRaw(logrotate.stateLanguage());
defer state_language.destroy();
try parser.setLanguage(state_language);
const state_tree = parser.parseString(
    "logrotate state -- version 2\n\"/var/log/app.log\" 2026-8-14-12:30:45\n",
    null,
).?;
defer state_tree.destroy();
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

const stateLanguage = await Language.load("/tree-sitter-logrotate-state.wasm");
parser.setLanguage(stateLanguage);
const stateTree = parser.parse(
  'logrotate state -- version 2\n"/var/log/app.log" 2026-8-14-12:30:45\n',
);
console.log(stateTree.rootNode.toString());
```

### State files

The state parser ships in the same packages and release. Every example above loads it from the same
binding and parses a complete version 2 state record.

## File names

Editor integrations should recognize these configuration names automatically:

- `logrotate.conf`
- files directly below a `logrotate.d` directory
- `*.logrotate`
- `*.logrotate.conf`

Hosts with content detection may also recognize an otherwise unclassified file when its first
physical line is a complete log-path stanza. The line may contain one or more absolute or `~/`
paths, including quoted or escaped paths, followed by `{`, optional whitespace, and an optional
trailing comment. Detectors should examine no more than 8,192 characters. Generic configuration
text, incomplete stanzas, shell functions, shebangs, and logrotate state files must not select this
grammar.

Files resolved through an `include` directive from an open configuration root also use the
configuration language. Existing relative, absolute, and quoted files are included, along with
regular files directly enumerated from an included directory. Missing targets, nested directory
entries, and unexpanded wildcard targets do not create an association.

Editor integrations should recognize these state-file names automatically:

- `logrotate.status`
- `logrotate/status`

An otherwise unclassified file uses the state language when its first physical line is exactly
`logrotate state -- version 1` or `logrotate state -- version 2`. Detection examines no more than
8,192 characters. Unsupported versions, extra whitespace, generic `status` files, and
`logrotate/nested/status` are rejected.

The machine-readable cases are in
[`test/fixtures/file-recognition.json`](https://github.com/willibrandon/tree-sitter-logrotate/blob/main/test/fixtures/file-recognition.json).

## Syntax boundary

These are syntax grammars. They do not resolve includes or globs, inspect users and groups, apply
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
[docs/compatibility.md](https://github.com/willibrandon/tree-sitter-logrotate/blob/main/docs/compatibility.md)
and [docs/release.md](https://github.com/willibrandon/tree-sitter-logrotate/blob/main/docs/release.md).

## License

MIT
