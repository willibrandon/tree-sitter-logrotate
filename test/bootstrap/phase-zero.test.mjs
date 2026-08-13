import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const expectedVersion = "0.1.0";
const expectedNodeVersion = "24.19.0";
const expectedNpmVersion = "12.0.2";
const expectedTreeSitterVersion = "0.26.12";
const expectedUpstreamRevision = "3be1e9ccffe0c2245ed596183c74913d553f9f18";

async function readRequired(path) {
  const absolutePath = join(repositoryRoot, path);
  try {
    return await readFile(absolutePath, "utf8");
  } catch (error) {
    assert.fail(`Required Phase 0 file is missing or unreadable: ${path}\n${String(error)}`);
  }
}

async function readJson(path) {
  const source = await readRequired(path);
  try {
    return JSON.parse(source);
  } catch (error) {
    assert.fail(`Required Phase 0 JSON is invalid: ${path}\n${String(error)}`);
  }
}

async function assertRegularFiles(paths) {
  for (const path of paths) {
    const absolutePath = join(repositoryRoot, path);
    let fileStat;
    try {
      fileStat = await stat(absolutePath);
    } catch (error) {
      assert.fail(`Required official scaffold file is missing: ${path}\n${String(error)}`);
    }
    assert.equal(fileStat.isFile(), true, `Expected ${path} to be a regular file`);
    assert.ok(fileStat.size > 0, `Expected ${path} to be non-empty`);
  }
}

async function listFiles(path) {
  const result = [];
  const visit = async (absoluteDirectory) => {
    for (const entry of await readdir(absoluteDirectory, { withFileTypes: true })) {
      const absolutePath = join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        result.push(relative(repositoryRoot, absolutePath).replaceAll("\\", "/"));
      }
    }
  };
  await visit(join(repositoryRoot, path));
  return result.sort();
}

async function workflowSources() {
  const paths = (await listFiles(".github/workflows")).filter((path) => /\.ya?ml$/u.test(path));
  assert.ok(paths.length > 0, "Expected at least one GitHub Actions workflow");
  return Promise.all(paths.map(async (path) => ({ path, source: await readRequired(path) })));
}

function packageScript(packageJson, name) {
  const value = packageJson.scripts?.[name];
  assert.equal(typeof value, "string", `package.json must declare the ${name} script`);
  assert.ok(value.trim().length > 0, `package.json script ${name} must not be empty`);
  return value;
}

function exactTomlVersion(source, section, path) {
  const escapedSection = section.replaceAll(".", "\\.");
  const sectionMatch = source.match(
    new RegExp(`(?:^|\\n)\\[${escapedSection}\\]\\s*\\n([\\s\\S]*?)(?=\\n\\[|$)`, "u"),
  );
  assert.ok(sectionMatch, `${path} must contain [${section}]`);
  const versionMatch = sectionMatch[1].match(/(?:^|\n)version\s*=\s*["']([^"']+)["']/u);
  assert.ok(versionMatch, `${path} [${section}] must declare a version`);
  return versionMatch[1];
}

function assertExactDependencyVersion(packageJson, dependencyName, expected) {
  const value = packageJson.devDependencies?.[dependencyName] ?? packageJson.dependencies?.[dependencyName];
  assert.equal(value, expected, `${dependencyName} must be exactly pinned to ${expected}`);
  assert.doesNotMatch(value, /^[~^*]|\bx\b|latest|next/u);
}

