# Documentation site development

The Astro and Starlight site is in `docs-site`. It has a separate lockfile so parser packages do
not acquire documentation dependencies.

## Install

From the repository root, install both dependency trees:

```sh
npm ci
npm run docs:install
```

The development container runs both commands after it is created. Its documentation dependencies
use a named volume and do not populate the host worktree.

## Run

Start the development server from the repository root:

```sh
npm run docs:dev
```

Open `http://localhost:4323/tree-sitter-logrotate/`. Port 4323 lets this site run beside the
vscode-logrotate documentation site. The `/tree-sitter-logrotate/` path is required because it
matches the GitHub Pages deployment. A request to `http://localhost:4323/` returns 404 by design.

Astro binds to `localhost` by default. WSL normally forwards that listener to Windows, so the same
URL works in a Windows browser.

If Windows localhost forwarding is unavailable, stop the server and start it on the WSL network
interface:

```sh
npm --prefix docs-site run dev -- --host 0.0.0.0
```

Get the WSL address with:

```sh
hostname -I | awk '{print $1}'
```

Then open `http://<address>:4323/tree-sitter-logrotate/`. Stop the server with `Ctrl+C` or press
`q` in its terminal.

Inside the development container, Astro listens on the container network at port 4325. Visual
Studio Code forwards that port and reports when it is ready. Open
`http://localhost:4325/tree-sitter-logrotate/`, or use the forwarded address shown in the Ports
view. This separate container port avoids conflicting with a server running directly in WSL. Run
**Dev Containers: Rebuild and Reopen in Container** after pulling a change to
`.devcontainer/devcontainer.json` so its environment and port settings take effect.

## Check and preview

Run the content and type checks, then build the static site:

```sh
npm run docs:check
npm run docs:build
```

Building the site does not start a server. To inspect the generated production output, run:

```sh
npm run docs:preview
```

For native and WSL development, open `http://localhost:4323/tree-sitter-logrotate/` again. In the
development container, use `http://localhost:4325/tree-sitter-logrotate/`. The preview server uses
the built files and does not provide the development server's live updates.
