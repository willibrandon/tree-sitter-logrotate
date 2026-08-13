import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import {
  listFiles,
  mediaType,
  npmRun,
  optionValue,
  packageMetadata,
  repositoryRoot,
  run,
  sha256,
} from "./release-common.mjs";
import { createReleaseSbom } from "./release-sbom.mjs";

const metadata = await packageMetadata();
const version = metadata.version;
const prefix = `tree-sitter-logrotate-${version}`;
const outputDirectory = resolve(repositoryRoot, optionValue("--output", "dist"));
const buildDirectory = resolve(repositoryRoot, process.env.RELEASE_BUILD_DIR ?? "build/release");
const suppliedWheels = optionValue("--python-wheels", undefined);
const suppliedNativeLibraries = optionValue("--native-libraries", undefined);
const rootWasm = resolve(repositoryRoot, "tree-sitter-logrotate.wasm");
let savedRootWasm;

const nativePlatform = (path) => {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  const architecture = normalized.includes("arm64") || normalized.includes("aarch64") ? "arm64" : normalized.includes("x64") || normalized.includes("x86_64") || normalized.includes("amd64") ? "x64" : undefined;
  const platform = normalized.includes("windows") || normalized.includes("win32") ? "win32" : normalized.includes("macos") || normalized.includes("darwin") ? "darwin" : normalized.includes("linux") ? "linux" : undefined;
  return platform === undefined || architecture === undefined ? undefined : `${platform}-${architecture}`;
};

const nativeLibraryName = (platform) => platform.startsWith("win32-")
  ? "tree-sitter-logrotate.dll"
  : platform.startsWith("darwin-")
    ? "libtree-sitter-logrotate.dylib"
    : "libtree-sitter-logrotate.so";

const wheelPlatform = (name) => {
  const normalized = name.toLowerCase();
  if (normalized.includes("win_amd64")) return "win32-x64";
  if (normalized.includes("macosx") && normalized.includes("arm64")) return "darwin-arm64";
  if ((normalized.includes("manylinux") || normalized.includes("musllinux")) && normalized.includes("aarch64")) return "linux-arm64";
  if ((normalized.includes("manylinux") || normalized.includes("musllinux")) && normalized.includes("x86_64")) return "linux-x64";
  return undefined;
};

if (outputDirectory === repositoryRoot || !outputDirectory.startsWith(`${repositoryRoot}/`)) {
  throw new Error("Release output must be a directory inside the repository.");
}

