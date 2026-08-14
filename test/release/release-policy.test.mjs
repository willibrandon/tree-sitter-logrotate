import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  nativeLibraryName,
  nativePlatform,
  releasePlatforms,
  wheelPlatform,
} from "../../scripts/release-platforms.mjs";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("release artifacts are built from committed parser sources", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const builder = await read("scripts/build-release-artifacts.mjs");
  const verifier = await read("scripts/verify-release-artifacts.mjs");
  const consumer = await read("scripts/test-release-artifacts.mjs");
  const installer = await read("scripts/install-node-binding.mjs");
  const nodeBinding = await read("bindings/node/index.js");

  for (const script of [
    "package:node-prebuild",
    "package:release",
    "verify:release",
    "test:release",
    "check:release-tag",
  ]) {
    assert.equal(
      typeof packageJson.scripts[script],
      "string",
      `missing ${script}`,
    );
  }
  assert.doesNotMatch(builder, /tree-sitter\s+generate|npmRun\(["']generate/u);
  assert.match(`${builder}\n${verifier}`, /src\/parser\.c/u);
  assert.match(`${builder}\n${verifier}`, /src\/scanner\.c/u);
  assert.match(installer, /prebuilds/u);
  assert.match(installer, /\$\{process\.platform\}-\$\{process\.arch\}/u);
  assert.match(installer, /tree-sitter-logrotate\.node/u);
  assert.doesNotMatch(installer, /node-gyp-build/u);
  assert.match(nodeBinding, /node-gyp-build/u);
  assert.match(builder, /META-INF\/native/u);
  assert.match(
    verifier,
    /Java package does not contain a native parser library/u,
  );
  assert.match(builder, /releasePlatforms/u);
  assert.match(consumer, /maven-dependency-plugin:3\.11\.0:build-classpath/u);
  assert.match(consumer, /TREE_SITTER_BUILD_JAVA_TEST_RUNTIME=true/u);
  assert.match(consumer, /tree\.getRootNode\(\)\.hasError\(\)/u);
  assert.match(consumer, /TreeSitterLogrotate\.language\(\)/u);
  const releaseSource = `${builder}\n${verifier}`;
  for (const artifact of [
    ".tgz",
    ".crate",
    ".whl",
    ".jar",
    ".wasm",
    "source.tar.gz",
    "cdx.json",
    "SHA256SUMS",
  ]) {
    assert.ok(
      releaseSource.includes(artifact),
      `release source does not cover ${artifact}`,
    );
  }
});

test("release platform mapping recognizes every supported artifact", () => {
  assert.deepEqual(releasePlatforms, [
    "linux-x64",
    "linux-arm64",
    "darwin-arm64",
    "win32-x64",
    "win32-arm64",
  ]);

  assert.equal(
    nativePlatform("native-Windows-ARM64/tree-sitter-logrotate.dll"),
    "win32-arm64",
  );
  assert.equal(
    nativePlatform("native-Windows-X64/tree-sitter-logrotate.dll"),
    "win32-x64",
  );
  assert.equal(
    nativePlatform("native-Linux-ARM64/tree-sitter-logrotate.so"),
    "linux-arm64",
  );
  assert.equal(
    nativePlatform("native-Linux-X64/tree-sitter-logrotate.so"),
    "linux-x64",
  );
  assert.equal(
    nativePlatform("native-macOS-ARM64/tree-sitter-logrotate.dylib"),
    "darwin-arm64",
  );
  assert.equal(
    nativePlatform("native-unknown/tree-sitter-logrotate.so"),
    undefined,
  );

  assert.equal(
    wheelPlatform("tree_sitter_logrotate-0.1.3-cp310-abi3-win_arm64.whl"),
    "win32-arm64",
  );
  assert.equal(
    wheelPlatform("tree_sitter_logrotate-0.1.3-cp310-abi3-win_amd64.whl"),
    "win32-x64",
  );
  assert.equal(
    wheelPlatform(
      "tree_sitter_logrotate-0.1.3-cp310-abi3-manylinux_2_17_aarch64.whl",
    ),
    "linux-arm64",
  );
  assert.equal(
    wheelPlatform(
      "tree_sitter_logrotate-0.1.3-cp310-abi3-manylinux_2_17_x86_64.whl",
    ),
    "linux-x64",
  );
  assert.equal(
    wheelPlatform(
      "tree_sitter_logrotate-0.1.3-cp310-abi3-macosx_11_0_arm64.whl",
    ),
    "darwin-arm64",
  );
  assert.equal(
    wheelPlatform("tree_sitter_logrotate-0.1.3-py3-none-any.whl"),
    undefined,
  );

  assert.equal(nativeLibraryName("win32-arm64"), "tree-sitter-logrotate.dll");
  assert.equal(
    nativeLibraryName("darwin-arm64"),
    "libtree-sitter-logrotate.dylib",
  );
  assert.equal(nativeLibraryName("linux-arm64"), "libtree-sitter-logrotate.so");
});

test("Rust release packaging excludes ignored nested grammar sources", async () => {
  const manifest = await read("Cargo.toml");
  const builder = await read("scripts/build-release-artifacts.mjs");
  const packaged = spawnSync(
    "cargo",
    ["package", "--locked", "--allow-dirty", "--no-verify", "--list"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );

  assert.equal(packaged.status, 0, packaged.stderr);
  assert.match(manifest, /^\s*"\/grammar\.js",$/mu);
  assert.doesNotMatch(builder, /"--allow-dirty"/u);

  const files = packaged.stdout.trim().split("\n");
  assert.deepEqual(
    files.filter((path) => path.endsWith("grammar.js")),
    ["grammar.js"],
  );
  assert.equal(
    files.some(
      (path) => path.startsWith("node_modules/") || path.includes("/.build/"),
    ),
    false,
  );
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
  for (const platform of [
    "ubuntu-24.04",
    "ubuntu-24.04-arm",
    "macos-14",
    "windows-2025",
    "windows-11-vs2026-arm",
  ]) {
    assert.match(workflow, new RegExp(platform.replaceAll(".", "\\."), "u"));
  }
  assert.match(workflow, /os: windows-11-vs2026-arm\n\s+arch: ARM64/u);
  assert.match(
    workflow,
    /release-platforms:\n[\s\S]*?name: Required release artifact runners[\s\S]*?needs: \[node-prebuilds, native-libraries, python-wheels\][\s\S]*?if: \$\{\{ always\(\) \}\}[\s\S]*?needs\.(?:node-prebuilds|native-libraries|python-wheels)\.result/u,
  );
  assert.match(
    workflow,
    /assemble:\n[\s\S]*?needs: \[validate, validate-swift, release-platforms\]/u,
  );
  assert.equal(
    [...workflow.matchAll(/actions\/attest@[0-9a-f]{40}/gu)].length,
    2,
  );
  assert.doesNotMatch(workflow, /actions\/attest-(?:build-provenance|sbom)@/u);
  assert.match(workflow, /sha256sum --check SHA256SUMS/u);
  for (const environment of [
    "github-release",
    "npm",
    "pypi",
    "crates-io",
    "maven-central",
  ]) {
    assert.match(
      workflow,
      new RegExp(`(?:environment:|name:) ${environment}`, "u"),
    );
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
  assert.match(
    workflow,
    /NPM_BOOTSTRAP_TOKEN: \$\{\{ secrets\.NPM_BOOTSTRAP_TOKEN \}\}/u,
  );
  assert.match(
    workflow,
    /CRATES_IO_BOOTSTRAP_TOKEN: \$\{\{ secrets\.CRATES_IO_BOOTSTRAP_TOKEN \}\}/u,
  );
  assert.match(
    workflow,
    /name: Use the pinned npm version[\s\S]*npm install --global npm@12\.0\.2[\s\S]*npm --version/u,
  );
  assert.match(
    workflow,
    /if: env\.NPM_BOOTSTRAP_TOKEN == ''[\s\S]*npm publish[\s\S]*--provenance/u,
  );
  assert.equal(
    [
      ...workflow.matchAll(
        /npm publish \.\/dist\/tree-sitter-logrotate-\*\.tgz --access public --provenance/gu,
      ),
    ].length,
    2,
  );
  assert.doesNotMatch(workflow, /npm publish dist\//u);
  assert.match(
    workflow,
    /if: env\.CRATES_IO_BOOTSTRAP_TOKEN == ''[\s\S]*crates-auth\.outputs\.token/u,
  );
  assert.match(
    workflow,
    /if: env\.NPM_BOOTSTRAP_TOKEN != ''[\s\S]*NODE_AUTH_TOKEN/u,
  );
  assert.match(
    workflow,
    /if: env\.CRATES_IO_BOOTSTRAP_TOKEN != ''[\s\S]*CRATES_IO_TOKEN/u,
  );
  for (const reference of workflow.matchAll(/^\s+uses:\s+([^\s#]+)/gmu)) {
    assert.match(
      reference[1],
      /@[0-9a-f]{40}$/u,
      `${reference[1]} is not immutable`,
    );
  }
  for (const checkout of workflow.matchAll(
    /uses: actions\/checkout@[\s\S]*?(?=\n\s+- name:|\n\s{2}[a-z-]+:|$)/gu,
  )) {
    assert.match(checkout[0], /persist-credentials: false/u);
  }
});

test("release workflow resolves exactly one concrete SBOM before attestation", async () => {
  const workflow = await read(".github/workflows/release.yml");
  const attestationStart = workflow.indexOf(
    "      - name: Attest release SBOM",
  );
  const attestationEnd = workflow.indexOf(
    "\n      - name:",
    attestationStart + 1,
  );

  assert.notEqual(attestationStart, -1, "missing release SBOM attestation");
  assert.match(workflow, /id: release-sbom/u);
  assert.match(
    workflow,
    /node scripts\/locate-release-sbom\.mjs dist >> "\$GITHUB_OUTPUT"/u,
  );

  const attestation = workflow.slice(attestationStart, attestationEnd);
  assert.match(
    attestation,
    /sbom-path: \$\{\{ steps\.release-sbom\.outputs\.path \}\}/u,
  );
  assert.doesNotMatch(attestation, /sbom-path: .*\*/u);
});

test("npm recovery only publishes the attested artifact from the matching tagged release run", async () => {
  const workflow = await read(".github/workflows/recover-npm-release.yml");

  assert.match(workflow, /^permissions:\n  contents: read$/mu);
  assert.match(
    workflow,
    /workflow_dispatch:[\s\S]*release_run_id:[\s\S]*required: true[\s\S]*tag:[\s\S]*required: true/u,
  );
  assert.match(workflow, /environment:\n\s+name: npm/u);
  for (const permission of [
    "actions: read",
    "contents: read",
    "id-token: write",
  ]) {
    assert.match(workflow, new RegExp(permission, "u"));
  }
  assert.match(workflow, /ref: \$\{\{ inputs\.tag \}\}/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /run-id: \$\{\{ inputs\.release_run_id \}\}/u);
  assert.match(workflow, /github-token: \$\{\{ github\.token \}\}/u);
  assert.match(workflow, /Assemble and attest release/u);
  assert.match(workflow, /sha256sum --check SHA256SUMS/u);
  assert.match(
    workflow,
    /tarballs=\(\.\/dist\/tree-sitter-logrotate-\*\.tgz\)/u,
  );
  assert.match(
    workflow,
    /name: Verify the npm artifact\n\s+env:\n\s+GH_TOKEN: \$\{\{ github\.token \}\}/u,
  );
  assert.match(workflow, /gh attestation verify "\$tarball"/u);
  assert.match(
    workflow,
    /--signer-workflow "github\.com\/\$\{GITHUB_REPOSITORY\}\/\.github\/workflows\/release\.yml"/u,
  );
  assert.match(workflow, /--source-ref "refs\/tags\/\$\{RECOVERY_TAG\}"/u);
  assert.match(workflow, /--source-digest "\$\{SOURCE_SHA\}"/u);
  assert.match(
    workflow,
    /npm publish "\$tarball" --access public --provenance/u,
  );
  assert.doesNotMatch(workflow, /contents: write/u);
  for (const reference of workflow.matchAll(/^\s+uses:\s+([^\s#]+)/gmu)) {
    assert.match(
      reference[1],
      /@[0-9a-f]{40}$/u,
      `${reference[1]} is not immutable`,
    );
  }
});

test("release SBOM locator rejects ambiguous artifacts and emits one concrete path", async (context) => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "tree-sitter-logrotate-sbom-"),
  );
  const distribution = join(temporaryRoot, "dist");
  const locator = resolve(root, "scripts/locate-release-sbom.mjs");
  const run = () =>
    spawnSync(process.execPath, [locator, "dist"], {
      cwd: temporaryRoot,
      encoding: "utf8",
    });
  context.after(() => rm(temporaryRoot, { force: true, recursive: true }));
  await mkdir(distribution);

  let result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /found 0/u);

  const expected = join("dist", "tree-sitter-logrotate-0.1.0-release.cdx.json");
  await writeFile(join(temporaryRoot, expected), "{}\n");
  result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `path=${expected}\n`);

  await writeFile(
    join(distribution, "tree-sitter-logrotate-0.1.1-release.cdx.json"),
    "{}\n",
  );
  result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /found 2/u);
});

test("release CycloneDX SBOM has a reproducible UUID serial number accepted by attestors", async () => {
  const { createReleaseSbom } = await import("../../scripts/release-sbom.mjs");
  const input = {
    components: [{ type: "file", name: "parser.c", version: "0.1.0" }],
    version: "0.1.0",
  };

  const first = createReleaseSbom(input);
  const second = createReleaseSbom(input);
  const next = createReleaseSbom({ ...input, version: "0.1.1" });

  assert.equal(first.bomFormat, "CycloneDX");
  assert.equal(first.specVersion, "1.6");
  assert.match(
    first.serialNumber,
    /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  );
  assert.deepEqual(first, second);
  assert.notEqual(first.serialNumber, next.serialNumber);
  assert.deepEqual(first.components, input.components);
});

test("package metadata links source control without publishing a personal email address", async () => {
  const paths = [
    "package.json",
    "tree-sitter.json",
    "Cargo.toml",
    "pyproject.toml",
    "pom.xml",
  ];
  const sources = await Promise.all(paths.map(read));
  const packageMetadata = JSON.parse(sources[0]);
  const grammarMetadata = JSON.parse(sources[1]);
  const metadata = sources.join("\n");

  assert.equal(packageMetadata.author.url, "https://github.com/willibrandon");
  assert.equal(
    packageMetadata.repository.url,
    "git+https://github.com/willibrandon/tree-sitter-logrotate.git",
  );
  assert.equal(
    grammarMetadata.metadata.authors[0].url,
    "https://github.com/willibrandon",
  );
  assert.match(
    sources[2],
    /^repository = "https:\/\/github\.com\/willibrandon\/tree-sitter-logrotate"$/mu,
  );
  assert.match(
    sources[3],
    /^Source = "https:\/\/github\.com\/willibrandon\/tree-sitter-logrotate"$/mu,
  );
  assert.match(
    sources[4],
    /^\s*<scm>[\s\S]*?<url>https:\/\/github\.com\/willibrandon\/tree-sitter-logrotate<\/url>/mu,
  );
  assert.doesNotMatch(metadata, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/iu);
  assert.match(metadata, /io\.github\.willibrandon/u);
});

test("published package metadata uses portable documentation links", async () => {
  const documentationUrl =
    "https://willibrandon.github.io/tree-sitter-logrotate/";
  const readme = await read("README.md");
  const packageJson = JSON.parse(await read("package.json"));
  const cargo = await read("Cargo.toml");
  const python = await read("pyproject.toml");
  const maven = await read("pom.xml");
  const cmake = await read("CMakeLists.txt");
  const make = await read("Makefile");

  const markdownTargets = [...readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)].map(
    ([, target]) => target,
  );
  assert.ok(markdownTargets.length > 0, "README.md must contain useful links");
  for (const target of markdownTargets) {
    assert.match(
      target,
      /^(?:https:\/\/|#)/u,
      `package README contains a relative link: ${target}`,
    );
  }

  assert.equal(packageJson.homepage, documentationUrl);
  assert.match(
    cargo,
    /^homepage = "https:\/\/willibrandon\.github\.io\/tree-sitter-logrotate\/"$/mu,
  );
  assert.match(
    cargo,
    /^documentation = "https:\/\/willibrandon\.github\.io\/tree-sitter-logrotate\/"$/mu,
  );
  assert.match(
    python,
    /^Homepage = "https:\/\/willibrandon\.github\.io\/tree-sitter-logrotate\/"$/mu,
  );
  assert.match(
    python,
    /^Documentation = "https:\/\/willibrandon\.github\.io\/tree-sitter-logrotate\/"$/mu,
  );
  assert.match(
    maven,
    /^\s*<url>https:\/\/willibrandon\.github\.io\/tree-sitter-logrotate\/<\/url>$/mu,
  );
  assert.match(
    cmake,
    /^\s*HOMEPAGE_URL "https:\/\/willibrandon\.github\.io\/tree-sitter-logrotate\/"$/mu,
  );
  assert.match(
    make,
    /^HOMEPAGE_URL := https:\/\/willibrandon\.github\.io\/tree-sitter-logrotate\/$/mu,
  );
});
