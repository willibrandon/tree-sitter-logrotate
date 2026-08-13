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

Zsh is the default integrated terminal shell. Its history-based autosuggestions reuse completed
commands as you type, and its history is kept in the container's persistent cache volume. Visual
Studio Code terminal IntelliSense also suggests commands, arguments, files, and folders. Press
`Ctrl+Space` to request the suggestion list manually and `Tab` to accept a selected suggestion.
Bash remains available with conventional completion enabled.

## Documentation site

The post-create command installs the site's locked dependencies in a separate named volume. Start
the site with:

```sh
npm run docs:dev
```

Port 4325 is forwarded automatically. Open
`http://localhost:4325/tree-sitter-logrotate/` when Visual Studio Code reports that the port is
available. The repository path is required because it matches the GitHub Pages deployment.

After pulling a change to `devcontainer.json`, run **Dev Containers: Rebuild and Reopen in
Container** before testing the updated environment or forwarded ports.

Run `npm run docs:check` and `npm run docs:build` before committing documentation changes. The
complete native and WSL workflow is in
[docs/documentation-site.md](../docs/documentation-site.md).

`node_modules`, Node-gyp, Maven, Swift, Python, Zig, Cargo, compiler output, release output, and
download caches use named volumes or ignored container-owned paths. They remain outside the host's
platform-specific build output so Windows, macOS, and Linux do not reuse incompatible native files.

The container does not mount the Docker socket, SSH configuration, GnuPG data, or package registry
credentials. Authenticate explicitly only for a task that requires it. Publishing is performed by
protected GitHub environments, not by the development container.