try {
  try {
    savedRootWasm = await readFile(rootWasm);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  await rm(outputDirectory, { recursive: true, force: true });
  await rm(buildDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(buildDirectory, { recursive: true });

  npmRun("check:versions");
  npmRun("check:generated");

  const wasmBuildDirectory = resolve(buildDirectory, "wasm");
  npmRun("build:wasm", [], { env: { ...process.env, TREE_SITTER_BUILD_DIR: wasmBuildDirectory } });
  const wasmName = `${prefix}.wasm`;
  await copyFile(resolve(wasmBuildDirectory, "tree-sitter-logrotate.wasm"), resolve(outputDirectory, wasmName));
  await copyFile(resolve(wasmBuildDirectory, "tree-sitter-logrotate.wasm"), rootWasm);

  const platformPrebuild = resolve(repositoryRoot, "prebuilds", `${process.platform}-${process.arch}`);
  try {
    await lstat(platformPrebuild);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    npmRun("package:node-prebuild");
  }
  if (suppliedNativeLibraries !== undefined) {
    for (const platform of ["linux-x64", "linux-arm64", "darwin-arm64", "win32-x64"]) {
      try {
        await lstat(resolve(repositoryRoot, "prebuilds", platform));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        throw new Error(`Missing Node prebuild for ${platform}.`);
      }
    }
  }

  const npmCli = process.env.npm_execpath ?? resolve(repositoryRoot, "node_modules/npm/bin/npm-cli.js");
  run(process.execPath, [npmCli, "pack", "--ignore-scripts", "--pack-destination", outputDirectory]);

  const cargoTarget = resolve(buildDirectory, "cargo");
  run("cargo", ["package", "--locked", "--no-verify", "--target-dir", cargoTarget]);
  await copyFile(
    resolve(cargoTarget, "package", `${prefix}.crate`),
    resolve(outputDirectory, `${prefix}.crate`),
  );

  const pythonArguments = ["-m", "build", "--sdist", "--no-isolation", "--outdir", outputDirectory];
  if (suppliedWheels === undefined) {
    pythonArguments.splice(3, 0, "--wheel");
  }
  run(process.env.PYTHON ?? "python3", pythonArguments);
  if (suppliedWheels !== undefined) {
    const wheelPlatforms = new Set();
    for (const path of await listFiles(resolve(repositoryRoot, suppliedWheels))) {
      if (path.endsWith(".whl")) {
        await copyFile(path, resolve(outputDirectory, basename(path)));
        const platform = wheelPlatform(basename(path));
        if (platform !== undefined) wheelPlatforms.add(platform);
      }
    }
    for (const platform of ["linux-x64", "linux-arm64", "darwin-arm64", "win32-x64"]) {
      if (!wheelPlatforms.has(platform)) throw new Error(`Missing Python wheel for ${platform}.`);
    }
  }

  const nativeInput = suppliedNativeLibraries === undefined
    ? resolve(buildDirectory, "native-local")
    : resolve(repositoryRoot, suppliedNativeLibraries);
  if (suppliedNativeLibraries === undefined) {
    npmRun("build:native", [], { env: { ...process.env, TREE_SITTER_BUILD_DIR: nativeInput } });
  }
  const nativeResources = resolve(buildDirectory, "java-resources");
  const nativePlatforms = new Set();
  for (const path of await listFiles(nativeInput)) {
    if (!/tree-sitter-logrotate\.(?:dll|dylib|so)$/u.test(path)) continue;
    const platform = suppliedNativeLibraries === undefined
      ? `${process.platform}-${process.arch}`
      : nativePlatform(relative(nativeInput, path));
    if (platform === undefined) {
      throw new Error(`Cannot determine the platform for ${relative(repositoryRoot, path)}.`);
    }
    if (nativePlatforms.has(platform)) {
      throw new Error(`More than one native library was supplied for ${platform}.`);
    }
    nativePlatforms.add(platform);
    const destination = resolve(nativeResources, "META-INF/native", platform, nativeLibraryName(platform));
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(path, destination);
  }
  if (nativePlatforms.size === 0) {
    throw new Error("No native parser libraries were available for the Java package.");
  }
  if (suppliedNativeLibraries !== undefined) {
    for (const platform of ["linux-x64", "linux-arm64", "darwin-arm64", "win32-x64"]) {
      if (!nativePlatforms.has(platform)) throw new Error(`Missing native parser library for ${platform}.`);
    }
  }

  const mavenOutput = resolve(buildDirectory, "maven");
  run("mvn", [
    "--batch-mode",
    "--no-transfer-progress",
    `-Dproject.build.directory=${mavenOutput}`,
    `-Dnative.resources.directory=${nativeResources}`,
    "-Dgpg.skip=true",
    "-Dnative.test.runtime=false",
    "-Dpublish.skip=true",
    "-DskipTests=true",
    "package",
  ]);
  for (const path of await listFiles(mavenOutput)) {
    if (path.endsWith(".jar") && basename(path).startsWith("jtreesitter-logrotate-")) {
      await copyFile(path, resolve(outputDirectory, basename(path)));
    }
  }
  await copyFile(resolve(repositoryRoot, "pom.xml"), resolve(outputDirectory, `jtreesitter-logrotate-${version}.pom`));

  const sourceStage = await mkdtemp(resolve(buildDirectory, "source-"));
  const sourceRoot = resolve(sourceStage, prefix);
  await mkdir(sourceRoot, { recursive: true });
  const listed = run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { capture: true }).stdout;
  for (const path of listed.split("\0").filter(Boolean).sort()) {
    const source = resolve(repositoryRoot, path);
    const destination = resolve(sourceRoot, path);
    await mkdir(dirname(destination), { recursive: true });
    try {
      await copyFile(source, destination);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const sourceArchive = resolve(outputDirectory, `${prefix}-source.tar.gz`);
  run("tar", [
    "--sort=name",
    "--mtime=@0",
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "-czf",
    sourceArchive,
    "-C",
    sourceStage,
    prefix,
  ]);

  const npmSbomName = `${prefix}-npm.cdx.json`;
  run(process.execPath, [
    resolve(repositoryRoot, "node_modules/@cyclonedx/cyclonedx-npm/bin/cyclonedx-npm-cli.js"),
    "--package-lock-only",
    "--omit",
    "dev",
    "--output-reproducible",
    "--spec-version",
    "1.6",
    "--output-format",
    "JSON",
    "--output-file",
    resolve(outputDirectory, npmSbomName),
    "--validate",
  ]);

  const distributablePaths = (await listFiles(outputDirectory)).filter(
    (path) => !path.endsWith("SHA256SUMS") && !path.endsWith("release-manifest.json"),
  );
  const components = [];
  for (const path of distributablePaths) {
    components.push({
      type: "file",
      name: basename(path),
      version,
      hashes: [{ alg: "SHA-256", content: await sha256(path) }],
    });
  }
  const releaseSbomName = `${prefix}-release.cdx.json`;
  await writeFile(
    resolve(outputDirectory, releaseSbomName),
    `${JSON.stringify(createReleaseSbom({ components, version }), null, 2)}\n`,
  );

  const artifactPaths = await listFiles(outputDirectory);
  const artifacts = [];
  for (const path of artifactPaths) {
    const stats = await lstat(path);
    artifacts.push({
      name: basename(path),
      mediaType: mediaType(path),
      sha256: await sha256(path),
      size: stats.size,
    });
  }
  const git = run("git", ["rev-parse", "HEAD"], { capture: true }).stdout.trim();
  await writeFile(
    resolve(outputDirectory, "release-manifest.json"),
    `${JSON.stringify({ schemaVersion: 1, name: metadata.name, version, tag: `v${version}`, treeSitterAbi: 15, git, nativePlatforms: [...nativePlatforms].sort(), artifacts }, null, 2)}\n`,
  );

  const checksumPaths = await listFiles(outputDirectory);
  const checksumLines = [];
  for (const path of checksumPaths) {
    checksumLines.push(`${await sha256(path)}  ${basename(path)}`);
  }
  await writeFile(resolve(outputDirectory, "SHA256SUMS"), `${checksumLines.sort().join("\n")}\n`);

  process.stdout.write(`Created ${String(checksumPaths.length + 1)} release files in ${relative(repositoryRoot, outputDirectory)}.\n`);
} finally {
  if (savedRootWasm === undefined) {
    await rm(rootWasm, { force: true });
  } else {
    await writeFile(rootWasm, savedRootWasm);
  }
}
