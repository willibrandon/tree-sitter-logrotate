# Tree-sitter Logrotate Grammar Design

Status: Accepted
Date: 2026-08-12  
Target first release: 0.1.0

## Summary

Create canonical Tree-sitter grammars for logrotate configuration and state files and publish them
from the `tree-sitter-logrotate` repository.

Keep the grammars independent of any editor. Neovim and Helix use released parser artifacts,
matching queries, and host-native configuration. The existing `zed-logrotate` repository packages
the Zed extension.

The intended repository layout is:

| Repository              | Ownership       | Purpose                                                                            |
| ----------------------- | --------------- | ---------------------------------------------------------------------------------- |
| `tree-sitter-logrotate` | Maintained here | Grammars, generated parsers, bindings, portable queries, tests, WASM, and releases |
| `zed-logrotate`         | Maintained here | Zed language extension pinned to a released grammar revision                       |

Every integration consumes an immutable grammar revision and the query files tested with that
revision.

## Goals

The grammar will:

- parse logrotate configuration files incrementally and recover cleanly while a file is being
  edited;
- parse version 1 and version 2 logrotate state files with a separate syntax tree;
- preserve a stable, useful concrete syntax tree for queries and other tooling;
- support Neovim, Helix, Zed, and consumers of Tree-sitter C, WASM, and generated language
  bindings;
- inject shell syntax into `firstaction`, `lastaction`, `prerotate`, `postrotate`, and `preremove`
  bodies;
- accept future and locally patched directives without treating them as syntax errors;
- follow the upstream logrotate parser where syntax is ambiguous;
- ship generated source, reproducible builds, portable query examples, and signed or attested
  release artifacts;
- remain safe to parse untrusted configuration files.

The project will not:

- validate directive availability for a particular logrotate version;
- evaluate includes, globs, users, groups, paths, environment state, or filesystem permissions;
- execute logrotate or any script found in a configuration;
- replace the semantic parser or language server in the Visual Studio Code extension;
- parse the logrotate state file as though it were a configuration file;
- provide an LSP server from the grammar repository.

## Source of truth

The grammar is based on the behavior of the upstream logrotate parser, not only the manual page or
the Visual Studio Code implementation.

Initial development should pin and record the reviewed upstream logrotate commit. The current
reviewed baseline is `3be1e9ccffe0c2245ed596183c74913d553f9f18`. The most relevant upstream
implementation is `config.c`, including its path parsing, popt argument parsing, comment handling,
script loading, and `endscript` detection.

The existing Visual Studio Code project supplies a second body of evidence:

- `data/directives.yaml` describes known directives and their argument forms;
- `data/versions.yaml` records version boundaries;
- `packages/language-core` provides an independently implemented parser and lexer;
- `test/fixtures` provides valid, invalid, incomplete, and cross-file examples;
- upstream conformance tests classify differences between syntax, semantics, and host behavior.

These sources inform the grammar and its tests. They are not copied into the runtime parser and do
not make the Tree-sitter repository depend on the Visual Studio Code extension.

The design was checked against these local source revisions:

| Project                      | Revision                                   |
| ---------------------------- | ------------------------------------------ |
| Tree-sitter                  | `816a2a0c15b9b5c31cb859d8765166ea2b783d30` |
| logrotate                    | `3be1e9ccffe0c2245ed596183c74913d553f9f18` |
| Neovim                       | `e8a1addb5a3b72e2518c35ecf13effa5b23ee411` |
| Helix                        | `079a789e8cb08ead67f19e1971a1b7438b37354b` |
| Zed                          | `a8fafdd7ee36fb3fb98ebbfe5d3be983301d9e74` |
| Visual Studio Code Logrotate | `7d26dd26ecb17a8d515f3f7a594b0ceef271f800` |

These revisions record the evidence used for the initial design. They are not permanent dependency
pins. Each integration pins its own reviewed revisions and updates them through normal dependency
review.

## Compatibility baseline

Tree-sitter language ABI 15 is the primary target. As of this design:

- Tree-sitter 0.26 generates ABI 15 parsers by default and can generate ABI 14 when requested;
- current Neovim embeds a runtime that accepts ABI 15 and can load parsers directly through
  `vim.treesitter.language.add()`;
- the inspected Zed revision uses Tree-sitter 0.26.9;
- current Helix uses its Tree-house parsing runtime and current Tree-sitter grammars.

The repository will generate and commit ABI 15 source. Before the first release, the compatibility
matrix must test the current stable release and current development branch of each target editor.
ABI 14 will be added only if one of those supported stable editors cannot load ABI 15. If it is
needed, it must be generated from the same grammar in CI and published as a clearly named release
artifact. It must not become a hand-maintained parser fork.

The minimum supported Tree-sitter runtime and CLI versions will be declared in the README and
checked in CI. A release must not silently increase either minimum.

## Repository design

