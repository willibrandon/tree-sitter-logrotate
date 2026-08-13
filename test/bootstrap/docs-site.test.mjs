import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const docsRoot = join(repositoryRoot, "docs-site");

const read = (path) => readFile(join(repositoryRoot, path), "utf8");
const readDocs = (path) => readFile(join(docsRoot, path), "utf8");

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
  assert.match(configuration, /starlight\(\{/u);
  assert.match(configuration, /langs:\s*\[logrotateLanguage\]/u);
  assert.match(configuration, /tableOfContents:\s*\{[\s\S]*?minHeadingLevel:\s*2[\s\S]*?maxHeadingLevel:\s*3/u);
  assert.match(content, /docsLoader\(\)/u);
  assert.match(content, /docsSchema\(\)/u);
});

test("site pages are concise, navigable, and free of placeholder claims", async () => {
  const directory = join(docsRoot, "src/content/docs");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".md")).sort();
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
    assert.ok((source.match(/^##\s+/gmu) ?? []).length >= 2, name + " needs useful page sections");
    assert.doesNotMatch(source, /[—–]/u, name + " must use plain punctuation");
    assert.doesNotMatch(source, /\b(?:TODO|TBD|coming soon)\b/iu, name + " must not contain placeholders");
  }

  const editors = await readFile(join(directory, "editors.md"), "utf8");
  assert.match(editors, /built-in integration is not yet claimed/u);
  assert.match(editors, /It does not imply that a stock editor already ships\s+Logrotate support/u);
});

test("custom highlighting and portable query guidance stay aligned", async () => {
  const language = JSON.parse(await readDocs("src/languages/logrotate.tmLanguage.json"));
  const queries = await readDocs("src/content/docs/queries.md");

  assert.equal(language.scopeName, "source.logrotate");
  assert.match(language.repository.directive.match, /rotate/u);
  assert.match(language.repository.scripts.begin, /postrotate/u);
  assert.match(queries, /queries\/highlights\.scm/u);
  assert.match(queries, /queries\/injections\.scm/u);
  assert.match(queries, /queries\/folds\.scm/u);
});

test("Pages workflow builds pull requests and confines deployment permissions", async () => {
  const workflow = await read(".github/workflows/docs.yml");
  const dependabot = await read(".github/dependabot.yml");
  const rootManifest = JSON.parse(await read("package.json"));

  assert.match(workflow, /^\s*pull_request:\s*$/mu);
  assert.match(workflow, /withastro\/action@e84f40bd8d2caa9e768ec82ad30dd81f0b280853/u);
  assert.match(workflow, /actions\/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128/u);
  assert.match(workflow, /if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/u);
  assert.match(workflow, /^permissions:\s*\n\s+contents:\s+read$/mu);
  assert.match(workflow, /deploy:\s*[\s\S]*?permissions:\s*\n\s+pages:\s+write\s*\n\s+id-token:\s+write/u);
  assert.match(dependabot, /package-ecosystem:\s*npm\s*\n\s+directory:\s*\/docs-site/u);
  assert.equal(rootManifest.scripts["docs:check"], "npm --prefix docs-site run check");
  assert.equal(rootManifest.scripts["docs:build"], "npm --prefix docs-site run build");
});
