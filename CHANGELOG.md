# Changelog

## 0.1.2

Published README links are now absolute, so documentation and development references work from
PyPI as well as npm and crates.io. Package homepages point to the user documentation, and the Java
example links directly to the Maven Central artifact.

This release also adds the Astro documentation site and its GitHub Pages workflow, refines the
reproducible development container, and rebuilds stale local Node bindings before tests. Parser
behavior, public nodes, queries, ABI 15, and minimum runtime versions are unchanged.

## 0.1.1

Rust source packages now anchor `grammar.js` to the repository root, preventing dependency
grammars from entering release archives. Parser behavior, public nodes, queries, ABI 15, and
minimum runtime versions are unchanged.

Release automation now verifies npm recovery packages against the original tag-bound attestation
and checksum set. Java build dependencies and pinned GitHub Actions are current, CodeQL analyzes
the hand-written scanner without reporting generated parser code, and Windows CI allows enough
time for a cold WASI SDK download while retaining a bounded timeout. VS Code's Maven importer now
recognizes the native test setup across compatible `exec-maven-plugin` updates.

## 0.1.0

The first release parses logrotate configuration files using Tree-sitter ABI 15. It recognizes
global directives, include directives, rotation stanzas, path lists, quoting, escapes, comments,
optional equals separators, numeric values, sizes, and all five raw script blocks. Unknown and
vendor-specific directives remain valid syntax.

The external C99 scanner preserves shell bodies without consuming `endscript` and recovers a later
stanza after an unterminated script when a complete stanza header provides a safe boundary. Corpus,
incremental, upstream-fixture, fuzz, sanitizer, and performance tests cover the initial grammar.

Portable queries provide highlighting, Bash injection for `script_body`, and folds for rotation and
script blocks. The public recovery node `unterminated_script_block` records an incomplete script
without turning later valid stanzas into script text.

C source, npm, Python, Rust, Go, Java, Swift, Zig, and WASM consumers use the same committed parser.
Release artifacts include precompiled Node bindings, platform Python wheels, a source archive,
standalone WASM, Java archives, checksums, CycloneDX SBOMs, and GitHub provenance attestations.