### Canonical grammar repository

The recommended name is `tree-sitter-logrotate`. It follows the naming convention used by
Tree-sitter grammars and gives package registries predictable names.

The initial tree should resemble:

```text
tree-sitter-logrotate/
├── .devcontainer/
│   ├── devcontainer.json
│   ├── Dockerfile
│   └── README.md
├── .github/
│   ├── dependabot.yml
│   └── workflows/
│       ├── ci.yml
│       ├── fuzz.yml
│       ├── release.yml
│       └── security.yml
├── bindings/
│   ├── c/
│   ├── go/
│   ├── java/
│   ├── node/
│   ├── python/
│   ├── rust/
│   ├── swift/
│   └── zig/
├── examples/
├── queries/
│   ├── highlights.scm
│   ├── injections.scm
│   └── folds.scm
├── scripts/
├── src/
│   ├── grammar.json
│   ├── node-types.json
│   ├── parser.c
│   ├── scanner.c
│   ├── state/
│   │   ├── grammar.js
│   │   ├── queries/
│   │   ├── src/
│   │   └── test/
│   └── tree_sitter/
│       ├── alloc.h
│       ├── array.h
│       └── parser.h
├── test/
│   ├── corpus/
│   ├── highlight/
│   ├── incremental/
│   └── regression/
├── CHANGELOG.md
├── CMakeLists.txt
├── CONTRIBUTING.md
├── Cargo.toml
├── LICENSE
├── Makefile
├── Package.swift
├── README.md
├── SECURITY.md
├── build.zig
├── go.mod
├── grammar.js
├── package-lock.json
├── package.json
├── pom.xml
├── pyproject.toml
└── tree-sitter.json
```

The repository began with the current `tree-sitter init` scaffold. Keeping the standard generated
bindings lowers integration work for other tools. All bindings expose the same generated languages
and do not contain independent parsers.

Package and grammar identities are fixed as follows:

| Surface             | Configuration           | State                              |
| ------------------- | ----------------------- | ---------------------------------- |
| Repository          | `tree-sitter-logrotate` | `tree-sitter-logrotate`            |
| Grammar name        | `logrotate`             | `logrotate_state`                  |
| Tree-sitter scope   | `source.logrotate`      | `source.logrotate.state`           |
| C symbol            | `tree_sitter_logrotate` | `tree_sitter_logrotate_state`      |
| npm package         | `tree-sitter-logrotate` | named export from the same package |
| Rust crate          | `tree-sitter-logrotate` | `STATE_LANGUAGE` in the same crate |
| Python distribution | `tree-sitter-logrotate` | `state_language()` in that package |
| Python import       | `tree_sitter_logrotate` | `tree_sitter_logrotate`            |

`tree-sitter.json` must use the published Tree-sitter schema and declare the grammar name, scope,
file types, version, license, repository links, and available bindings.

### Zed extension repository

The recommended name is `zed-logrotate`. Its Zed extension ID is `logrotate`, and its display name
is `Logrotate`.

The repository stays intentionally small:

```text
zed-logrotate/
├── languages/
│   ├── logrotate/
│   │   ├── brackets.scm
│   │   ├── config.toml
│   │   ├── highlights.scm
│   │   ├── indents.scm
│   │   ├── injections.scm
│   │   ├── outline.scm
│   │   └── textobjects.scm
│   └── logrotate-state/
│       ├── config.toml
│       └── highlights.scm
├── LICENSE
├── README.md
└── extension.toml
```

`extension.toml` points `[grammars.logrotate]` and `[grammars.logrotate_state]` at the canonical
repository and one exact released Git revision. It must not point at a branch. The extension needs
no Rust component unless a future feature requires a language server or another host API.

The Zed extension has its own semantic version. A grammar update changes the pinned revision,
updates queries if needed, runs the Zed smoke tests, and increments the extension version. Tagged
extension releases include the tested configuration and queries.

### Integration boundary

Neovim and Helix setups use their native parser, query, and language-configuration locations. Zed
uses the separately versioned extension. All three integrations pin released parser source and
matching queries.

The logrotate state format is a second grammar under `src/state`. It has its own nodes, query, C
symbol, native parser, and WASM parser. Both grammars use the repository version and ship in the
same language-binding packages and release. State syntax must never be added to the configuration
grammar.

## Grammar model

### Principles

The grammar is line-oriented. Newlines are syntax and must not be placed in `extras`. Horizontal
space may be skipped where the upstream parser permits it. Both LF and CRLF inputs must produce the
same tree shape.

The grammar should describe structure, not the current directive registry. A name that looks like a
directive must parse as a directive even when it is unknown to the current logrotate release. This
keeps syntax highlighting useful for newer releases, vendor patches, and incomplete configuration.

Only keywords that alter document structure receive dedicated grammar rules:

- `include` introduces a path argument but does not load it;
- `firstaction`, `lastaction`, `prerotate`, `postrotate`, and `preremove` open raw shell bodies;
- `endscript` closes a shell body;
- `{` and `}` open and close rotation blocks.

Known directives may receive query-level highlighting and tests. Their version and argument
validation remain outside the grammar.

### Proposed node types

The initial named node vocabulary is:

```text
source_file
comment
rotation_block
path_list
path_pattern
quoted_path
directive
directive_name
directive_arguments
argument
quoted_argument
escape_sequence
include_directive
script_block
script_directive
script_body
endscript
integer
size
duration
```

The final grammar may omit a lexical subtype when it cannot be recognized without semantic
ambiguity. It should not create a different node type for every directive. That would make each new
logrotate directive a syntax-tree compatibility change.

Useful fields are:

| Node                | Field        | Meaning                                            |
| ------------------- | ------------ | -------------------------------------------------- |
| `rotation_block`    | `paths`      | One or more log path patterns before `{`           |
| `rotation_block`    | `body`       | Directives and script blocks inside the stanza     |
| `directive`         | `name`       | Directive name                                     |
| `directive`         | `arguments`  | Raw structured argument list after the name or `=` |
| `include_directive` | `path`       | Included path or pattern                           |
| `script_block`      | `directive`  | Opening script directive                           |
| `script_block`      | `script`     | Uninterpreted shell source                         |
| `script_block`      | `terminator` | Closing `endscript` token                          |

Anonymous punctuation nodes remain visible where queries need them. Braces must stay in the tree
for matching and indentation. An optional `=` separator should be represented consistently.

### Document structure

A `source_file` contains comments, global directives, include directives, and rotation blocks.
Inside a rotation block, the parser accepts directives, comments, and script blocks until the
closing brace.

The rotation header supports one or more log path patterns before the opening brace. Paths may be
quoted and may contain escapes accepted by the upstream argument parser. Glob metacharacters are
text within the path node, not operators evaluated by the grammar.

The parser must recover from common editing states:

- a rotation path before its opening brace;
- an opening brace without a closing brace;
- a directive without arguments;
- an unmatched closing brace;
- an unterminated quote;
- a script opener without `endscript`;
- `endscript` typed before the opening directive;
- a partial directive name at end of file.

Recovery should keep the error local. A missing terminator must not cause every following rotation
block to become part of one opaque node when a safe boundary can be found.

### State grammar

The state grammar lives under `src/state` and uses the name `logrotate_state`. Its first line is
exactly `logrotate state -- version 1` or `logrotate state -- version 2`. Each record contains one
double-quoted path followed by a date or full timestamp. Escaped characters inside the quoted path
remain visible as `escape_sequence` nodes.

The public state tree contains `header`, `version`, `record`, `quoted_path`, `timestamp`, and the
individual timestamp fields. A malformed record becomes `invalid_record` so a later valid record
still parses. Corpus tests cover both supported versions, quoted spaces and escapes, date-only and
full timestamps, blank lines, malformed records, and rejection of unsupported header versions.

The state grammar has no external scanner, injection query, fold query, or indentation query. Its
portable highlight query captures the header, version, path, escape sequences, timestamp fields,
and malformed records.

### Comments

Comment recognition must match upstream context. A `#` that is the first non-whitespace character of
a configuration line is a comment. A `#` within a quoted argument is content. Inline `#` is not
assumed to begin a comment in every parser state.

The grammar and corpus must include path patterns and arguments containing literal `#` so a broad
comment token cannot silently discard valid input.

### Directive arguments

The upstream parser accepts whitespace-separated arguments with quoting and escaping and permits an
optional `=` after many directive names. The grammar should preserve those tokens without trying to
replicate every popt conversion rule.

Lexical nodes such as `integer`, `size`, and `duration` are allowed only when their recognition is
unambiguous and improves highlighting. Values such as user names, group names, date formats, mail
addresses, extensions, and shell paths remain ordinary arguments unless their containing directive
provides reliable structure.

The grammar must preserve the source bytes and ranges needed by formatters and syntax-aware tools.
It must never normalize quotes, escapes, spacing, or path separators.

### Raw script bodies

Script bodies require an external scanner. Ordinary Tree-sitter rules are a poor fit because the
body can contain arbitrary shell syntax, braces, comments, quotes, and logrotate-like words.

The scanner should be implemented in `src/scanner.c` and compiled as C99. It has one responsibility:
emit the raw `script_body` token up to a valid leading `endscript` terminator without consuming the
terminator.

The scanner must handle:

- all five script-opening directives;
- indentation before `endscript`;
- LF and CRLF line endings;
- end of file without a terminator;
- the word `endscript` inside shell quotes or later on a command line;
- shell lines that begin with a longer identifier such as `endscript_helper`;
- empty script bodies;
- incremental reparses starting inside or adjacent to the body.

