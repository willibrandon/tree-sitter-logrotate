import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const expectedVersion = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8")).version;
const expectedNodeVersion = "24.19.0";
const expectedNpmVersion = "12.0.2";
const expectedTreeSitterVersion = "0.26.12";
const expectedMavenVersion = "3.9.16";
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
  const npmCli = process.env.npm_execpath;
  assert.equal(typeof npmCli, "string", "npm_execpath must identify npm's JavaScript entry point");
  const timeout = name === "build:wasm" ? 300_000 : 120_000;
  return spawnSync(process.execPath, [npmCli, "run", "--silent", name], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      TREE_SITTER_BUILD_DIR: outputDirectory,
    },
    shell: false,
    timeout,
  });
}

function assertSuccessfulRun(result, description) {
  const processError = result.error === undefined ? "" : `\nprocess error:\n${String(result.error.stack ?? result.error)}`;
  assert.equal(
    result.status,
    0,
    `${description} failed${processError}\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
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
  assert.equal(configuration.grammars?.length, 2);
  assert.equal(configuration.grammars[0].name, "logrotate");
  assert.equal(configuration.grammars[0].scope, "source.logrotate");
  assert.equal(configuration.grammars[1].name, "logrotate_state");
  assert.equal(configuration.grammars[1].scope, "source.logrotate.state");
  assert.equal(configuration.grammars[1].path, "src/state");
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

test("Maven IDE metadata covers the native test lifecycle executions", async () => {
  const pom = await readRequired("pom.xml");
  assert.match(
    pom,
    /<artifactId>lifecycle-mapping<\/artifactId>[\s\S]*?<artifactId>exec-maven-plugin<\/artifactId>[\s\S]*?<versionRange>\[3\.0\.0,4\.0\.0\)<\/versionRange>[\s\S]*?<goal>exec<\/goal>[\s\S]*?<ignore\s*\/>/u,
  );
  assert.match(pom, /<id>configure-native-test-libraries<\/id>/u);
  assert.match(pom, /<id>build-native-test-libraries<\/id>/u);
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

test("all package and binding manifests share one version", async () => {
  const packageJson = await readJson("package.json");
  const packageLock = await readJson("package-lock.json");
  const treeSitterConfiguration = await readJson("tree-sitter.json");
  const cargo = await readRequired("Cargo.toml");
  const cargoLock = await readRequired("Cargo.lock");
  const python = await readRequired("pyproject.toml");
  const maven = await readRequired("pom.xml");
  const cmake = await readRequired("CMakeLists.txt");
  const makefile = await readRequired("Makefile");
  const zig = await readRequired("build.zig.zon");
  const bindingsDocumentation = await readRequired("docs-site/src/content/docs/bindings.md");

  assert.equal(packageJson.version, expectedVersion);
  assert.equal(packageLock.version, expectedVersion);
  assert.equal(packageLock.packages?.[""]?.version, expectedVersion);
  assert.equal(treeSitterConfiguration.metadata?.version, expectedVersion);
  assert.equal(exactTomlVersion(cargo, "package", "Cargo.toml"), expectedVersion);
  assert.equal(
    cargoLock.match(/\[\[package\]\]\nname\s*=\s*"tree-sitter-logrotate"\nversion\s*=\s*"([^"]+)"/u)?.[1],
    expectedVersion,
  );
  assert.equal(exactTomlVersion(python, "project", "pyproject.toml"), expectedVersion);

  const projectVersion = maven.match(/<project[\s\S]*?<version>([^<]+)<\/version>/u)?.[1];
  assert.equal(projectVersion, expectedVersion, "pom.xml project version must align");
  assert.equal(cmake.match(/VERSION\s+"([^"]+)"/u)?.[1], expectedVersion);
  assert.equal(makefile.match(/^VERSION\s*:=\s*([^\s]+)$/mu)?.[1], expectedVersion);
  assert.equal(zig.match(/\.version\s*=\s*"([^"]+)"/u)?.[1], expectedVersion);
  assert.equal(
    bindingsDocumentation.match(/<artifactId>jtreesitter-logrotate<\/artifactId>\s*<version>([^<]+)<\/version>/u)?.[1],
    expectedVersion,
  );
  assert.equal(
    bindingsDocumentation.match(
      /\.package\(\s*url: "https:\/\/github\.com\/willibrandon\/tree-sitter-logrotate",\s*from: "([^"]+)"/u,
    )?.[1],
    expectedVersion,
  );
});

test("release versioning updates every version-bearing manifest", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "tree-sitter-logrotate-version-"));
  const nextVersion = "9.8.7";
  const paths = [
    "package.json",
    "package-lock.json",
    "tree-sitter.json",
    "Cargo.toml",
    "Cargo.lock",
    "pyproject.toml",
    "pom.xml",
    "CMakeLists.txt",
    "Makefile",
    "build.zig.zon",
    "docs-site/src/content/docs/bindings.md",
    "scripts/set-version.mjs",
  ];
  context.after(() => rm(directory, { force: true, recursive: true }));
  await mkdir(join(directory, "scripts"));
  await mkdir(join(directory, "docs-site/src/content/docs"), { recursive: true });
  await Promise.all(paths.map((path) => copyFile(join(repositoryRoot, path), join(directory, path))));

  const result = spawnSync(process.execPath, ["scripts/set-version.mjs", nextVersion], {
    cwd: directory,
    encoding: "utf8",
  });
  assertSuccessfulRun(result, "release versioning");

  const readTemporary = (path) => readFile(join(directory, path), "utf8");
  const packageJson = JSON.parse(await readTemporary("package.json"));
  const packageLock = JSON.parse(await readTemporary("package-lock.json"));
  const treeSitterConfiguration = JSON.parse(await readTemporary("tree-sitter.json"));
  const cargo = await readTemporary("Cargo.toml");
  const cargoLock = await readTemporary("Cargo.lock");
  const python = await readTemporary("pyproject.toml");
  const maven = await readTemporary("pom.xml");
  const cmake = await readTemporary("CMakeLists.txt");
  const makefile = await readTemporary("Makefile");
  const zig = await readTemporary("build.zig.zon");
  const bindingsDocumentation = await readTemporary("docs-site/src/content/docs/bindings.md");

  assert.equal(packageJson.version, nextVersion);
  assert.equal(packageLock.version, nextVersion);
  assert.equal(packageLock.packages?.[""]?.version, nextVersion);
  assert.equal(treeSitterConfiguration.metadata?.version, nextVersion);
  assert.equal(exactTomlVersion(cargo, "package", "Cargo.toml"), nextVersion);
  assert.equal(
    cargoLock.match(/\[\[package\]\]\nname\s*=\s*"tree-sitter-logrotate"\nversion\s*=\s*"([^"]+)"/u)?.[1],
    nextVersion,
  );
  assert.equal(exactTomlVersion(python, "project", "pyproject.toml"), nextVersion);
  assert.equal(maven.match(/<project[\s\S]*?<version>([^<]+)<\/version>/u)?.[1], nextVersion);
  assert.equal(cmake.match(/VERSION\s+"([^"]+)"/u)?.[1], nextVersion);
  assert.equal(makefile.match(/^VERSION\s*:=\s*([^\s]+)$/mu)?.[1], nextVersion);
  assert.equal(zig.match(/\.version\s*=\s*"([^"]+)"/u)?.[1], nextVersion);
  assert.equal(
    bindingsDocumentation.match(/<artifactId>jtreesitter-logrotate<\/artifactId>\s*<version>([^<]+)<\/version>/u)?.[1],
    nextVersion,
  );
  assert.equal(
    bindingsDocumentation.match(
      /\.package\(\s*url: "https:\/\/github\.com\/willibrandon\/tree-sitter-logrotate",\s*from: "([^"]+)"/u,
    )?.[1],
    nextVersion,
  );
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

test("CMake invokes the pinned local Tree-sitter CLI through Node", async () => {
  const cmake = await readRequired("CMakeLists.txt");

  assert.match(cmake, /find_program\(NODE_EXECUTABLE\s+node\b/u);
  assert.match(cmake, /node_modules\/tree-sitter-cli\/cli\.js/u);
  assert.match(cmake, /COMMAND\s+\$\{TREE_SITTER_CLI_COMMAND\}\s+generate/u);
  assert.doesNotMatch(cmake, /find_program\(TREE_SITTER_CLI\s+tree-sitter\b/u);
});

test("CMake installs the native parser on Unix and Windows", async () => {
  const cmake = await readRequired("CMakeLists.txt");
  const bindingTest = await readRequired("scripts/test-c-binding.mjs");

  assert.match(cmake, /WINDOWS_EXPORT_ALL_SYMBOLS\s+ON/u);
  assert.match(cmake, /ARCHIVE DESTINATION "\$\{CMAKE_INSTALL_LIBDIR\}"/u);
  assert.match(cmake, /LIBRARY DESTINATION "\$\{CMAKE_INSTALL_LIBDIR\}"/u);
  assert.match(cmake, /RUNTIME DESTINATION "\$\{CMAKE_INSTALL_BINDIR\}"/u);
  assert.match(bindingTest, /tree-sitter-logrotate\.dll/u);
  assert.match(bindingTest, /libtree-sitter-logrotate\.dylib/u);
  assert.match(bindingTest, /libtree-sitter-logrotate\.so/u);
  assert.match(bindingTest, /run\("cmake", \["--install", buildDirectory\]\)/u);
});

test("Node build scripts use verified local generation paths without a command shim", async () => {
  const runner = await readRequired("scripts/tree-sitter-cli.mjs");
  const directCliScripts = await Promise.all(
    ["scripts/check-generated.mjs", "scripts/build-wasm.mjs"].map(readRequired),
  );
  const nativeBuild = await readRequired("scripts/build-native.mjs");

  assert.match(runner, /node_modules\/tree-sitter-cli\/cli\.js/u);
  assert.match(runner, /spawnSync\(process\.execPath/u);
  assert.match(runner, /shell:\s*false/u);
  for (const source of directCliScripts) {
    assert.match(source, /runTreeSitter/u);
    assert.doesNotMatch(source, /spawnSync\(["']tree-sitter["']/u);
  }
  assert.match(nativeBuild, /run\("cmake"/u);
  assert.match(nativeBuild, /--target["'],\s*["']tree-sitter-logrotate/u);
  assert.doesNotMatch(nativeBuild, /spawnSync\(["']tree-sitter["']/u);
});

test("Swift binding tests clean their isolated scratch products", async () => {
  const packageJson = await readJson("package.json");
  const script = packageScript(packageJson, "test:bindings:swift");

  assert.match(script, /^swift package clean --scratch-path build\/bindings\/swift/u);
  assert.match(script, /swift test --scratch-path build\/bindings\/swift$/u);
});

test("WASM builds retry only transient WASI SDK download failures", async () => {
  const source = await readRequired("scripts/build-wasm.mjs");

  assert.match(source, /maximumDownloadAttempts\s*=\s*3/u);
  assert.match(source, /Failed to download wasi-sdk/u);
  assert.match(source, /!wasiDownloadFailed/u);
  assert.match(source, /setTimeout/u);
});

test("CI dependency installation retries only recognized network failures", async () => {
  const packageJson = await readJson("package.json");
  const script = packageScript(packageJson, "ci:install");
  const installer = await readRequired("scripts/ci-install.mjs");
  const workflows = (await workflowSources()).map(({ source }) => source).join("\n");

  assert.equal(script, "node scripts/ci-install.mjs");
  assert.match(installer, /spawnSync\(process\.execPath/u);
  assert.match(installer, /npmCli,\s*["']ci["']/u);
  assert.match(installer, /ECONNRESET/u);
  assert.match(installer, /!networkFailure/u);
  assert.match(installer, /maximumAttempts\s*=\s*3/u);
  assert.doesNotMatch(workflows, /^\s*run:\s*npm\s+ci\s*$/mu);
  assert.match(workflows, /npm\s+run\s+ci:install/u);
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

test("VS Code C and C++ configuration remains portable across development hosts", async () => {
  const configuration = await readJson(".vscode/c_cpp_properties.json");
  assert.ok(Array.isArray(configuration.configurations));
  assert.ok(configuration.configurations.length > 0);

  for (const entry of configuration.configurations) {
    assert.equal(
      entry.compilerPath,
      undefined,
      `${String(entry.name)} must let the C/C++ extension discover the host compiler`,
    );
    assert.equal(
      entry.intelliSenseMode,
      undefined,
      `${String(entry.name)} must let the C/C++ extension select the host IntelliSense mode`,
    );
    assert.deepEqual(entry.includePath, [
      "${workspaceFolder}/src/**",
      "${workspaceFolder}/.venv/include/**",
    ]);
  }
});

test("development container is reproducible, credential-free, and isolates host outputs", async () => {
  const dockerfile = await readRequired(".devcontainer/Dockerfile");
  const zshConfiguration = await readRequired(".devcontainer/zshrc");
  const configuration = await readJson(".devcontainer/devcontainer.json");
  const dockerignore = await readRequired(".dockerignore");
  const gitignore = await readRequired(".gitignore");
  const serialized = JSON.stringify(configuration);

  assert.match(dockerfile, /^ARG\s+BASE_IMAGE=[^\s]+@sha256:[0-9a-f]{64}$/mu);
  assert.match(dockerfile, /^FROM\s+\$\{BASE_IMAGE\}$/mu);
  for (const pin of ["NODE_VERSION", "NPM_VERSION", "TREE_SITTER_VERSION", "LOGROTATE_REVISION"]) {
    assert.match(dockerfile, new RegExp(`^ARG\\s+${pin}=[^\\s]+$`, "mu"));
  }
  assert.match(dockerfile, /^ARG\s+(?:CLANG|LLVM)(?:_VERSION)?=[^\s]+$/mu);
  assert.doesNotMatch(dockerfile, /\b(?:latest|main|master|stable|next)\b/iu);
  assert.match(dockerfile, /^\s*bash-completion\s+\\$/mu);
  assert.match(dockerfile, /^\s*locales\s+\\$/mu);
  assert.match(dockerfile, /^\s*zsh\s+\\$/mu);
  assert.match(dockerfile, /^\s*zsh-autosuggestions\s+\\$/mu);
  assert.match(dockerfile, /^\s*LANG=en_US\.UTF-8\s+\\$/mu);
  assert.match(dockerfile, /en_US\.UTF-8 UTF-8/u);
  assert.match(dockerfile, /locale-gen\s+\\/u);
  assert.match(dockerfile, /COPY --chmod=0644 \.devcontainer\/zshrc \/etc\/zsh\/zshrc/u);
  assert.match(zshConfiguration, /ZSH_AUTOSUGGEST_STRATEGY=\(history completion\)/u);
  assert.match(zshConfiguration, /eval "\$\(dircolors -b\)"/u);
  assert.match(zshConfiguration, /alias ls='ls --color=tty'/u);
  assert.equal((await readRequired(".npmrc")).trim(), "omit=optional");
  assert.match(await readRequired(".devcontainer/post-create.sh"), /^npm ci$/mu);
  const packageJson = await readJson("package.json");
  assert.deepEqual(
    {
      ajv: packageJson.devDependencies?.ajv,
      "ajv-formats": packageJson.devDependencies?.["ajv-formats"],
      "ajv-formats-draft2019": packageJson.devDependencies?.["ajv-formats-draft2019"],
    },
    {
      ajv: "8.20.0",
      "ajv-formats": "3.0.1",
      "ajv-formats-draft2019": "1.6.1",
    },
  );
  assert.match(dockerfile, /useradd[^\n]+--shell \/bin\/zsh vscode/u);
  assert.match(zshConfiguration, /autoload -Uz add-zsh-hook compinit vcs_info/u);
  assert.match(
    zshConfiguration,
    /%B%F\{39\}%m%f%b\$\{TREE_SITTER_LOGROTATE_LOCATION\}\$\{vcs_info_msg_0_\}/u,
  );
  assert.match(zshConfiguration, /RPROMPT='%F\{66\}%D\{%H:%M:%S\}%f'/u);
  assert.match(zshConfiguration, /"\$\{PWD\}" == "\$\{repo_root\}"/u);
  assert.match(zshConfiguration, /TREE_SITTER_LOGROTATE_DIRTY/u);
  assert.match(
    zshConfiguration,
    /formats ' %F\{76\}%b%f'[\s\S]+TREE_SITTER_LOGROTATE_DIRTY=' %F\{178\}!%f'/u,
  );
  assert.doesNotMatch(zshConfiguration, /dirty_count|wc -l/u);
  assert.deepEqual(configuration.runArgs, ["--hostname", "vscode"]);

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
  assert.match(serialized, /MAVEN_ARGS.*project\.build\.directory.*\.devcontainer-output\/maven/u);
  for (const name of [
    "CARGO_TARGET_DIR",
    "MAVEN_ARGS",
    "PYTHONPYCACHEPREFIX",
    "TREE_SITTER_BUILD_DIR",
  ]) {
    assert.match(
      configuration.containerEnv?.[name] ?? "",
      /\$\{containerWorkspaceFolder\}\/\.devcontainer-output\//u,
      `${name} must follow the mounted workspace instead of assuming its directory name`,
    );
  }
  assert.doesNotMatch(serialized, /\/workspaces\/tree-sitter-logrotate/u);
  assert.equal(
    mounts.some((mount) => /target=[^,]*\/target(?:,|$)/u.test(mount)),
    false,
    "Maven target must not be a volume root because mvn clean deletes the directory",
  );
  assert.doesNotMatch(serialized, /(?:GITHUB_TOKEN|GH_TOKEN|NPM_TOKEN|\.ssh|\.gnupg|docker\.sock)/iu);
  assert.doesNotMatch(dockerfile, /(?:GITHUB_TOKEN|GH_TOKEN|NPM_TOKEN|COPY\s+\.ssh|COPY\s+\.git)/iu);
  assert.match(gitignore, /^\.devcontainer-output\/$/mu);
  const terminalSettings = configuration.customizations?.vscode?.settings;
  assert.equal(terminalSettings?.["cmake.buildDirectory"], "${workspaceFolder}/.devcontainer-output/cmake");
  assert.equal(terminalSettings?.["cmake.configureOnOpen"], true);
  assert.equal(terminalSettings?.["cmake.enableAutomaticKitScan"], false);
  assert.equal(terminalSettings?.["cmake.generator"], "Ninja");
  assert.equal(terminalSettings?.["cmake.useCMakePresets"], "never");
  assert.equal(terminalSettings?.["terminal.integrated.shellIntegration.enabled"], true);
  assert.equal(terminalSettings?.["terminal.integrated.suggest.enabled"], false);
  assert.equal(
    terminalSettings?.["terminal.integrated.suggest.inlineSuggestion"],
    undefined,
  );
  assert.equal(terminalSettings?.["terminal.integrated.suggest.quickSuggestions"], undefined);
  assert.ok(
    configuration.customizations?.vscode?.extensions?.includes(
      "willibrandon.logrotate@0.1.9",
    ),
    "the pre-release Logrotate extension must be installed at its published version",
  );
  assert.equal(
    terminalSettings?.["terminal.integrated.suggest.suggestOnTriggerCharacters"],
    undefined,
  );

  for (const excluded of [".git", ".env", "node_modules", "build", "target", ".cache", "*.pem", "*.key"]) {
    assert.match(dockerignore, new RegExp(`^${excluded.replaceAll(".", "\\.").replaceAll("*", ".*")}(?:/)?$`, "mu"));
  }
});

test("development container runs Maven clean with removable isolated output", async () => {
  const dockerfile = await readRequired(".devcontainer/Dockerfile");
  const pom = await readRequired("pom.xml");
  const verification = await readRequired(".devcontainer/verify.sh");
  const toolchains = await readJson("toolchains.json");

  assert.equal(toolchains.maven, expectedMavenVersion);
  assert.match(dockerfile, new RegExp(`^ARG\\s+MAVEN_VERSION=${escapeRegularExpression(expectedMavenVersion)}$`, "mu"));
  assert.match(dockerfile, /^ARG\s+MAVEN_SHA512=[0-9a-f]{128}$/mu);
  assert.match(pom, /<project\.build\.directory>target<\/project\.build\.directory>/u);
  assert.match(pom, /<directory>\$\{project\.build\.directory\}<\/directory>/u);
  assert.match(verification, /mvn\s+--batch-mode\s+--no-transfer-progress\s+clean\s+test/u);
});

test("development container includes the Swift compiler runtime used by tests", async () => {
  const dockerfile = await readRequired(".devcontainer/Dockerfile");

  assert.match(dockerfile, /COPY --from=swift_toolchain \/usr\/lib\/clang\/ \/usr\/lib\/clang\//u);
  assert.match(dockerfile, /COPY --from=swift_toolchain \/usr\/lib\/libIndexStore\.so\* \/usr\/lib\//u);
});

test("development container includes every release verification tool", async () => {
  const dockerfile = await readRequired(".devcontainer/Dockerfile");
  const verification = await readRequired(".devcontainer/verify.sh");

  assert.match(dockerfile, /^\s*unzip\s+\\$/mu);
  assert.match(verification, /^command -v unzip >\/dev\/null$/mu);
  assert.match(verification, /npm run verify:release/u);
});

test("Node binding installation rebuilds a stale local binding without replacing its mount", async () => {
  const packageJson = await readJson("package.json");
  assert.equal(packageScript(packageJson, "install"), "node scripts/install-node-binding.mjs");
  assert.equal(
    packageScript(packageJson, "test:bindings:node"),
    "npm run build:node && node --test bindings/node/*_test.js",
  );

  const directory = await mkdtemp(join(tmpdir(), "tree-sitter-logrotate-node-install-"));
  const buildDirectory = join(directory, "build");
  const staleArtifact = join(buildDirectory, "Release/tree_sitter_logrotate_binding.node");
  const fakeNodeGyp = join(directory, "node-gyp.mjs");
  const commandLog = join(directory, "node-gyp.log");

  try {
    const installedBinding = createRequire(import.meta.url)("node-gyp-build").path(repositoryRoot);
    await mkdir(dirname(staleArtifact), { recursive: true });
    await mkdir(join(directory, "prebuilds"));
    await copyFile(installedBinding, staleArtifact);
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

test("Node prebuilds use a removable workspace below the isolated build mount", async () => {
  const packageJson = await readJson("package.json");
  assert.equal(packageScript(packageJson, "package:node-prebuild"), "node scripts/build-node-prebuild.mjs");
  assert.equal(
    packageJson.devDependencies?.["node-gyp"],
    "13.0.1",
    "prebuildify must not select an older transitive node-gyp that cannot detect Visual Studio 2026",
  );

  const script = await readRequired("scripts/build-node-prebuild.mjs");
  assert.match(script, /TREE_SITTER_BUILD_DIR/u);
  assert.match(script, /resolve\(isolatedOutputRoot, "node-prebuild"\)/u);
  assert.match(script, /"--cwd",\s*stagingDirectory/u);
  assert.match(script, /"--out",\s*stagingDirectory/u);
  assert.match(script, /"--node-gyp",\s*nodeGyp/u);
  assert.match(script, /cp\(resolve\(stagingDirectory, "prebuilds", entry\.name\), destination/u);
  assert.doesNotMatch(script, /rm\(resolve\(repositoryRoot, "build"\)/u);

  const ci = await readRequired(".github/workflows/ci.yml");
  const crossPlatformJob = workflowJobBlocks(ci).find((job) =>
    /\$\{\{\s*matrix\.os\s*\}\}/u.test(job),
  );
  assert.ok(crossPlatformJob, "CI must run one build job over an operating-system matrix");
  assert.match(
    crossPlatformJob,
    /npm\s+run\s+package:node-prebuild/u,
    "every supported native CI host must build the Node precompiled binding",
  );

  const configuration = await readJson(".devcontainer/devcontainer.json");
  const postCreate = await readRequired(".devcontainer/post-create.sh");
  const mounts = configuration.mounts.map((mount) =>
    typeof mount === "string" ? mount : JSON.stringify(mount),
  );
  assert.ok(
    mounts.some(
      (mount) =>
        /type=volume/u.test(mount) && /target=[^,]*\/prebuilds(?:,|$)/u.test(mount),
    ),
    "prebuilds must live in a named volume rather than the host worktree",
  );
  assert.match(
    postCreate,
    /"\$workspace_root\/prebuilds" \\/u,
    "the container user must own the isolated prebuild volume",
  );

  const directory = await mkdtemp(join(tmpdir(), "tree-sitter-logrotate-prebuild-"));
  const buildDirectory = join(directory, "build");
  const isolatedOutput = join(directory, "isolated-output");
  const staleArtifact = join(buildDirectory, "stale.node");
  const fakePrebuildify = join(directory, "node_modules/prebuildify/bin.js");
  const fakeNodeGyp = join(
    directory,
    "node_modules/.bin",
    process.platform === "win32" ? "node-gyp.cmd" : "node-gyp",
  );
  const argumentsLog = join(directory, "prebuildify-arguments.json");

  try {
    await mkdir(join(directory, "bindings/node"), { recursive: true });
    await mkdir(join(directory, "src/tree_sitter"), { recursive: true });
    await mkdir(dirname(fakePrebuildify), { recursive: true });
    await mkdir(dirname(fakeNodeGyp), { recursive: true });
    await mkdir(buildDirectory);
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ name: "tree-sitter-logrotate", engines: { node: expectedNodeVersion } }),
      "utf8",
    );
    for (const path of [
      "binding.gyp",
      "bindings/node/binding.cc",
      "src/parser.c",
      "src/scanner.c",
      "src/tree_sitter/parser.h",
    ]) {
      await writeFile(join(directory, path), "fixture", "utf8");
    }
    await writeFile(staleArtifact, "must survive", "utf8");
    await writeFile(fakeNodeGyp, "fixture", "utf8");
    await writeFile(
      fakePrebuildify,
      [
        'import { mkdir, rename, writeFile } from "node:fs/promises";',
        'import { join } from "node:path";',
        'const valueAfter = (name) => process.argv[process.argv.indexOf(name) + 1];',
        'const cwd = valueAfter("--cwd");',
        'const out = valueAfter("--out");',
        'await writeFile(process.env.PREBUILD_ARGUMENTS_LOG, JSON.stringify(process.argv.slice(2)));',
        'const addon = join(cwd, "build/Release/tree-sitter-logrotate.node");',
        'const output = join(out, "prebuilds/linux-x64/tree-sitter-logrotate.node");',
        'await mkdir(join(cwd, "build/Release"), { recursive: true });',
        'await mkdir(join(out, "prebuilds/linux-x64"), { recursive: true });',
        'await writeFile(addon, "prebuilt");',
        'await rename(addon, output);',
      ].join("\n"),
      "utf8",
    );
    const before = await stat(buildDirectory);

    const result = spawnSync(process.execPath, [join(repositoryRoot, "scripts/build-node-prebuild.mjs")], {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        PREBUILD_ARGUMENTS_LOG: argumentsLog,
        TREE_SITTER_BUILD_DIR: isolatedOutput,
      },
      shell: false,
      timeout: 30_000,
    });

    assert.equal(result.status, 0, `Node prebuild failed:\n${result.stdout}\n${result.stderr}`);
    const after = await stat(buildDirectory);
    assert.equal(after.ino, before.ino, "The build mount root must not be deleted and recreated");
    assert.equal(await readFile(staleArtifact, "utf8"), "must survive");
    assert.equal(
      await readFile(join(directory, "prebuilds/linux-x64/tree-sitter-logrotate.node"), "utf8"),
      "prebuilt",
    );
    await assert.rejects(stat(join(isolatedOutput, "node-prebuild")), { code: "ENOENT" });
    const invokedArguments = JSON.parse(await readFile(argumentsLog, "utf8"));
    assert.equal(invokedArguments[invokedArguments.indexOf("--cwd") + 1], join(isolatedOutput, "node-prebuild"));
    assert.equal(invokedArguments[invokedArguments.indexOf("--out") + 1], join(isolatedOutput, "node-prebuild"));
    const invokedNodeGyp = invokedArguments[invokedArguments.indexOf("--node-gyp") + 1];
    assert.equal(await realpath(invokedNodeGyp), await realpath(fakeNodeGyp));
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

  for (const prerequisite of ["Node.js 24.19.0", "npm 12.0.2", "Tree-sitter(?: CLI)? 0.26.12", "C compiler", "Emscripten"]) {
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
  const devcontainerWorkflow = workflows.find(
    ({ path }) => path === ".github/workflows/devcontainer.yml",
  );
  assert.ok(devcontainerWorkflow, "The development container workflow is required");
  assert.match(devcontainerWorkflow.source, /willibrandon\/picket@[0-9a-f]{40}/u);
  assert.match(devcontainerWorkflow.source, /docker-archive:\s*\$\{\{\s*runner\.temp\s*\}\}\/devcontainer\.tar/u);
  assert.match(all, /(?:-fsanitize=(?:address,undefined|undefined,address)|ASAN_OPTIONS|UndefinedBehaviorSanitizer)/u);

  const fuzzWorkflow = workflows.find(({ path, source }) => /fuzz/iu.test(path) || /tree-sitter\s+fuzz/iu.test(source));
  assert.ok(fuzzWorkflow, "A fuzz workflow is required");
  assert.match(fuzzWorkflow.source, /^\s*schedule:/mu);
  assert.match(fuzzWorkflow.source, /tree-sitter\s+fuzz|npm\s+run\s+test:fuzz|fuzz-action|workflows\/fuzz/iu);

  assert.match(dependabot, /package-ecosystem:\s*["']?npm["']?/u);
  assert.match(dependabot, /package-ecosystem:\s*["']?github-actions["']?/u);
  assert.match(dependabot, /interval:\s*["']?(?:weekly|monthly)["']?/u);
});

test("upstream Tree-sitter checks satisfy downstream parser requirements", async () => {
  const packageJson = await readJson("package.json");
  const ci = await readRequired(".github/workflows/ci.yml");
  const fuzz = await readRequired(".github/workflows/fuzz.yml");

  assert.equal(
    packageScript(packageJson, "test:parser"),
    "tree-sitter test --grammar-path . && tree-sitter test --grammar-path src/state",
  );
  assert.match(ci, /tree-sitter\/setup-action\/cli@[0-9a-f]{40}/u);
  assert.match(ci, /tree-sitter\/parser-test-action@[0-9a-f]{40}/u);
  assert.match(ci, /tree-sitter-ref:\s*v0\.26\.12/u);
  assert.match(ci, /abi-version:\s*["']?15["']?/u);
  assert.match(
    ci,
    /test-parser-cmd: tree-sitter test --grammar-path \. && tree-sitter test --grammar-path src\/state/u,
  );
  assert.match(ci, /tree-sitter-logrotate_state\.so["']? src\/state/u);
  assert.match(ci, /ts_query_ls\/releases\/download\/v3\.16\.0/u);
  assert.match(ci, /35859176141c3ebaac231000fd96d50a14c6bc26963f0a1662aac33f656d443d/u);
  assert.match(ci, /ts_query_ls[^\n]*check\s+--format/u);
  assert.match(ci, /^\s+queries\/$/mu);
  assert.match(ci, /required:\n[\s\S]*?needs:[\s\S]*?upstream-parser[\s\S]*?query-validation/u);

  assert.match(fuzz, /tree-sitter\/fuzz-action@[0-9a-f]{40}/u);
});

test("CodeQL traces only the hand-written C scanner", async () => {
  const codeql = await readRequired(".github/workflows/codeql.yml");

  assert.match(codeql, /language:\s*c-cpp[\s\S]*?build-mode:\s*manual/u);
  assert.match(codeql, /cc\s+-std=c11[\s\S]*?-c\s+src\/scanner\.c/u);
  assert.doesNotMatch(codeql, /npm\s+run\s+build:native/u);
  assert.doesNotMatch(codeql, /src\/parser\.c/u);
});

test("CI declares the required cross-platform and compatibility surfaces", async () => {
  const workflows = await workflowSources();
  const ciWorkflows = workflows
    .filter(({ path, source }) => /ci|test|build/iu.test(path) || /build:native/u.test(source));
  const ci = ciWorkflows.map(({ source }) => source).join("\n");
  const compatibility = await readRequired("docs/compatibility.md");

  assert.match(ci, /ubuntu-(?:22\.04|24\.04|[0-9]{4})/u);
  assert.match(ci, /macos-(?:14|15|[0-9]{2})/u);
  assert.match(ci, /windows-(?:2022|2025|[0-9]{4})/u);
  assert.match(ci, /windows-11-vs2026-arm/u);
  assert.match(ci, /npm\s+run\s+ci:install/u);
  assert.match(ci, /npm\s+run\s+check:generated/u);
  assert.match(ci, /npm\s+run\s+build:native/u);
  assert.match(ci, /npm\s+run\s+build:wasm/u);
  assert.match(ci, /npm\s+run\s+test:neovim/u);
  assert.match(ci, /68ea43cd0c28af25cd47731308c94fedfcfd1b0b/u);
  assert.match(ci, /1c9002a70ebcc77ddec169d779fea6f64ccf755a/u);
  assert.match(ci, /a06c2e4415e9bc0346c6b86d401879ffb44058f7/u);
  assert.match(ci, /a1bcffc8095c142ad1f7a9671a4ae180333f9209/u);
  assert.match(ci, /NVIM_TREESITTER_RUNTIME/u);
  assert.match(ci, /npm exec --yes --allow-scripts=tree-sitter-cli/u);
  assert.match(ci, /tree-sitter-cli@\$\{TREE_SITTER_VERSION\}/u);

  const crossPlatformJob = ciWorkflows
    .flatMap(({ source }) => workflowJobBlocks(source))
    .find((job) => /\$\{\{\s*matrix\.os\s*\}\}/u.test(job));
  assert.ok(crossPlatformJob, "CI must run one build job over an operating-system matrix");
  assert.match(crossPlatformJob, /ubuntu-(?:22\.04|24\.04|[0-9]{4})/u);
  assert.match(crossPlatformJob, /macos-(?:14|15|[0-9]{2})/u);
  assert.match(crossPlatformJob, /windows-(?:2022|2025|[0-9]{4})/u);
  assert.match(crossPlatformJob, /windows-11-vs2026-arm/u);
  for (const command of ["check:generated", "build:native", "build:wasm"]) {
    assert.match(crossPlatformJob, new RegExp(`npm\\s+run\\s+${escapeRegularExpression(command)}`, "u"));
  }

  const requiredCiJob = ciWorkflows
    .flatMap(({ source }) => workflowJobBlocks(source))
    .find((job) => /name:\s*Required CI/u.test(job));
  assert.ok(requiredCiJob, "CI must expose one stable check that requires every test runner");
  assert.match(requiredCiJob, /if:\s*\$\{\{\s*always\(\)\s*\}\}/u);
  for (const dependency of [
    "build",
    "fixtures",
    "wasm-browser",
    "neovim",
    "tree-sitter-cli",
    "go",
    "python",
    "rust",
    "swift",
    "zig",
    "java",
    "sanitizers",
    "performance",
  ]) {
    const resultReference = dependency.includes("-")
      ? `needs\\[['\"]${escapeRegularExpression(dependency)}['\"]\\]\\.result`
      : `needs\\.${escapeRegularExpression(dependency)}\\.result`;
    assert.match(requiredCiJob, new RegExp(resultReference, "u"));
  }
  assert.match(requiredCiJob, /success/u);

  for (const requiredSurface of [
    /Linux.*x64.*arm64/iu,
    /macOS.*arm64/iu,
    /Windows.*x64.*arm64/iu,
    /Node.*browser/iu,
    /Neovim.*stable.*development/iu,
    /Helix.*stable.*main/iu,
    /Zed.*stable.*development/iu,
  ]) {
    assert.match(compatibility, requiredSurface);
  }
});
