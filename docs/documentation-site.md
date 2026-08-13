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

Open `http://localhost:4321/tree-sitter-logrotate/`. The `/tree-sitter-logrotate/` path is required
because it matches the GitHub Pages deployment. A request to `http://localhost:4321/` returns 404
by design.

The server listens beyond the Linux loopback interface so it can be reached from a Windows browser
when the repository is in WSL. If Windows does not forward `localhost`, get the WSL address with:

```sh
hostname -I | awk '{print $1}'
```

Then open `http://<address>:4321/tree-sitter-logrotate/`. Stop the server with `Ctrl+C` or press
`q` in its terminal.

Inside the development container, Visual Studio Code forwards port 4321 and reports when it is
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

Open `http://localhost:4321/tree-sitter-logrotate/` again. The preview server uses the built files
and does not provide the development server's live updates.