Keep the scanner stateless if the final grammar permits it. If serialization is required, the state
must be minimal, version-independent, and bounded. Avoid heap allocation. If allocation becomes
necessary, use Tree-sitter's allocator API. The scanner must honor the external-token sentinel used
to disable scanning during error recovery and must never emit an unbounded sequence of zero-width
tokens.

The raw node is injected into the host's Bash grammar. The actual shell used by logrotate is
normally `/bin/sh`, while the target hosts expose a mature `bash` injection. Tests must keep
injected examples within syntax accepted by that grammar.

### Includes and inherited settings

An include is represented syntactically as `include_directive` plus its path. The Tree-sitter parser
does not resolve the path, enumerate directories, prevent cycles, enforce recursion depth, or apply
inherited global settings.

Those behaviors need filesystem access and semantic state and belong in a host application,
language server, or separate analysis library. Keeping them out of the grammar preserves
deterministic, sandboxed parsing in native and WASM hosts.

## Query design

### Canonical queries

The grammar repository ships a conservative portable query set:

- `highlights.scm` for common Tree-sitter highlight captures;
- `injections.scm` for shell script bodies;
- `folds.scm` for rotation and script blocks where the host supports the standard capture.

Canonical queries use nodes and predicates supported by the Tree-sitter query language itself.
Host-specific directives remain in the corresponding integration.

The initial highlight vocabulary should prefer common captures:

```text
@comment
@keyword
@number
@operator
@punctuation.bracket
@punctuation.delimiter
@string
@string.escape
@string.special.path
```

Structural directive names can use `@keyword`. Paths should use `@string.special.path` where the
consumer recognizes it, with a documented fallback to `@string`. Query tests must prove that an
unknown directive still receives a useful neutral capture.

The injection query conceptually maps:

```scheme
((script_body) @injection.content
  (#set! injection.language "bash"))
```

Each integration may use its host's preferred capture and metadata names.

### Editor-specific queries

Each target keeps its native query vocabulary and conventions:

| Consumer | Query location                       | Expected files                                                            |
| -------- | ------------------------------------ | ------------------------------------------------------------------------- |
| Neovim   | `queries/logrotate` on `runtimepath` | highlights, injections, folds, indents, locals when meaningful            |
| Helix    | `runtime/queries/logrotate`          | highlights, injections, indents, textobjects, folds, tags when meaningful |
| Zed      | `zed-logrotate/languages/*`          | highlights, injections, brackets, indents, outline, textobjects           |

Integration queries start from the canonical queries and add only host-specific behavior. Tests
pin the parser and queries to the same revision.

### Indentation, folding, and matching

Rotation blocks and script blocks are foldable. Braces form matching pairs. A newline after an
opening brace increases configuration indentation, and a closing brace decreases it.

Neovim also matches every script opener with `endscript` through `%`. Its file-type setup defines
`#` comments and continues a comment after an insert-mode newline. The standard omnifunc completes
directives according to the current global, rotation-block, or script-body scope; Blink consumes the
same source when present.

The raw shell body delegates internal indentation to the injected language where the host supports
combined indentation. The logrotate query is responsible only for the boundary between the script
directive, body, and `endscript`.

Indent queries are host-specific because their predicate and capture semantics differ. Every
integration must test a rotation block, a nested shell construct, `endscript`, and the closing
rotation brace.

### Text objects and outlines

A rotation block is the primary structural text object. Comments use the host's standard comment
text object. Directives may be exposed as entry-level text objects when the host has a clear
convention for them.

For Helix and Zed, a rotation block may appear in the symbol outline using its path list as the
display name and a section-like symbol kind. Do not label it as a function, class, or variable.

The canonical Tree-sitter `tags.scm` should be omitted unless a standard definition/reference model
can describe rotation stanzas honestly. Host-specific outline support does not require inventing
language semantics in the portable tag query.

## File type detection

File type detection must follow the shared recognition contract without claiming every `.conf`,
`.status`, or `status` file. Explicit user file type choices take precedence over automatic
detection.

Recommended high-confidence names and paths are:

- `logrotate.conf`;
- files directly under a `logrotate.d` directory;
- `*.logrotate`;
- `*.logrotate.conf`.

An integration that supports content detection may also recognize an otherwise unclassified file when
its first physical line is a complete log-path stanza. The line may contain one or more absolute or
`~/` paths, including quoted or escaped paths, followed by `{`, optional whitespace, and an optional
trailing comment. The detector must require the complete structural signal and examine no more than
8,192 characters. Generic configuration text, incomplete stanzas, shell functions, shebangs, and
state file headers are negative configuration cases.

Configuration files resolved through an `include` directive from an open configuration root also
select `logrotate`. This covers existing relative, absolute, and quoted files plus regular files
directly enumerated from an included directory. Resolution uses the root's platform path rules,
including Windows drive paths. Closing the root, a missing target, a nested directory entry, or an
unexpanded wildcard target does not create a new association. The grammar itself still performs no
filesystem access.

