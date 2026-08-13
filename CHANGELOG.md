# Changelog

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
