import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const docsRoot = join(repositoryRoot, "docs-site");

const read = (path) => readFile(join(repositoryRoot, path), "utf8");
const readDocs = (path) => readFile(join(docsRoot, path), "utf8");

const markdownSection = (source, heading, level) => {
  const marker = `${"#".repeat(level)} ${heading}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing ${marker}`);
  const rest = source.slice(start + marker.length);
  const next = rest.search(new RegExp(`^#{1,${String(level)}}\\s`, "mu"));
  return next === -1 ? rest : rest.slice(0, next);
};

test("documentation toolchain is exact and reproducible", async () => {
  const manifest = JSON.parse(await readDocs("package.json"));
  const lock = JSON.parse(await readDocs("package-lock.json"));

  assert.equal(manifest.private, true);
  assert.equal(manifest.engines.node, "24.19.0");
  assert.equal(manifest.packageManager, "npm@12.0.2");
  assert.equal(manifest.dependencies.astro, "7.2.1");
  assert.equal(manifest.dependencies["@astrojs/starlight"], "0.41.7");
  assert.equal(manifest.dependencies["@astrojs/sitemap"], "3.7.3");
  assert.equal(manifest.devDependencies["@astrojs/check"], "0.9.10");
  assert.equal(manifest.allowScripts["esbuild@0.28.2"], true);
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(lock.packages[""].name, manifest.name);
});

