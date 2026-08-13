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

Inside the development container, Visual Studio Code forwards port 4323 and reports when it is
ready. Use the same `/tree-sitter-logrotate/` path on the forwarded address.

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

Open `http://localhost:4323/tree-sitter-logrotate/` again. The preview server uses the built files
and does not provide the development server's live updates.
