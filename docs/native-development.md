# Native development

The development container is the reference environment. A native installation is also supported when its tools match `toolchains.json`.

## Required tools

Install Node.js 24.19.0, npm 12.0.2, Tree-sitter 0.26.12, Java 25, Maven 3.9.16, CMake, Ninja, a C compiler, and Git. Native binding work also uses the language toolchain for that binding. WASM builds use the WASI SDK downloaded and verified by Tree-sitter. Emscripten is installed in the development container for downstream compatibility checks.

The reviewed logrotate source revision is recorded in `toolchains.json`. It is an analysis input, not a runtime dependency.

## First build

```sh
nvm use
npm install --global npm@12.0.2
npm ci
npm run generate
npm run check:generated
npm run build:native
npm run build:wasm
npm run test:bootstrap
npm run verify
mvn clean test
```

`npm run generate` updates committed generated sources. `npm run check:generated` generates into a temporary directory and fails on drift without changing the worktree.

Set `TREE_SITTER_BUILD_DIR` to place native and WASM artifacts outside the repository. The development container sets it to a named volume-backed directory so Linux output cannot alter a Windows or macOS worktree.

## Java binding

The Java binding requires Java 25 because it uses the finalized Foreign Function & Memory API. Maven configures a Ninja build in `target/native`, compiles the grammar and Tree-sitter runtime as shared libraries, then runs the JUnit binding test with that isolated library path.

Inside the development container, `MAVEN_ARGS` relocates the complete Maven build directory beneath `.devcontainer-output`. This permits `mvn clean test` to delete and recreate its build directory without writing native artifacts into the host worktree.
