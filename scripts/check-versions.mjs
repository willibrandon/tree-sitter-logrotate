import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const packageLock = JSON.parse(await readFile("package-lock.json", "utf8"));
const treeSitterJson = JSON.parse(await readFile("tree-sitter.json", "utf8"));
const toolchains = JSON.parse(await readFile("toolchains.json", "utf8"));
const cargo = await readFile("Cargo.toml", "utf8");
const cargoLock = await readFile("Cargo.lock", "utf8");
const python = await readFile("pyproject.toml", "utf8");
const maven = await readFile("pom.xml", "utf8");
const cmake = await readFile("CMakeLists.txt", "utf8");
const makefile = await readFile("Makefile", "utf8");
const zig = await readFile("build.zig.zon", "utf8");
const nvmVersion = (await readFile(".nvmrc", "utf8")).trim();

const packageVersion = packageJson.version;
const exactTomlVersion = (source, section) => source.match(
  new RegExp(`(?:^|\\n)\\[${section}\\]\\s*\\n[\\s\\S]*?(?:^|\\n)version\\s*=\\s*["']([^"']+)["']`, "mu"),
)?.[1];
const mavenVersion = maven.match(/<project[\s\S]*?<version>([^<]+)<\/version>/u)?.[1];
const cmakeVersion = cmake.match(/project\(tree-sitter-logrotate[\s\S]*?VERSION\s+"([^"]+)"/u)?.[1];
const cargoLockVersion = cargoLock.match(/\[\[package\]\]\nname\s*=\s*"tree-sitter-logrotate"\nversion\s*=\s*"([^"]+)"/u)?.[1];
const makefileVersion = makefile.match(/^VERSION\s*:=\s*([^\s]+)$/mu)?.[1];
const zigVersion = zig.match(/\.version\s*=\s*"([^"]+)"/u)?.[1];

const errors = [];
const semanticVersionParts = (version) => version.split(".").map(Number);
const compareVersions = (left, right) => {
  const leftParts = semanticVersionParts(left);
  const rightParts = semanticVersionParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
};
const expectEqual = (actual, expected, description) => {
  if (actual !== expected) {
    errors.push(`${description}: expected ${String(expected)}, found ${String(actual)}`);
  }
};

expectEqual(packageLock.version, packageVersion, "npm lockfile version");
expectEqual(packageLock.packages?.[""]?.version, packageVersion, "npm root lockfile version");
expectEqual(treeSitterJson.metadata?.version, packageVersion, "Tree-sitter metadata version");
expectEqual(exactTomlVersion(cargo, "package"), packageVersion, "Rust crate version");
expectEqual(cargoLockVersion, packageVersion, "Rust lockfile package version");
expectEqual(exactTomlVersion(python, "project"), packageVersion, "Python package version");
expectEqual(mavenVersion, packageVersion, "Maven package version");
expectEqual(cmakeVersion, packageVersion, "CMake project version");
expectEqual(makefileVersion, packageVersion, "Makefile version");
expectEqual(zigVersion, packageVersion, "Zig package version");
expectEqual(packageJson.engines?.node, toolchains.node, "Node.js version");
expectEqual(nvmVersion, toolchains.node, ".nvmrc version");
expectEqual(packageJson.packageManager, `npm@${toolchains.npm}`, "npm version");
expectEqual(packageJson.devDependencies?.["tree-sitter-cli"], toolchains.treeSitter, "Tree-sitter CLI version");

if (compareVersions(toolchains.treeSitterMinimum, toolchains.treeSitter) > 0) {
  errors.push("minimum Tree-sitter CLI version exceeds the pinned development version");
}

if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u.test(packageVersion)) {
  errors.push(`npm package version is not SemVer: ${String(packageVersion)}`);
}

if (errors.length > 0) {
  throw new Error(`Version metadata is inconsistent:\n${errors.join("\n")}`);
}

process.stdout.write(`Version metadata is aligned at ${packageVersion}.\n`);
