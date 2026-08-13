# Native development

The development container is the reference environment. Native development is supported when the
installed tools match `toolchains.json`.

## Required tools

The core parser needs Node.js 24.19.0, npm 12.0.2, Tree-sitter CLI 0.26.12, Git, a C compiler with
C11 support, and CMake with Ninja. Scanner conformance uses Clang and C99. WASM builds use Tree-sitter's current WASI
SDK path; Emscripten is retained for downstream compatibility work.

Complete binding and release verification also uses:

| Tool | Version |
| --- | --- |
| Rust | 1.97.1, with 1.85.0 as the crate minimum |
| Go | 1.26.5, with 1.23 as the module minimum |
| Python | 3.13 for local packaging; packages support 3.10 and later |
| Java | 25 |
| Maven | 3.9.16 |
| Swift | 6.3.3 |
| Zig | 0.16.0 |
| logrotate | reviewed revision and display version recorded in `toolchains.json` |

Python release builds install the exact packages in `requirements-build.txt`. Browser WASM tests
need Chromium and Playwright's browser dependencies.

## First build

```sh
nvm use
npm install --global npm@12.0.2
npm ci
npm run test:bootstrap
npm run build:native
npm run build:wasm
npm run verify
```

Run `npm run generate` only after changing `grammar.js` or scanner token declarations. It updates
the committed parser source and metadata. `npm run check:generated` regenerates into a temporary
directory and fails on drift without changing the checkout.

## Full local verification

```sh
npm run test:fixtures
npm run test:sanitizers
npm run test:bindings
npm run test:wasm
npm run test:performance
```

The Swift binding requires macOS or a Linux installation of Swift. Address and undefined behavior
sanitizers require a Unix Clang runtime. The browser test uses `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when
a system Chromium should be used.

## Isolated output

`TREE_SITTER_BUILD_DIR` relocates native, WASM, sanitizer, and performance output. Binding commands
use ignored language-specific build directories. This prevents native artifacts from one operating
system from being reused in another worktree or container.

For Maven, set `-Dproject.build.directory` or `MAVEN_ARGS` to an ignored directory. The development
container already relocates Maven, Cargo, Swift, Python, Zig, Node, compiler, and download caches to
named volumes.

## Release artifacts

Create a local release-artifact set only from a clean, verified checkout:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install --requirement requirements-build.txt
PYTHON=.venv/bin/python npm run package:release
npm run verify:release
PYTHON=.venv/bin/python npm run test:release
```

These commands package committed generated source. They do not regenerate the parser.
