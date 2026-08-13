# tree-sitter-logrotate

`tree-sitter-logrotate` is a Tree-sitter grammar for logrotate configuration files. The repository is currently at Phase 0: the standard bindings, reproducible generation checks, native and WASM builds, and project automation are in place. The grammar still contains the scaffold token and does not yet parse logrotate syntax.

The planned consumers are Neovim, Helix, Zed, and other tools that use Tree-sitter. See [the design](docs/tree-sitter-logrotate-design.md) for the language model and delivery plan.

## Development container

The development container is the recommended environment. It pins the toolchain, keeps dependency and build output in named volumes, and does not forward host credentials. Open the repository in a dev-container capable editor, then run:

```sh
npm run verify
```

See [.devcontainer/README.md](.devcontainer/README.md) for its security and storage model.

## Native setup

The exact versions are Node.js 24.19.0, npm 12.0.2, Tree-sitter 0.26.12, Java 25, and Maven 3.9.16. Native parser builds require a C compiler and CMake with Ninja. WASM builds use Tree-sitter's current WASI SDK path; Emscripten remains supported for downstream compatibility work.

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
```

`TREE_SITTER_BUILD_DIR` selects the output directory for native and WASM artifacts. Its default is `build`, which is ignored by Git.

The Java binding builds its required native test libraries through CMake. Run `mvn clean test` from the repository root after `npm ci`.

See [native development](docs/native-development.md) for the complete toolchain and [compatibility](docs/compatibility.md) for the Phase 0 platform contract.

## License

This project is licensed under the MIT License.
