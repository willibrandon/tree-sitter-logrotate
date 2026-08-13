# Compatibility

Phase 0 establishes build portability. It does not claim editor integration or complete logrotate parsing yet.

## Build platforms

| Platform | Architecture | Phase 0 check |
| --- | --- | --- |
| Linux | x64 and arm64 | Generation, native library, WASM, tests, sanitizers |
| macOS | arm64 | Generation, native library, WASM, tests |
| Windows | x64 | Generation, native library, WASM, tests |

The Node binding is checked in Node.js. The WASM artifact is the parser surface intended for browser and other sandboxed hosts.

## Editor targets

Neovim stable and development builds are planned consumers. Helix stable and main are planned consumers. Zed stable and development builds are planned consumers. Editor smoke tests begin after the grammar recognizes real logrotate syntax.

No Phase 0 result should be read as compatibility with every logrotate configuration. The current grammar is deliberately limited to its scaffold corpus while the repository and delivery contracts are established.