function workflowUses(source) {
  return [...source.matchAll(/^\s*(?:-\s*)?uses:\s*["']?([^\s"']+)["']?\s*(?:#.*)?$/gmu)].map(
    (match) => match[1],
  );
}

function isImmutableUse(reference) {
  if (reference.startsWith("./")) {
    return true;
  }
  if (reference.startsWith("docker://")) {
    return /@sha256:[0-9a-f]{64}$/u.test(reference);
  }
  return /@[0-9a-f]{40}$/u.test(reference);
}

function checkoutStepBlocks(source) {
  const lines = source.split(/\r?\n/u);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*(?:-\s*)?uses:\s*actions\/checkout@/u.test(lines[index])) {
      continue;
    }
    const indent = lines[index].match(/^\s*/u)[0].length;
    const block = [lines[index]];
    for (let next = index + 1; next < lines.length; next += 1) {
      const nextIndent = lines[next].match(/^\s*/u)[0].length;
      if (/^\s*-\s+(?:name|uses|run):/u.test(lines[next]) && nextIndent <= indent) {
        break;
      }
      block.push(lines[next]);
    }
    blocks.push(block.join("\n"));
  }
  return blocks;
}

function hasReadOnlyTopLevelPermissions(source) {
  if (/^permissions:\s*read-all\s*$/mu.test(source)) {
    return true;
  }
  const block = source.match(/^permissions:\s*\n((?:^[ \t]+[^\n]+\n?)*)/mu)?.[1] ?? "";
  if (block.length === 0) {
    return false;
  }
  const entries = [...block.matchAll(/^\s+([\w-]+):\s*([^\s#]+)\s*(?:#.*)?$/gmu)];
  return entries.length > 0 && entries.every(([, , access]) => access === "read" || access === "none");
}

function isPullRequestWorkflow(source) {
  return /^\s*pull_request:\s*(?:$|\n)/mu.test(source);
}

function workflowJobBlocks(source) {
  const jobsStart = source.search(/^jobs:\s*$/mu);
  if (jobsStart < 0) {
    return [];
  }
  const jobsSource = source.slice(jobsStart + source.slice(jobsStart).indexOf("\n") + 1);
  const starts = [...jobsSource.matchAll(/^ {2}[A-Za-z0-9_-]+:\s*$/gmu)];
  return starts.map((match, index) => {
    const end = starts[index + 1]?.index ?? jobsSource.length;
    return jobsSource.slice(match.index, end);
  });
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function escapeRegularExpression(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function runNpmScript(name, outputDirectory) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawnSync(npmCommand, ["run", "--silent", name], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      TREE_SITTER_BUILD_DIR: outputDirectory,
    },
    shell: false,
    timeout: 120_000,
  });
}

function assertSuccessfulRun(result, description) {
  assert.equal(
    result.status,
    0,
    `${description} failed\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );
  assert.equal(result.signal, null, `${description} was terminated by ${String(result.signal)}`);
}

test("official scaffold exposes the expected grammar and binding surfaces", async () => {
  await assertRegularFiles([
    "grammar.js",
    "tree-sitter.json",
    "package.json",
    "package-lock.json",
    "Cargo.toml",
    "pyproject.toml",
    "pom.xml",
    "go.mod",
    "Package.swift",
    "build.zig",
    "CMakeLists.txt",
    "Makefile",
    "bindings/c/tree_sitter/tree-sitter-logrotate.h",
    "bindings/c/tree-sitter-logrotate.pc.in",
    "bindings/go/binding.go",
    "bindings/java/main/io/github/treesitter/jtreesitter/logrotate/TreeSitterLogrotate.java",
    "bindings/node/binding.cc",
    "bindings/node/index.js",
    "bindings/node/index.d.ts",
    "bindings/python/tree_sitter_logrotate/__init__.py",
    "bindings/rust/build.rs",
    "bindings/rust/lib.rs",
    "bindings/swift/TreeSitterLogrotate/logrotate.h",
    "src/grammar.json",
    "src/node-types.json",
    "src/parser.c",
    "src/tree_sitter/parser.h",
    "LICENSE",
  ]);

  const grammar = await readRequired("grammar.js");
  assert.match(grammar, /^\/\/ @ts-check$/mu);
  assert.match(grammar, /^\/\/\/ <reference types=["']tree-sitter-cli\/dsl["'] \/>$/mu);
  assert.match(grammar, /export\s+default\s+grammar\s*\(/u);
  assert.match(grammar, /name:\s*["']logrotate["']/u);

  const configuration = await readJson("tree-sitter.json");
  assert.equal(configuration.$schema, "https://tree-sitter.github.io/tree-sitter/assets/schemas/config.schema.json");
  assert.equal(configuration.grammars?.length, 1);
  assert.equal(configuration.grammars[0].name, "logrotate");
  assert.equal(configuration.grammars[0].scope, "source.logrotate");
  assert.equal(configuration.metadata?.license, "MIT");
  assert.deepEqual(Object.keys(configuration.bindings ?? {}).sort(), [
    "c",
    "go",
    "java",
    "node",
    "python",
    "rust",
    "swift",
    "zig",
  ]);

  const parser = await readRequired("src/parser.c");
  assert.match(parser, /^#define LANGUAGE_VERSION 15$/mu);
  assert.match(parser, /tree_sitter_logrotate\s*\(/u);

  const license = await readRequired("LICENSE");
  assert.match(license, /^MIT License$/mu);
  assert.match(license, /Permission is hereby granted, free of charge/u);
  assert.match(license, /THE SOFTWARE IS PROVIDED [“"]AS IS[”"]/u);

  const packageJson = await readJson("package.json");
  assert.equal(packageJson.name, "tree-sitter-logrotate");
  assert.equal(packageJson.license, "MIT");
});

test("toolchain and upstream inputs are immutable and mutually consistent", async () => {
  const packageJson = await readJson("package.json");
  const packageLock = await readJson("package-lock.json");
  const toolchains = await readJson("toolchains.json");
  const nvmrc = (await readRequired(".nvmrc")).trim();
  const dockerfile = await readRequired(".devcontainer/Dockerfile");
  const developmentConfiguration = await readJson(".devcontainer/devcontainer.json");
  const workflows = await workflowSources();
  const automationSource = [
    dockerfile,
    JSON.stringify(developmentConfiguration),
    ...workflows.map(({ source }) => source),
  ].join("\n");

  assert.equal(nvmrc, expectedNodeVersion);
  assert.equal(toolchains.node, expectedNodeVersion);
  assert.equal(toolchains.npm, expectedNpmVersion);
  assert.equal(toolchains.treeSitter, expectedTreeSitterVersion);
  assert.equal(toolchains.treeSitterAbi, 15);
  assert.equal(toolchains.logrotateRevision, expectedUpstreamRevision);
  assert.match(toolchains.llvm, /^\d+\.\d+\.\d+$/u);
  assert.equal(packageJson.engines?.node, expectedNodeVersion);
  assert.equal(packageJson.packageManager, `npm@${expectedNpmVersion}`);
  assert.equal(packageLock.lockfileVersion, 3);
  assert.equal(packageLock.packages?.[""]?.name, packageJson.name);
  assert.equal(packageLock.packages?.[""]?.version, expectedVersion);
  assertExactDependencyVersion(packageJson, "tree-sitter-cli", expectedTreeSitterVersion);

  assert.match(automationSource, new RegExp(`(?:NODE_VERSION|node)[:=\"' ]+v?${expectedNodeVersion.replaceAll(".", "\\.")}`, "iu"));
  assert.match(automationSource, new RegExp(`(?:NPM_VERSION|npm)[:=\"' @]+${expectedNpmVersion.replaceAll(".", "\\.")}`, "iu"));
  assert.match(automationSource, new RegExp(`(?:TREE_SITTER_VERSION|tree-sitter-cli|tree-sitter)[:=\"' @]+v?${expectedTreeSitterVersion.replaceAll(".", "\\.")}`, "iu"));
  assert.match(automationSource, /(?:CLANG|LLVM|CC)(?:_VERSION)?[=:"' ]+\d+(?:\.\d+){0,2}/iu);
  assert.match(automationSource, new RegExp(expectedUpstreamRevision, "u"));
  assert.doesNotMatch(automationSource, /(?:NODE_VERSION|TREE_SITTER_VERSION|LOGROTATE_REVISION)[=:"' ]+(?:latest|main|master|stable|next)\b/iu);
});

test("all package and binding manifests share version 0.1.0", async () => {
  const packageJson = await readJson("package.json");
  const packageLock = await readJson("package-lock.json");
  const treeSitterConfiguration = await readJson("tree-sitter.json");
  const cargo = await readRequired("Cargo.toml");
  const python = await readRequired("pyproject.toml");
  const maven = await readRequired("pom.xml");

  assert.equal(packageJson.version, expectedVersion);
  assert.equal(packageLock.version, expectedVersion);
  assert.equal(packageLock.packages?.[""]?.version, expectedVersion);
  assert.equal(treeSitterConfiguration.metadata?.version, expectedVersion);
  assert.equal(exactTomlVersion(cargo, "package", "Cargo.toml"), expectedVersion);
  assert.equal(exactTomlVersion(python, "project", "pyproject.toml"), expectedVersion);

  const projectVersion = maven.match(/<project[\s\S]*?<version>([^<]+)<\/version>/u)?.[1];
  assert.equal(projectVersion, expectedVersion, "pom.xml project version must align with 0.1.0");
});

test("generation commands are explicit, ABI 15, isolated, and drift detecting", async () => {
  const packageJson = await readJson("package.json");
  const generate = packageScript(packageJson, "generate");
  const checkGenerated = packageScript(packageJson, "check:generated");
  packageScript(packageJson, "check:versions");
  packageScript(packageJson, "test:bootstrap");

  assert.match(generate, /tree-sitter\s+generate/u);
  assert.match(generate, /--abi(?:=|\s+)15\b/u);
  assert.match(checkGenerated, /check-generated/u);

  const checkerPath = [...checkGenerated.matchAll(/(?:^|\s)(?:\.\/)?([^\s"']*check-generated\.mjs)\b/gu)][0]?.[1];
  assert.ok(checkerPath, "check:generated must call a dedicated cross-platform Node script");
  const checker = await readRequired(checkerPath);
  assert.match(checker, /mkdtemp|tmpdir/u, "generation checking must use an isolated temporary directory");
  assert.match(checker, /--output/u, "generation checking must redirect generated output");
  assert.match(checker, /parser\.c/u);
  assert.match(checker, /grammar\.json/u);
  assert.match(checker, /node-types\.json/u);
  assert.match(checker, /tree_sitter\/alloc\.h/u);
  assert.match(checker, /tree_sitter\/array\.h/u);
  assert.match(checker, /tree_sitter\/parser\.h/u);
  assert.match(checker, /(?:not reproducible|out of date|diff|mismatch|changed)/iu);

  const workflows = await workflowSources();
  const ciSource = workflows.map(({ source }) => source).join("\n");
  assert.match(ciSource, /npm\s+run\s+check:generated/u);
  assert.match(ciSource, /git\s+diff\s+--(?:exit-code|quiet)/u);
});

test("declared generation verification succeeds without modifying generated artifacts", async () => {
  const generatedPaths = ["src/parser.c", "src/grammar.json", "src/node-types.json"];
  const before = new Map();
  for (const path of generatedPaths) {
    before.set(path, sha256(await readRequired(path)));
  }

  const outputDirectory = await mkdtemp(join(tmpdir(), "tree-sitter-logrotate-generate-"));
  try {
    const result = runNpmScript("check:generated", outputDirectory);
    assertSuccessfulRun(result, "npm run check:generated");
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }

  for (const path of generatedPaths) {
    assert.equal(
      sha256(await readRequired(path)),
      before.get(path),
      `check:generated must not modify committed ${path}`,
    );
  }
});

test("native and WASM build commands are declared and exercised by CI", async () => {
  const packageJson = await readJson("package.json");
  const native = packageScript(packageJson, "build:native");
  const wasm = packageScript(packageJson, "build:wasm");
  assert.match(native, /(?:tree-sitter\s+build|build-native)/u);
  assert.match(wasm, /(?:--wasm|build-wasm)/u);

  const ciSource = (await workflowSources()).map(({ source }) => source).join("\n");
  assert.match(ciSource, /npm\s+run\s+build:native/u);
  assert.match(ciSource, /npm\s+run\s+build:wasm/u);
  assert.match(ciSource, /npm\s+run\s+check:generated/u);
});

test("empty grammar builds native and WASM artifacts into an isolated output directory", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "tree-sitter-logrotate-build-"));
  try {
    const nativeResult = runNpmScript("build:native", outputDirectory);
    assertSuccessfulRun(nativeResult, "npm run build:native");
    const wasmResult = runNpmScript("build:wasm", outputDirectory);
    assertSuccessfulRun(wasmResult, "npm run build:wasm");

    const artifacts = (await listAbsoluteFiles(outputDirectory)).map((path) => relative(outputDirectory, path));
    assert.ok(
      artifacts.some((path) => /\.(?:so|dylib|dll)$/u.test(path)),
      `Expected an isolated native library, found: ${artifacts.join(", ")}`,
    );
    assert.ok(
      artifacts.some((path) => /\.wasm$/u.test(path)),
      `Expected an isolated WASM parser, found: ${artifacts.join(", ")}`,
    );
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

async function listAbsoluteFiles(directory) {
  const result = [];
  const visit = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        result.push(path);
      }
    }
  };
  await visit(directory);
  return result;
}

test("development container is reproducible, credential-free, and isolates host outputs", async () => {
  const dockerfile = await readRequired(".devcontainer/Dockerfile");
  const configuration = await readJson(".devcontainer/devcontainer.json");
  const dockerignore = await readRequired(".dockerignore");
  const serialized = JSON.stringify(configuration);

  assert.match(dockerfile, /^ARG\s+BASE_IMAGE=[^\s]+@sha256:[0-9a-f]{64}$/mu);
  assert.match(dockerfile, /^FROM\s+\$\{BASE_IMAGE\}$/mu);
  for (const pin of ["NODE_VERSION", "NPM_VERSION", "TREE_SITTER_VERSION", "LOGROTATE_REVISION"]) {
    assert.match(dockerfile, new RegExp(`^ARG\\s+${pin}=[^\\s]+$`, "mu"));
  }
  assert.match(dockerfile, /^ARG\s+(?:CLANG|LLVM)(?:_VERSION)?=[^\s]+$/mu);
  assert.doesNotMatch(dockerfile, /\b(?:latest|main|master|stable|next)\b/iu);

  assert.equal(configuration.build?.dockerfile, "Dockerfile");
  assert.ok(Array.isArray(configuration.mounts), "devcontainer.json must declare isolated mounts");
  const mounts = configuration.mounts.map((mount) => (typeof mount === "string" ? mount : JSON.stringify(mount)));
  assert.ok(
    mounts.some((mount) => /type=volume/u.test(mount) && /target=[^,]*\/node_modules(?:,|$)/u.test(mount)),
    "node_modules must live in a named volume rather than the host worktree",
  );
  assert.ok(
    mounts.some((mount) => /type=volume/u.test(mount) && /(?:target|dst|destination)=[^,]*(?:cache|build|target)/iu.test(mount)),
    "native build output or dependency caches must live in a named volume",
  );
  assert.match(serialized, /TREE_SITTER_BUILD_DIR/u);
  assert.doesNotMatch(serialized, /(?:GITHUB_TOKEN|GH_TOKEN|NPM_TOKEN|\.ssh|\.gnupg|docker\.sock)/iu);
  assert.doesNotMatch(dockerfile, /(?:GITHUB_TOKEN|GH_TOKEN|NPM_TOKEN|COPY\s+\.ssh|COPY\s+\.git)/iu);

  for (const excluded of [".git", ".env", "node_modules", "build", "target", ".cache", "*.pem", "*.key"]) {
    assert.match(dockerignore, new RegExp(`^${excluded.replaceAll(".", "\\.").replaceAll("*", ".*")}(?:/)?$`, "mu"));
  }
});

test("Node binding installation preserves an isolated build mount", async () => {
  const packageJson = await readJson("package.json");
  assert.equal(packageScript(packageJson, "install"), "node scripts/install-node-binding.mjs");

  const directory = await mkdtemp(join(tmpdir(), "tree-sitter-logrotate-node-install-"));
  const buildDirectory = join(directory, "build");
  const staleArtifact = join(buildDirectory, "stale.node");
  const fakeNodeGyp = join(directory, "node-gyp.mjs");
  const commandLog = join(directory, "node-gyp.log");

  try {
    await mkdir(buildDirectory);
    await writeFile(staleArtifact, "stale", "utf8");
    await writeFile(
      fakeNodeGyp,
      'import { appendFileSync } from "node:fs";\nappendFileSync(process.env.NODE_GYP_LOG, `${process.argv[2]}\\n`);\n',
      "utf8",
    );
    const before = await stat(buildDirectory);

    const result = spawnSync(process.execPath, [join(repositoryRoot, "scripts/install-node-binding.mjs")], {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_GYP_LOG: commandLog,
        npm_config_node_gyp: fakeNodeGyp,
      },
      shell: false,
      timeout: 30_000,
    });

    assert.equal(result.status, 0, `Node binding installer failed:\n${result.stdout}\n${result.stderr}`);
    const after = await stat(buildDirectory);
    assert.equal(after.isDirectory(), true);
    assert.equal(after.ino, before.ino, "The build mount root must not be deleted and recreated");
    await assert.rejects(stat(staleArtifact), { code: "ENOENT" });
    assert.deepEqual((await readFile(commandLog, "utf8")).trim().split("\n"), ["configure", "build"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("native development documentation covers the complete bootstrap workflow", async () => {
  const readme = await readRequired("README.md");
  const contributing = await readRequired("CONTRIBUTING.md");
  const containerReadme = await readRequired(".devcontainer/README.md");
  const nativeDevelopment = await readRequired("docs/native-development.md");
  const documentation = `${readme}\n${contributing}\n${containerReadme}\n${nativeDevelopment}`;

  for (const prerequisite of ["Node.js 24.19.0", "npm 12.0.2", "Tree-sitter 0.26.12", "C compiler", "Emscripten"]) {
    assert.match(documentation, new RegExp(prerequisite.replaceAll(".", "\\."), "iu"));
  }
  for (const command of [
    "npm ci",
    "npm run generate",
    "npm run check:generated",
    "npm run build:native",
    "npm run build:wasm",
    "npm run test:bootstrap",
  ]) {
    assert.match(documentation, new RegExp(escapeRegularExpression(command), "u"));
  }
  assert.match(containerReadme, /(?:named volume|isolated output|outside the .*worktree)/iu);
  assert.match(contributing, /(?:generated files|parser\.c).*(?:do not edit|never edit|generated)/iu);
});

test("pull request automation follows least-privilege supply-chain policy", async () => {
  const workflows = await workflowSources();
  const allReferences = [];

  for (const { path, source } of workflows) {
    assert.doesNotMatch(source, /^\s*pull_request_target:/mu, `${path} must not execute pull-request code with target privileges`);
    for (const reference of workflowUses(source)) {
      allReferences.push({ path, reference });
      assert.equal(isImmutableUse(reference), true, `${path} must pin ${reference} to an immutable commit or digest`);
    }
    for (const block of checkoutStepBlocks(source)) {
      assert.match(block, /persist-credentials:\s*false/u, `${path} checkout must disable persisted credentials`);
    }
    if (isPullRequestWorkflow(source)) {
      assert.equal(hasReadOnlyTopLevelPermissions(source), true, `${path} pull-request permissions must be read-only`);
      assert.doesNotMatch(source, /\$\{\{\s*secrets\./u, `${path} pull-request jobs must not reference secrets`);
    }
  }

  assert.ok(allReferences.length > 0, "Expected workflows to use reviewed actions");
  assert.ok(allReferences.some(({ reference }) => reference.startsWith("actions/checkout@")));
});

test("security automation covers dependencies, code, secrets, sanitizers, and fuzzing", async () => {
  const workflows = await workflowSources();
  const all = workflows.map(({ path, source }) => `${path}\n${source}`).join("\n");
  const dependabot = await readRequired(".github/dependabot.yml");

  assert.match(all, /actions\/dependency-review-action@[0-9a-f]{40}/u);
  assert.match(all, /github\/codeql-action\/(?:init|analyze)@[0-9a-f]{40}/u);
  assert.match(all, /willibrandon\/picket[^@]*@[0-9a-f]{40}|\bpicket\s+scan\b/iu);
  assert.match(all, /docker\s+save\b/iu);
  assert.match(all, /picket[\s\S]*--docker-archive\b/iu);
  assert.match(all, /(?:-fsanitize=(?:address,undefined|undefined,address)|ASAN_OPTIONS|UndefinedBehaviorSanitizer)/u);

  const fuzzWorkflow = workflows.find(({ path, source }) => /fuzz/iu.test(path) || /tree-sitter\s+fuzz/iu.test(source));
  assert.ok(fuzzWorkflow, "A fuzz workflow is required");
  assert.match(fuzzWorkflow.source, /^\s*schedule:/mu);
  assert.match(fuzzWorkflow.source, /tree-sitter\s+fuzz|fuzz-action|workflows\/fuzz/iu);

  assert.match(dependabot, /package-ecosystem:\s*["']?npm["']?/u);
  assert.match(dependabot, /package-ecosystem:\s*["']?github-actions["']?/u);
  assert.match(dependabot, /interval:\s*["']?(?:weekly|monthly)["']?/u);
});

test("CI declares the required cross-platform and compatibility surfaces", async () => {
  const workflows = await workflowSources();
  const ciWorkflows = workflows
    .filter(({ path, source }) => /ci|test|build/iu.test(path) || /build:native/u.test(source))
  const ci = ciWorkflows.map(({ source }) => source).join("\n");
  const compatibility = await readRequired("docs/compatibility.md");

  assert.match(ci, /ubuntu-(?:22\.04|24\.04|[0-9]{4})/u);
  assert.match(ci, /macos-(?:14|15|[0-9]{2})/u);
  assert.match(ci, /windows-(?:2022|2025|[0-9]{4})/u);
  assert.match(ci, /npm\s+ci/u);
  assert.match(ci, /npm\s+run\s+check:generated/u);
  assert.match(ci, /npm\s+run\s+build:native/u);
  assert.match(ci, /npm\s+run\s+build:wasm/u);

  const crossPlatformJob = ciWorkflows
    .flatMap(({ source }) => workflowJobBlocks(source))
    .find((job) => /\$\{\{\s*matrix\.os\s*\}\}/u.test(job));
  assert.ok(crossPlatformJob, "CI must run one build job over an operating-system matrix");
  assert.match(crossPlatformJob, /ubuntu-(?:22\.04|24\.04|[0-9]{4})/u);
  assert.match(crossPlatformJob, /macos-(?:14|15|[0-9]{2})/u);
  assert.match(crossPlatformJob, /windows-(?:2022|2025|[0-9]{4})/u);
  for (const command of ["check:generated", "build:native", "build:wasm"]) {
    assert.match(crossPlatformJob, new RegExp(`npm\\s+run\\s+${escapeRegularExpression(command)}`, "u"));
  }

  for (const requiredSurface of [
    /Linux.*x64.*arm64/iu,
    /macOS.*arm64/iu,
    /Windows.*x64/iu,
    /Node.*browser/iu,
    /Neovim.*stable.*development/iu,
    /Helix.*stable.*main/iu,
    /Zed.*stable.*development/iu,
  ]) {
    assert.match(compatibility, requiredSurface);
  }
});
