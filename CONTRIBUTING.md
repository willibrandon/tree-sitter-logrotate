# Contributing

Use the development container when possible. For a native setup, install Node.js 24.19.0, npm 12.0.2, Tree-sitter 0.26.12, Java 25, CMake, Ninja, a C compiler, and the current Tree-sitter WASM prerequisite. Emscripten is also useful for downstream compatibility checks.

Install and verify the repository with:

```sh
npm ci
npm run verify
mvn clean test
```

Change `grammar.js`, corpus fixtures, and queries together. Run `npm run generate` after a grammar change, then run `npm run check:generated`. Generated files such as `src/parser.c`, `src/grammar.json`, and `src/node-types.json` must be regenerated; never edit them by hand.

Before opening a pull request, run:

```sh
npm run test:bootstrap
npm run build:native
npm run build:wasm
npm run verify
```

Keep changes focused and include corpus coverage for behavior introduced after the bootstrap phase.
