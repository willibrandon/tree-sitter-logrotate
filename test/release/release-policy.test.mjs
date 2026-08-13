import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("release artifacts are built from committed parser sources", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const builder = await read("scripts/build-release-artifacts.mjs");
  const verifier = await read("scripts/verify-release-artifacts.mjs");
  const consumer = await read("scripts/test-release-artifacts.mjs");
  const installer = await read("scripts/install-node-binding.mjs");

  for (const script of ["package:node-prebuild", "package:release", "verify:release", "test:release", "check:release-tag"]) {
    assert.equal(typeof packageJson.scripts[script], "string", `missing ${script}`);
  }
  assert.doesNotMatch(builder, /tree-sitter\s+generate|npmRun\(["']generate/u);
  assert.match(`${builder}\n${verifier}`, /src\/parser\.c/u);
  assert.match(`${builder}\n${verifier}`, /src\/scanner\.c/u);
  assert.match(installer, /prebuilds/u);
  assert.match(installer, /node-gyp-build/u);
  assert.match(builder, /META-INF\/native/u);
  assert.match(verifier, /Java package does not contain a native parser library/u);
  assert.match(consumer, /maven-dependency-plugin:3\.11\.0:build-classpath/u);
  assert.match(consumer, /TREE_SITTER_BUILD_JAVA_TEST_RUNTIME=true/u);
  assert.match(consumer, /tree\.getRootNode\(\)\.hasError\(\)/u);
  assert.match(consumer, /TreeSitterLogrotate\.language\(\)/u);
  const releaseSource = `${builder}\n${verifier}`;
  for (const artifact of [".tgz", ".crate", ".whl", ".jar", ".wasm", "source.tar.gz", "cdx.json", "SHA256SUMS"]) {
    assert.ok(releaseSource.includes(artifact), `release source does not cover ${artifact}`);
  }
});

test("release workflow publishes through protected, least-privilege jobs", async () => {
  const workflow = await read(".github/workflows/release.yml");

  assert.match(workflow, /^permissions:\n  contents: read$/mu);
  assert.match(workflow, /tags:\n\s+- "v\[0-9\]\+\.\[0-9\]\+\.\[0-9\]\+"/u);
  assert.match(workflow, /npm run package:release/u);
  assert.match(workflow, /npm run test:release/u);
  assert.match(workflow, /TREE_SITTER_FIXTURES_FETCH: always/u);
  assert.match(workflow, /^  native-libraries:$/mu);
  assert.match(workflow, /--native-libraries build\/native-libraries/u);
  assert.match(workflow, /unzip -q .*META-INF\/native/u);
  assert.match(workflow, /-Dnative\.resources\.directory=/u);
  for (const artifact of [
    "jtreesitter-logrotate-\\$\\{version\\}\\.jar",
    "jtreesitter-logrotate-\\$\\{version\\}-sources\\.jar",
    "jtreesitter-logrotate-\\$\\{version\\}-javadoc\\.jar",
    "jtreesitter-logrotate-\\$\\{version\\}\\.pom",
  ]) {
    assert.match(workflow, new RegExp(`cmp .*${artifact}`, "u"));
  }
  for (const platform of ["ubuntu-24.04", "ubuntu-24.04-arm", "macos-14", "windows-2025"]) {
    assert.match(workflow, new RegExp(platform.replaceAll(".", "\\."), "u"));
  }
  assert.match(workflow, /actions\/attest-build-provenance@[0-9a-f]{40}/u);
  assert.match(workflow, /actions\/attest-sbom@[0-9a-f]{40}/u);
  assert.match(workflow, /sha256sum --check SHA256SUMS/u);
  for (const environment of ["github-release", "npm", "pypi", "crates-io", "maven-central"]) {
    assert.match(workflow, new RegExp(`(?:environment:|name:) ${environment}`, "u"));
  }
  const jobStarts = [...workflow.matchAll(/^ {2}([a-z][a-z-]+):$/gmu)];
  for (const job of ["publish-npm", "publish-pypi", "publish-crates"]) {
    const jobIndex = jobStarts.findIndex((match) => match[1] === job);
    assert.notEqual(jobIndex, -1);
    const start = jobStarts[jobIndex].index;
    const end = jobStarts[jobIndex + 1]?.index ?? workflow.length;
    const block = workflow.slice(start, end);
    assert.match(block, /id-token: write/u);
  }
  for (const reference of workflow.matchAll(/^\s+uses:\s+([^\s#]+)/gmu)) {
    assert.match(reference[1], /@[0-9a-f]{40}$/u, `${reference[1]} is not immutable`);
  }
  for (const checkout of workflow.matchAll(/uses: actions\/checkout@[\s\S]*?(?=\n\s+- name:|\n\s{2}[a-z-]+:|$)/gu)) {
    assert.match(checkout[0], /persist-credentials: false/u);
  }
});

test("package metadata links GitHub without publishing a personal email address", async () => {
  const paths = ["package.json", "tree-sitter.json", "Cargo.toml", "pyproject.toml", "pom.xml"];
  const metadata = (await Promise.all(paths.map(read))).join("\n");
  assert.ok(metadata.includes("https://github.com/willibrandon"));
  assert.doesNotMatch(metadata, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/iu);
  assert.match(metadata, /io\.github\.willibrandon/u);
});