The state language is `logrotate_state`. It is recognized by these names and paths:

- `logrotate.status`;
- `logrotate/status` as the final two path components.

An otherwise unclassified file also selects the state language when its first physical line is
exactly `logrotate state -- version 1` or `logrotate state -- version 2`. The same 8,192-character
limit applies. Unsupported versions, leading or trailing whitespace, generic `status` files, and
nested paths such as `logrotate/nested/status` are negative cases. A state signal must never select
the configuration grammar.

The Neovim package registers both languages with `vim.treesitter.language.add()`, installs their
matching queries on `runtimepath`, and applies the complete recognition contract through
`vim.filetype.add()` and a bounded content detector. Its standard package layout supports native
`vim.pack` and LazyVim through the same tagged release. Native `vim.pack` uses its stable
`PackChanged` build-hook API; lazy.nvim detects the root `build.lua` script.

Helix should use its exact file names and glob-aware file type entries. Helix does not support
first-line file type detection, so an extensionless file uses `:set-language logrotate` or its
short form, `:lang logrotate`. Zed should use path suffixes for safe names and
`first_line_pattern` only for the complete content form.

Helix uses `{ glob = "logrotate.d/*", literal-separator = true }` for the directory rule. The
path-aware option preserves ordinary glob behavior while ensuring that only files immediately below
`logrotate.d` select the language.

## Editor integrations

### Neovim

The Neovim package installs both generated parsers, registers `logrotate` and `logrotate_state`, and
places their matching queries on `runtimepath`. It applies the shared file recognition fixture with
`vim.filetype.add()` and a bounded first-line detector. Native Neovim installs it through
`vim.pack`; LazyVim installs the same package through lazy.nvim. Both paths run the root `build.lua`
hook and expose the same commands, help, health provider, completion, and editing behavior.

Separate empty native Neovim and LazyVim profiles install a tagged repository fixture before running
the shared integration suite. The suite verifies parser loading, every machine-readable recognition
case, configuration and state highlighting, Bash injection, indentation, folding, script matching,
scoped directive completion, buffer options, query loading, and a clean health report. CI covers
current stable Neovim and the current development build. Normal-profile terminal checks exercise
the same behavior with installed completion and editing plugins. Stable clean-profile tests run on
Linux x64, macOS arm64, and Windows x64; the pinned development build runs on Linux x64.

### Helix

The Helix setup adds a `[[language]]` entry, a pinned `[[grammar]]` source, and
`runtime/queries/logrotate`. The initial integration uses grammar release 0.1.3 at commit
`6f0297864e944728fd5922ec6f15d986df1a0719`. A grammar release updates the pin and queries together.

Verification runs:

```sh
hx --grammar fetch
hx --grammar build
cargo xtask docgen
```

It should test exact names, `logrotate.d` paths, the supported suffixes, highlighting, Bash
injection in all five script blocks, text objects, section tags, and indentation. Query captures
should use Helix's current names, including its more specific path and integer captures where
appropriate. A rotation block is exposed as `@entry.around`; no `@entry.inside` capture is invented.
The path list names a `@definition.section` tag. Helix does not load fold queries, so this integration
does not add one.

### Zed

Develop and validate `zed-logrotate` as a local dev extension before publishing a tagged release.
`extension.toml` pins both grammars to one exact Git revision. Each `config.toml` declares the
language name, grammar name, path suffixes, first-line detection if used, comment syntax, bracket
pairs, and other language settings supported by Zed.

The extension must test:

- highlighting in built-in light, dark, and high-contrast themes;
- state header, path, timestamp, and invalid-record highlighting;
- shell injection inside every supported script block;
- bracket matching and indentation;
- outline names for single and multiple path stanzas;
- text objects;
- files opened locally, remotely, and in a clean profile;
- grammar update behavior from the previous extension release.

Release verification installs the tagged extension in a clean Zed profile.

### Other consumers

The generated C parser and WASM artifact are the primary integration surfaces. Standard bindings
allow editor plugins, static analyzers, documentation tools, and syntax-aware search tools to
consume the grammar without invoking Node.js.

The README should show one minimal parse example for each published binding and a browser example
using the WASM artifact. Examples must parse supplied text only and must not read arbitrary files or
execute commands.

## Testing strategy

### Corpus tests

Tree-sitter corpus tests are the grammar's primary specification. Organize them by behavior rather
than directive name:

```text
test/corpus/
├── basic.txt
├── comments.txt
├── directives.txt
├── errors.txt
├── incomplete.txt
├── includes.txt
├── paths.txt
├── quoting.txt
├── rotation-blocks.txt
├── scripts.txt
└── whitespace.txt
```

Coverage must include:

