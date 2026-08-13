# Contributing

The development container is the reference environment. A native setup is also supported when its
tools match `toolchains.json`. Start with [native development](docs/native-development.md) when the
container is not suitable.

Install dependencies and run the ordinary verification suite with:

```sh
npm ci
npm run verify
```

The Astro documentation site uses a separate lockfile. Follow
[documentation site development](docs/documentation-site.md) when changing its content or layout.

## Grammar changes

Edit `grammar.js` and `src/scanner.c`. `src/parser.c`, `src/grammar.json`, and
`src/node-types.json` are generated files; do not edit them by hand. Regenerate them with:

```sh
npm run generate
npm run check:generated
```

The corpus under `test/corpus` is the grammar specification. Each case has a title, source text, a
line containing `---`, and the complete expected syntax tree. Keep cases narrow enough that a node
moving into `ERROR` cannot go unnoticed.

Parser and scanner fixes require a minimized regression case that fails before the fix. Put syntax
shape coverage in the corpus and binding behavior in `test/node`. Scanner changes also require an
incremental case when an edit can enter, leave, or cross a raw script body.

The grammar recognizes structure rather than the installed logrotate directive catalog. Unknown
and vendor-specific directive names remain valid `directive` nodes. Include paths are parsed but
never read. Script bodies are preserved but never executed.

## Queries

Portable queries live in `queries`. They may use only standard Tree-sitter nodes, captures,
predicates, and metadata. Editor-specific predicates belong in the editor integration that uses
them.

Run both query checks after changing a query or a public node:

```sh
npm run test:highlight
npm run test:node
```

The Node query tests assert exact captures and ranges for highlighting, shell injection, and folds.
Only `script_body` is injected. `endscript` remains logrotate syntax.

## Fixtures and parser behavior

Pinned upstream and Visual Studio Code fixtures are declared in `test/fixtures/manifest.json`.
`npm run test:fixtures` reads each file at its recorded Git revision, copies it to a temporary
directory, and checks its declared classification. Do not point fixture tests at a moving branch or
vendor an upstream checkout. Set `TREE_SITTER_FIXTURES_FETCH=always` to exercise the clean-checkout
download path used by CI.

Use these checks when parser behavior changes:

```sh
npm run test:parser
npm run test:node
npm run test:fixtures
npm run test:sanitizers
npm run test:fuzz:pr
npm run test:performance
```

Fuzz failures must be minimized into `test/regression` and covered by a deterministic test before
the fix is merged. Record the source of a copied regression in its test or manifest.

Refresh `test/performance/baseline.json` only after an intentional parser or benchmark change and
only in the reference Linux x64 environment:

```sh
npm run test:performance:update-baseline
npm run test:performance
```

Review both the measurements and `test/performance/budgets.json` rather than relaxing a budget to
hide a regression.

## Bindings and WASM

All bindings expose the generated `tree_sitter_logrotate` language. They must not contain another
parser or run generation during installation.

```sh
npm run test:bindings
npm run test:wasm
```

Use a binding-specific command while iterating. The aggregate command is required before a release.
Native and WASM output defaults to ignored build directories. Set `TREE_SITTER_BUILD_DIR` when a
different isolated location is required.

## Pull requests

Run the following before opening a pull request that changes grammar, scanner, query, package, or
release behavior:

```sh
npm run verify
npm run test:fixtures
npm run test:sanitizers
npm run test:bindings
npm run test:wasm
npm run test:performance
git diff --check
```

Keep generated diffs with their source change. Explain any public node, field, query capture,
minimum runtime, ABI, or performance-budget change.

## Releases

Release preparation and registry configuration are documented in [docs/release.md](docs/release.md).
Do not rebuild or replace an artifact after tagging. Every package, checksum, SBOM, attestation,
and GitHub release asset must come from the same tag.