test("Astro uses the repository Pages path and Starlight content layer", async () => {
  const configuration = await readDocs("astro.config.mjs");
  const content = await readDocs("src/content.config.ts");

  assert.match(configuration, /site:\s*"https:\/\/willibrandon\.github\.io"/u);
  assert.match(configuration, /base:\s*"\/tree-sitter-logrotate"/u);
  assert.match(configuration, /trailingSlash:\s*"always"/u);
  assert.match(configuration, /TREE_SITTER_LOGROTATE_DOCS_HOST/u);
  assert.match(configuration, /TREE_SITTER_LOGROTATE_DOCS_PORT/u);
  assert.match(
    configuration,
    /server:\s*\{[\s\S]*?host:\s*serverHost[\s\S]*?port:\s*serverPort/u,
  );
  assert.match(configuration, /starlight\(\{/u);
  assert.match(configuration, /langs:\s*\[logrotateLanguage\]/u);
  assert.match(
    configuration,
    /tableOfContents:\s*\{[\s\S]*?minHeadingLevel:\s*2[\s\S]*?maxHeadingLevel:\s*3/u,
  );
  assert.match(content, /docsLoader\(\)/u);
  assert.match(content, /docsSchema\(\)/u);
});

test("site pages are concise, navigable, and free of placeholder claims", async () => {
  const repositoryManifest = JSON.parse(await read("package.json"));
  const releaseLine = repositoryManifest.version.split(".").slice(0, 2).join(".");
  const directory = join(docsRoot, "src/content/docs");
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".md"))
    .sort();
  assert.deepEqual(names, [
    "bindings.md",
    "compatibility.md",
    "editors.md",
    "getting-started.md",
    "index.md",
    "queries.md",
    "syntax-tree.md",
    "troubleshooting.md",
  ]);

  for (const name of names) {
    const source = await readFile(join(directory, name), "utf8");
    assert.match(source, /^---\ntitle:\s*.+\ndescription:\s*.+\n---\n/u, name);
    assert.ok(
      (source.match(/^##\s+/gmu) ?? []).length >= 2,
      name + " needs useful page sections",
    );
    assert.doesNotMatch(source, /[—–]/u, name + " must use plain punctuation");
    assert.doesNotMatch(
      source,
      /\b(?:TODO|TBD|coming soon)\b/iu,
      name + " must not contain placeholders",
    );
  }

  const editors = await readFile(join(directory, "editors.md"), "utf8");
  assert.match(editors, /^## Neovim$/mu);
  assert.match(editors, /^### Native vim\.pack$/mu);
  assert.match(editors, /^### LazyVim$/mu);
  assert.match(editors, /^### Usage$/mu);
  assert.match(editors, /PackChanged/u);
  assert.match(editors, /Neovim 0\.12\.0 or newer/u);
  assert.ok(editors.includes(`vim.version.range("${releaseLine}")`));
  assert.match(editors, /lua\/plugins\/logrotate\.lua/u);
  assert.match(editors, /:checkhealth tree-sitter-logrotate/u);
  assert.match(editors, /npm run test:neovim:install/u);
  assert.match(editors, /:LogrotateInstall/u);
  assert.match(editors, /CTRL-X CTRL-O/u);
  assert.match(editors, /^## Helix$/mu);
  assert.match(editors, /^## Zed$/mu);
  assert.match(editors, /one released grammar revision/iu);
});

test("section spacing follows Starlight heading wrappers", async () => {
  const styles = await readDocs("src/styles/docs.css");

  assert.match(
    styles,
    /\.sl-markdown-content\s+:not\(h1, h2, h3, h4, h5, h6, \.sl-heading-wrapper\)\s+\+ \.sl-heading-wrapper\.level-h2\s*\{\s*margin-top: 0\.75em;/u,
  );
  assert.doesNotMatch(styles, /\.sl-markdown-content\s+h[23]\s*\{/u);
});

test("public compatibility documentation includes every release platform", async () => {
  const publicCompatibility = await readDocs(
    "src/content/docs/compatibility.md",
  );
  const repositoryCompatibility = await read("docs/compatibility.md");
  const platformDescription =
    "Linux x64 and arm64, macOS arm64, Windows x64 and arm64";

  assert.match(publicCompatibility, new RegExp(platformDescription, "u"));
  assert.match(repositoryCompatibility, new RegExp(platformDescription, "u"));
});

test("custom highlighting and portable query guidance stay aligned", async () => {
  const language = JSON.parse(
    await readDocs("src/languages/logrotate.tmLanguage.json"),
  );
  const queries = await readDocs("src/content/docs/queries.md");

  assert.equal(language.scopeName, "source.logrotate");
  assert.match(language.repository.directive.match, /rotate/u);
  assert.match(language.repository.scripts.begin, /postrotate/u);
  assert.match(queries, /queries\/highlights\.scm/u);
  assert.match(queries, /queries\/injections\.scm/u);
  assert.match(queries, /queries\/folds\.scm/u);
});

test("every public binding example parses configuration and state input", async () => {
  const readme = await read("README.md");
  const bindings = await readDocs("src/content/docs/bindings.md");
  const expected = new Map([
    ["C", "tree_sitter_logrotate_state"],
    ["Node.js", "stateLanguage"],
    ["Python", "state_language"],
    ["Rust", "STATE_LANGUAGE"],
    ["Go", "StateLanguage"],
    ["Java", "stateLanguage"],
    ["Swift", "tree_sitter_logrotate_state"],
    ["Zig", "stateLanguage"],
  ]);

  for (const [heading, stateApi] of expected) {
    for (const [name, source, level] of [
      ["README", readme, 3],
      ["bindings page", bindings, 2],
    ]) {
      const section = markdownSection(source, heading, level);
      assert.match(section, /\/var\/log\/app\.log \{/u, `${name}: ${heading}`);
      assert.match(
        section,
        /logrotate state -- version 2/u,
        `${name}: ${heading}`,
      );
      assert.ok(section.includes(stateApi), `${name}: ${heading}: ${stateApi}`);
    }
  }

  const readmeWasm = markdownSection(readme, "Browser WASM", 3);
  const docsWasm = markdownSection(bindings, "WebAssembly", 2);
  for (const [name, section] of [
    ["README", readmeWasm],
    ["bindings page", docsWasm],
  ]) {
    assert.match(section, /tree-sitter-logrotate\.wasm/u, name);
    assert.match(section, /tree-sitter-logrotate-state\.wasm/u, name);
    assert.match(section, /logrotate state -- version 2/u, name);
  }
});

test("Pages workflow builds pull requests and confines deployment permissions", async () => {
  const workflow = await read(".github/workflows/docs.yml");
  const dependabot = await read(".github/dependabot.yml");
  const rootManifest = JSON.parse(await read("package.json"));

  assert.match(workflow, /^\s*pull_request:\s*$/mu);
  assert.match(
    workflow,
    /withastro\/action@e84f40bd8d2caa9e768ec82ad30dd81f0b280853/u,
  );
  assert.match(
    workflow,
    /actions\/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128/u,
  );
  assert.match(
    workflow,
    /if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/u,
  );
  assert.match(workflow, /^permissions:\s*\n\s+contents:\s+read$/mu);
  assert.match(
    workflow,
    /deploy:\s*[\s\S]*?permissions:\s*\n\s+pages:\s+write\s*\n\s+id-token:\s+write/u,
  );
  assert.match(
    dependabot,
    /package-ecosystem:\s*npm\s*\n\s+directory:\s*\/docs-site/u,
  );
  assert.equal(
    rootManifest.scripts["docs:check"],
    "npm --prefix docs-site run check",
  );
  assert.equal(
    rootManifest.scripts["docs:build"],
    "npm --prefix docs-site run build",
  );
});

test("local documentation workflow works from WSL and the development container", async () => {
  const rootManifest = JSON.parse(await read("package.json"));
  const docsManifest = JSON.parse(await readDocs("package.json"));
  const configuration = JSON.parse(
    await read(".devcontainer/devcontainer.json"),
  );
  const postCreate = await read(".devcontainer/post-create.sh");
  const developmentGuide = await read("docs/documentation-site.md");
  const mounts = configuration.mounts.map((mount) =>
    typeof mount === "string" ? mount : JSON.stringify(mount),
  );

  assert.equal(
    rootManifest.scripts["docs:install"],
    "npm --prefix docs-site ci --include=optional",
  );
  assert.equal(
    rootManifest.scripts["docs:dev"],
    "npm --prefix docs-site run dev",
  );
  assert.equal(
    rootManifest.scripts["docs:preview"],
    "npm --prefix docs-site run preview",
  );
  assert.equal(docsManifest.scripts.dev, "astro dev");
  assert.equal(docsManifest.scripts.preview, "astro preview");
  assert.equal(configuration.containerEnv.ASTRO_TELEMETRY_DISABLED, "1");
  assert.equal(
    configuration.containerEnv.TREE_SITTER_LOGROTATE_DOCS_HOST,
    "0.0.0.0",
  );
  assert.equal(
    configuration.containerEnv.TREE_SITTER_LOGROTATE_DOCS_PORT,
    "4325",
  );
  assert.deepEqual(configuration.forwardPorts, [4325]);
  assert.equal(configuration.portsAttributes["4325"].onAutoForward, "notify");
  assert.ok(
    mounts.some(
      (mount) =>
        /type=volume/u.test(mount) &&
        /target=[^,]*\/docs-site\/node_modules(?:,|$)/u.test(mount),
    ),
    "documentation dependencies must use a named volume",
  );
  assert.match(postCreate, /npm --prefix docs-site ci --include=optional/u);
  assert.match(developmentGuide, /npm run docs:install/u);
  assert.match(developmentGuide, /npm run docs:dev/u);
  assert.match(
    developmentGuide,
    /http:\/\/localhost:4323\/tree-sitter-logrotate\//u,
  );
  assert.match(
    developmentGuide,
    /http:\/\/localhost:4325\/tree-sitter-logrotate\//u,
  );
  assert.match(developmentGuide, /hostname -I/u);
  assert.match(
    developmentGuide,
    /npm --prefix docs-site run dev -- --host 0\.0\.0\.0/u,
  );
  assert.match(developmentGuide, /Building the site does not start a server/u);
});