- empty files and comment-only files;
- global directives and stanza directives;
- optional `=` separators;
- all five script block types;
- empty, multiline, and unterminated script bodies;
- `endscript` lookalikes inside shell source;
- one and many path patterns;
- quoted paths, spaces, escapes, wildcards, and literal `#` characters;
- include files, include directories, and quoted include paths;
- LF, CRLF, tabs, trailing whitespace, and no final newline;
- known, unknown, vendor-specific, and partial directives;
- unmatched braces and quotes;
- multiple independent errors with useful recovery;
- very long lines and script bodies.

Every accepted tree shape is intentional. Avoid snapshots so broad that a test can pass while the
node under test moves into `ERROR`.

### Query tests

Highlight fixtures assert captures at exact ranges. Injection tests assert that only `script_body`
is injected and that `endscript` remains logrotate syntax. Fold tests assert the exact block range.

Each downstream editor keeps its own query fixtures. The canonical repository should also parse the
downstream query files in scheduled compatibility checks so a grammar node rename cannot reach a
release unnoticed.

### Incremental parsing tests

Bindings tests must parse an initial tree, apply a `TSInputEdit`, reparse with the old tree, and
compare the result with a cold parse of the final text.

At minimum, edit around:

- a directive name and its optional `=`;
- a path list and opening brace;
- a closing brace;
- every script opener;
- an `endscript` terminator;
- the first and last byte of a raw script body;
- CRLF boundaries;
- an unterminated quote or script repaired by the edit.

The incremental and cold trees must agree in type, range, field relationships, and error nodes.
Tests must also assert that unchanged distant subtrees retain identity where the binding exposes it.

### Upstream and existing fixture reuse

Create a script that copies or transforms selected fixtures from a pinned logrotate checkout into a
temporary test input directory. Do not vendor the full upstream repository.

Classify the oracle result:

- parser accepts and Tree-sitter produces no unexpected `ERROR`;
- parser rejects for semantic or host reasons while Tree-sitter still produces a valid syntax tree;
- intentionally malformed input produces bounded, expected error nodes.

The installed `logrotate --debug` command is supporting evidence, not an exact syntax oracle. It may
read users, groups, included files, and build-specific defaults that the grammar deliberately does
not model.

The Visual Studio Code fixture corpus can be consumed the same way at a pinned revision. Any copied
minimal regression case must record its provenance in a comment or manifest.

### Fuzzing and sanitizers

Fuzz the parser and scanner with generated bytes and mutation seeds from valid configurations.
Scanner changes require a focused fuzz job on every pull request. A longer scheduled job retains new
crash inputs under `test/regression` after minimization.

Native CI should compile with AddressSanitizer and UndefinedBehaviorSanitizer on Linux. Scanner code
must be free of out-of-bounds reads, integer overflow affecting ranges, use-after-free, leaks, and
unbounded allocation. The fuzz harness must exercise incremental edits, not only cold parses.

### Performance

Track rather than guess performance. The benchmark corpus includes:

- 10,000 ordinary rotation blocks;
- a 100,000-line configuration;
- a single very large path list;
- a large raw script body containing misleading terminator text;
- repeated incremental edits at the start, middle, and end of the document.

CI records cold parse throughput, incremental parse latency, peak resident memory, parser size, and
WASM size. A change fails when it introduces statistically significant superlinear behavior or
exceeds an approved regression budget. Establish numeric budgets from the first stable benchmark run
on pinned CI hardware instead of placing arbitrary timing limits in the initial design.

### Compatibility matrix

Before each release, test:

| Surface       | Required targets                                        |
| ------------- | ------------------------------------------------------- |
| Native parser | Linux x64 and arm64, macOS arm64, Windows x64 and arm64 |
| Toolchain     | Pinned minimum and current Tree-sitter 0.26 patch       |
| WASM          | Node host and browser host                              |
| Neovim        | Stable on Linux, macOS, and Windows; development on Linux |
| Helix         | Current stable and current main                         |
| Zed           | Current stable and current development extension host   |
| Bindings      | Every published package's supported runtime matrix      |

An editor smoke test must open a real logrotate file and inspect captures or syntax-tree behavior. A
successful parser build alone is insufficient.

## Development environment

Provide a reproducible development container based on a digest-pinned Debian image. It contains:

- the pinned Node.js and npm versions used by the repository;
- the pinned Tree-sitter CLI;
- a C and C++ build toolchain;
- Rust for bindings and Tree-sitter tooling;
- Emscripten or the current Tree-sitter WASM build prerequisite;
- Python, Go, Java, Swift where supported by the container, and Zig for binding tests;
- Git, GitHub CLI, jq, shellcheck, and common release tools;
- logrotate at the reviewed baseline or a reproducibly built upstream checkout;
- fuzzing and sanitizer toolchains.

Do not forward host credentials by default. GitHub authentication and package publishing are release
concerns, not image build inputs. Container build contexts must exclude `.git`, credentials, local
editor data, generated artifacts, and package caches.

