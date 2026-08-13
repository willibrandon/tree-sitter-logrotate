import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { optionValue, packageMetadata, repositoryRoot, run, sha256 } from "./release-common.mjs";

const metadata = await packageMetadata();
const version = metadata.version;
const prefix = `tree-sitter-logrotate-${version}`;
const outputDirectory = resolve(repositoryRoot, optionValue("--output", "dist"));
const names = (await readdir(outputDirectory)).sort();

const requireMatch = (expression, description) => {
  const matches = names.filter((name) => expression.test(name));
  if (matches.length === 0) throw new Error(`Missing ${description} in ${outputDirectory}.`);
  return matches;
};

requireMatch(new RegExp(`^tree-sitter-logrotate-${version.replaceAll(".", "\\.")}\\.tgz$`, "u"), "npm package");
requireMatch(new RegExp(`^${prefix.replaceAll(".", "\\.")}\\.crate$`, "u"), "Rust crate");
requireMatch(new RegExp(`^tree_sitter_logrotate-${version.replaceAll(".", "\\.")}-.+\\.whl$`, "u"), "Python wheel");
requireMatch(new RegExp(`^tree_sitter_logrotate-${version.replaceAll(".", "\\.")}\\.tar\\.gz$`, "u"), "Python source distribution");
requireMatch(new RegExp(`^jtreesitter-logrotate-${version.replaceAll(".", "\\.")}\\.jar$`, "u"), "Java JAR");
requireMatch(new RegExp(`^jtreesitter-logrotate-${version.replaceAll(".", "\\.")}-sources\\.jar$`, "u"), "Java sources JAR");
requireMatch(new RegExp(`^jtreesitter-logrotate-${version.replaceAll(".", "\\.")}-javadoc\\.jar$`, "u"), "Java Javadoc JAR");
for (const name of [
  `${prefix}.wasm`,
  `${prefix}-source.tar.gz`,
  `${prefix}-npm.cdx.json`,
  `${prefix}-release.cdx.json`,
  "release-manifest.json",
  "SHA256SUMS",
]) {
  if (!names.includes(name)) throw new Error(`Missing ${name}.`);
}

const checksumSource = await readFile(resolve(outputDirectory, "SHA256SUMS"), "utf8");
const checksumEntries = new Map(
  checksumSource.trim().split("\n").map((line) => {
    const match = line.match(/^([0-9a-f]{64})  ([^/]+)$/u);
    if (match === null) throw new Error(`Invalid SHA256SUMS line: ${line}`);
    return [match[2], match[1]];
  }),
);
for (const name of names.filter((name) => name !== "SHA256SUMS")) {
  const expected = checksumEntries.get(name);
  if (expected === undefined) throw new Error(`SHA256SUMS does not cover ${name}.`);
  const actual = await sha256(resolve(outputDirectory, name));
  if (actual !== expected) throw new Error(`Checksum mismatch for ${name}.`);
}

const manifest = JSON.parse(await readFile(resolve(outputDirectory, "release-manifest.json"), "utf8"));
if (manifest.version !== version || manifest.tag !== `v${version}` || manifest.treeSitterAbi !== 15) {
  throw new Error("Release manifest metadata does not match the package version and ABI.");
}
for (const sbomName of [`${prefix}-npm.cdx.json`, `${prefix}-release.cdx.json`]) {
  const sbom = JSON.parse(await readFile(resolve(outputDirectory, sbomName), "utf8"));
  if (sbom.bomFormat !== "CycloneDX" || sbom.specVersion !== "1.6") {
    throw new Error(`${sbomName} is not a CycloneDX 1.6 SBOM.`);
  }
  if (
    sbomName === `${prefix}-release.cdx.json` &&
    !/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      sbom.serialNumber,
    )
  ) {
    throw new Error(`${sbomName} does not contain a valid CycloneDX serial number.`);
  }
}

const npmPackage = resolve(outputDirectory, `${prefix}.tgz`);
const npmListing = run("tar", ["-tzf", npmPackage], { capture: true }).stdout;
for (const required of ["package/src/parser.c", "package/src/scanner.c", "package/queries/highlights.scm", "package/tree-sitter-logrotate.wasm", "package/prebuilds/"]) {
  if (!npmListing.includes(required)) throw new Error(`npm package is missing ${required}.`);
}

const crateListing = run("tar", ["-tzf", resolve(outputDirectory, `${prefix}.crate`)], { capture: true }).stdout;
for (const required of ["src/parser.c", "src/scanner.c", "bindings/rust/lib.rs"]) {
  if (!crateListing.includes(required)) throw new Error(`Rust crate is missing ${required}.`);
}

const sourceListing = run("tar", ["-tzf", resolve(outputDirectory, `${prefix}-source.tar.gz`)], { capture: true }).stdout;
for (const required of ["grammar.js", "src/parser.c", "src/scanner.c", "bindings/go/binding.go", "Package.swift", "build.zig"]) {
  if (!sourceListing.includes(`${prefix}/${required}`)) throw new Error(`Source archive is missing ${required}.`);
}

const javaListing = run("jar", ["tf", resolve(outputDirectory, `jtreesitter-logrotate-${version}.jar`)], { capture: true }).stdout;
if (!javaListing.includes("META-INF/native/")) {
  throw new Error("Java package does not contain a native parser library.");
}
for (const platform of manifest.nativePlatforms ?? []) {
  if (!javaListing.includes(`META-INF/native/${platform}/`)) {
    throw new Error(`Java package is missing its ${platform} native parser library.`);
  }
}

for (const name of names.filter((name) => name.endsWith(".whl"))) {
  const listing = run("unzip", ["-Z1", resolve(outputDirectory, name)], { capture: true }).stdout;
  if (!listing.includes("tree_sitter_logrotate/_binding")) throw new Error(`${name} does not contain the native Python binding.`);
}

const wasmStats = await stat(resolve(outputDirectory, `${prefix}.wasm`));
if (wasmStats.size < 1_000) throw new Error("WASM artifact is unexpectedly small.");

process.stdout.write(`Verified ${String(names.length)} release files for v${version}.\n`);
