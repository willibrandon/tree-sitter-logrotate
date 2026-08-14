# Compatibility

The 0.1 release line uses Tree-sitter language ABI 15 and generated parser source from Tree-sitter
CLI 0.26.12. CI also rebuilds and tests the committed parser with CLI 0.26.3, the declared minimum.
A release does not silently raise either value.

## Parser and platform matrix

| Surface | Tested versions and platforms |
| --- | --- |
| Native parser | Linux x64 and arm64, macOS arm64, Windows x64 and arm64 |
| Tree-sitter CLI | 0.26.3 and 0.26.12 |
| Node | Node.js 24.19.0 with `tree-sitter` 0.25.1 |
| Python | CPython 3.10 through 3.14 using ABI3 wheels where supported |
| Rust | Rust 1.85.0 and 1.97.1 |
| Go | Go 1.23 and 1.26.5 |
| Java | Java 25 with JTreeSitter 0.26 |
| Swift | Swift 6.3.3 on macOS arm64 and the reference Linux container |
| Zig | Zig 0.16.0 on Linux, macOS, and Windows |
| WASM | `web-tree-sitter` 0.26.12 in Node.js and a Chromium browser host |

The generated C parser is the common source for every binding. Package installation and release
consumer tests run without `tree-sitter generate`.

## Public tree contract

Named nodes, fields, and portable query captures are compatibility surfaces. The initial public
tree includes configuration structure, directives, arguments, path lists, script blocks,
`script_body`, and the recovery node `unterminated_script_block`. The exact vocabulary is published
in `src/node-types.json`.

Before 1.0, every release note identifies node additions, removals, field changes, query capture
changes, and ABI changes. Breaking tree changes are avoided unless real consumer use proves the
existing shape unsuitable. After 1.0, removing or renaming a public node or field requires a major
release.

## Syntax scope

The grammar describes logrotate configuration syntax. It does not validate directive availability,
resolve includes, apply inherited settings, inspect users or paths, or emulate an installed
logrotate build. Unknown directives intentionally parse as ordinary directives.

Logrotate state files are outside this grammar. A state header such as
`logrotate state -- version 2` must not be treated as a configuration-file detection signal.

Editor integrations recognize `logrotate.conf`, files directly below a `logrotate.d` directory,
`*.logrotate`, and `*.logrotate.conf`. A host with content detection may also recognize an
otherwise unclassified file when its first physical line is a complete absolute or `~/` log-path
stanza. Quoted paths, escaped paths, multiple paths, leading whitespace, and a trailing comment are
valid. The detector examines at most 8,192 characters and rejects generic configuration text,
incomplete stanzas, shell functions, shebangs, and state file headers.

## Editor status

Helix, Neovim, and Zed integrations follow the grammar release in later delivery phases. Until an
editor accepts and tests a pinned grammar revision, this repository does not claim built-in support
for that editor. The ABI and portable queries are intended integration surfaces, not proof of an
editor integration.

The planned editor matrix is:

| Editor | Planned targets |
| --- | --- |
| Neovim | stable and development builds |
| Helix | stable and main |
| Zed | stable and development extension hosts |

These rows become required release gates when their integration phase begins.