Generated output and dependency caches should live in named volumes or container-owned paths so a
Windows checkout and a Linux container do not overwrite each other's native modules. The generated
parser files that are intentionally committed are copied back only through the documented generate
command and verified for reproducibility.

The repository should also document a native setup. The development container is the reference
environment, not the only supported way to contribute.

## Build and generation

Use the current Tree-sitter JavaScript DSL with ESM, type checking, and the generated CLI types:

```js
// @ts-check
/// <reference types="tree-sitter-cli/dsl" />
```

The package manager version is pinned in `package.json`. CI installs with the lockfile and does not
modify it. A single command generates parser source, node types, grammar metadata, and any derived
fixtures.

Generation verification runs in a clean checkout:

1. Install the exact locked toolchain.
2. Run `tree-sitter generate` for ABI 15.
3. Regenerate any derived binding metadata.
4. Fail if the working tree changes.
5. Build native and WASM parsers from the generated output.

Do not minify, post-process, or hand-edit `src/parser.c`. Any compatibility patch belongs in
`grammar.js`, the scanner, or upstream Tree-sitter.

Version metadata in `tree-sitter.json`, package manifests, binding manifests, and release tags must
remain aligned. A release preparation script checks and updates them as one transaction.

## Security and supply chain

Configuration files and script bodies are untrusted input. Parsing must be deterministic, bounded,
and side-effect free.

The parser and bindings must not:

- execute shell code;
- follow include paths;
- access the network;
- read environment variables to change grammar behavior;
- load native libraries from input-controlled paths;
- allocate memory proportional to an unchecked numeric value in the input.

Repository controls include:

- least-privilege GitHub Actions permissions;
- immutable commit pins for third-party actions and reusable workflows;
- `persist-credentials: false` on checkout steps that do not push;
- no secrets in pull request workflows;
- dependency review, CodeQL, compiler sanitizers, and scheduled fuzzing;
- Dependabot or Renovate updates reviewed through pull requests;
- Picket secret scanning for repository content and built development images;
- artifact SBOMs, checksums, provenance attestations, and GitHub release assets;
- protected release environments and tags;
- OIDC trusted publishing where a registry supports it;
- narrowly scoped, environment-protected tokens where OIDC is unavailable.

Official Tree-sitter reusable workflows can supply parser testing, WASM builds, fuzzing, and package
publishing. Reference them by reviewed immutable commit rather than a mutable branch. Wrap them only
when repository policy or an unsupported binding requires additional work.

Generated C is reviewed as a reproducibility artifact. Human review focuses on `grammar.js`,
`scanner.c`, queries, build scripts, dependencies, and generated diffs that unexpectedly change
large portions of the parse table.

## Versioning and compatibility policy

Use Semantic Versioning for the grammar and packages.

Before 1.0, treat node compatibility conservatively even though SemVer permits breaking minor
releases. Each release note must identify node additions, node removals, field changes, query
capture changes, and ABI changes.

After 1.0:

- removing or renaming a named node or field requires a major release;
- materially changing a named node's range or parent relationship requires a major release;
- adding a named node that may affect downstream queries requires at least a minor release;
- accepting more valid syntax without changing established trees may be a minor release;
- recovery, scanner, or query fixes that preserve the public tree may be a patch release.

Editor integrations pin exact grammar revisions. Grammar releases use signed or otherwise verified
`vX.Y.Z` tags. Package registries, GitHub release assets, generated source, and WASM must all
correspond to the same tag and checksum manifest.

The first release is `0.1.0`. Do not declare 1.0 until:

- the node vocabulary has survived real query use;
- scanner fuzzing has completed without unresolved findings;
- native and WASM bindings are reproducible;
- Neovim, Helix, and Zed integrations work against released editors;
- the compatibility and security policies are documented and enforced.

## Documentation

The grammar README should answer, in order:

1. What the grammar parses.
2. Which editors and bindings currently consume it.
3. How to install or test it locally.
4. Which file names are detected.
5. Which syntax is deliberately semantic and therefore not validated.
6. How node compatibility and releases work.

`CONTRIBUTING.md` documents corpus syntax, query tests, generation, fuzzing, upstream comparison,
release preparation, and the requirement to add a minimized regression case with every parser or
scanner bug fix.

`SECURITY.md` explains that parser crashes, hangs, excessive resource use, unsafe native binding
loading, and release compromise are security issues. Configuration mistakes and logrotate host
behavior belong in the appropriate logrotate or editor support channel.

The Zed repository documents only extension installation, supported editor behavior, local dev
extension testing, and grammar revision updates. It links to the grammar repository for syntax-tree
and binding details.

## Delivery plan

### Phase 0: Bootstrap

- Create `tree-sitter-logrotate` with the current official scaffold and MIT license.
- Pin Tree-sitter, Node, package manager, compiler, and upstream logrotate revisions.
- Add the development container and native setup documentation.
- Add generation verification, security checks, and the initial compatibility matrix.

