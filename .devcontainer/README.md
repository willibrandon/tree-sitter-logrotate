# Development container

The container is the reference development environment for the grammar. Its base and language toolchain images are pinned by digest. Node.js 24.19.0, npm 12.0.2, Tree-sitter 0.26.12, LLVM 21, Rust, Go, Java 25, Swift, Zig, a C compiler, Emscripten, logrotate, GitHub CLI, jq, and shellcheck are installed.

Open the repository in a dev-container capable editor. The post-create command runs `npm ci` and checks the tool versions. Run the complete Phase 0 verification with:

```sh
npm run generate
npm run check:generated
npm run build:native
npm run build:wasm
npm run test:bootstrap
npm run verify
```

`node_modules`, Node-gyp, Maven, Swift, Python, Zig, Cargo, compiler output, and download caches use named volumes. They remain outside the host worktree so native files from Windows, macOS, and Linux do not replace each other.

The container does not mount the Docker socket, SSH configuration, GnuPG data, or package registry credentials. Authenticate explicitly only for a task that requires it. Publishing is not part of the development container.
