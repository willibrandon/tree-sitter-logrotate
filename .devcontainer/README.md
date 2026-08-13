# Development container

The container is the reference development environment for the grammar. Its base and language
toolchain images are pinned by digest. It contains Node.js, npm, Tree-sitter, LLVM, Rust, Go, Java,
Maven, Swift, Zig, Python packaging tools, Emscripten, logrotate, Chromium, GitHub CLI, jq, and
shellcheck at the versions recorded in `toolchains.json` and `requirements-build.txt`.

Open the repository in a development-container capable editor. The post-create command installs the
locked npm dependencies and Python release tools, then verifies the toolchain. Run the complete
Phase 1 and 2 verification with:

```sh
bash .devcontainer/verify.sh
```

For a shorter parser-only cycle, use:

```sh
npm run verify
```

`node_modules`, Node-gyp, Maven, Swift, Python, Zig, Cargo, compiler output, release output, and
download caches use named volumes or ignored container-owned paths. They remain outside the host's
platform-specific build output so Windows, macOS, and Linux do not reuse incompatible native files.

The container does not mount the Docker socket, SSH configuration, GnuPG data, or package registry
credentials. Authenticate explicitly only for a task that requires it. Publishing is performed by
protected GitHub environments, not by the development container.