Exit condition: a clean checkout can generate and build the empty native and WASM parser
reproducibly on Linux, macOS, and Windows.

### Phase 1: Configuration grammar

- Implement paths, directives, rotation blocks, comments, quoting, and error recovery.
- Add the C99 external scanner for raw script bodies.
- Import and classify the initial upstream and Visual Studio Code fixture sets.
- Add incremental, fuzz, sanitizer, and performance harnesses.

Exit condition: the reviewed corpus parses with intentional trees, malformed inputs recover locally,
and the scanner passes sanitizers and the initial fuzz budget.

### Phase 2: Queries, bindings, and 0.1.0

- Add portable highlighting, shell injection, and folds.
- Validate every standard binding and the WASM package.
- Establish performance baselines and artifact budgets.
- Publish checksums, SBOMs, provenance, packages, WASM, and the 0.1.0 GitHub release.

Exit condition: consumers can install a tagged parser through Git, native source, WASM, and each
published binding without regenerating it.

### Phase 3: State grammar and unified release

- Add the state grammar under `src/state` and expose both parsers from every binding and release.
- Add state corpus, highlight, incremental, binding, native, WASM, and release-artifact tests.
- Keep both grammar versions aligned in every manifest and package.

Exit condition: one tagged release installs both parsers through every published binding and both
parsers pass their complete native and WASM test matrices.

### Phase 4: Neovim and LazyVim

- Add the complete configuration, state, first-line, and open-include recognition contract to the
  Neovim package using the shared fixture as the test source.
- Add parser registration and native queries for both languages.
- Test tagged installs in separate empty native Neovim and LazyVim profiles, including configuration
  and state highlighting, Bash injection, indentation, comments, folding, script matching, scoped
  completion, help, commands, and health checks.
- Run the stable clean-profile suite on Linux x64, macOS arm64, and Windows x64, and run a pinned
  development build on Linux x64.

Exit condition: clean native Neovim and LazyVim profiles install both parsers from one tagged
grammar revision and pass the complete shared integration suite.

### Phase 5: Zed

- Create `zed-logrotate` with no Rust code.
- Add both grammars, Zed-native queries, language configuration, screenshots, and smoke tests.
- Pin a released grammar revision and publish a tagged extension release.

Exit condition: the released extension works in current stable Zed with the same core parse behavior
as Helix and Neovim.

### Phase 6: Stabilization

- Review real-world regression reports and query compatibility.
- Complete the supported editor matrix.
- Freeze the 1.0 node and field contract.
- Publish 1.0 only after all stated readiness conditions pass.

## Open decisions and acceptance gates

These questions are resolved with evidence before 0.1.0, not left as permanent ambiguity:

| Decision                  | Default                | Evidence required to change it                                      |
| ------------------------- | ---------------------- | ------------------------------------------------------------------- |
| Primary parser ABI        | 15                     | A supported stable runtime cannot load it                           |
| Script injection language | `bash`                 | A target supplies a better portable POSIX shell grammar name        |
| External scanner language | C99                    | All target build systems accept another implementation equally well |
| State file support        | `src/state` grammar    | A breaking state-format change requiring an independent lifecycle   |
| Canonical tags query      | Omitted                | A semantically honest portable definition/reference model           |
| Repository count          | Two owned repositories | An integration changes its distribution model                       |

## Reference material

- [Tree-sitter grammar authoring](https://tree-sitter.github.io/tree-sitter/creating-parsers/3-writing-the-grammar.html)
- [Tree-sitter external scanners](https://tree-sitter.github.io/tree-sitter/creating-parsers/4-external-scanners.html)
- [Tree-sitter parser tests](https://tree-sitter.github.io/tree-sitter/creating-parsers/5-writing-tests.html)
- [Tree-sitter publishing](https://tree-sitter.github.io/tree-sitter/creating-parsers/6-publishing.html)
- [Tree-sitter syntax highlighting](https://tree-sitter.github.io/tree-sitter/3-syntax-highlighting.html)
- [Tree-sitter code navigation](https://tree-sitter.github.io/tree-sitter/4-code-navigation.html)
- [Tree-sitter reusable workflows](https://github.com/tree-sitter/workflows)
- [Helix language integration](https://docs.helix-editor.com/guides/adding_languages.html)
- [Helix language injection](https://docs.helix-editor.com/guides/injection.html)
- [Neovim Tree-sitter](https://neovim.io/doc/user/treesitter.html)
- [Neovim file type Lua](https://neovim.io/doc/user/lua.html#vim.filetype)
- [Zed language extensions](https://zed.dev/docs/extensions/languages)
- [Zed extension development](https://zed.dev/docs/extensions/developing-extensions)
- [logrotate](https://github.com/logrotate/logrotate)
