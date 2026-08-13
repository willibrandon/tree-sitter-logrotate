import { readFile, writeFile } from "node:fs/promises";

const version = process.argv[2];
if (version === undefined || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
  throw new Error("Usage: npm run release:version -- X.Y.Z");
}

const updateJson = async (path, update) => {
  const value = JSON.parse(await readFile(path, "utf8"));
  update(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};
const replace = async (path, expression, replacement) => {
  const source = await readFile(path, "utf8");
  const updated = source.replace(expression, replacement);
  if (updated === source) throw new Error(`Could not update ${path}.`);
  await writeFile(path, updated);
};

await updateJson("package.json", (value) => { value.version = version; });
await updateJson("package-lock.json", (value) => {
  value.version = version;
  value.packages[""].version = version;
});
await updateJson("tree-sitter.json", (value) => { value.metadata.version = version; });
await replace("Cargo.toml", /(\[package\][\s\S]*?\nversion\s*=\s*)"[^"]+"/u, `$1"${version}"`);
await replace("Cargo.lock", /(\[\[package\]\]\nname\s*=\s*"tree-sitter-logrotate"\nversion\s*=\s*)"[^"]+"/u, `$1"${version}"`);
await replace("pyproject.toml", /(\[project\][\s\S]*?\nversion\s*=\s*)"[^"]+"/u, `$1"${version}"`);
await replace("pom.xml", /(<artifactId>jtreesitter-logrotate<\/artifactId>[\s\S]*?<version>)[^<]+(<\/version>)/u, `$1${version}$2`);
await replace(
  "docs-site/src/content/docs/bindings.md",
  /(<artifactId>jtreesitter-logrotate<\/artifactId>\s*\n\s*<version>)[^<]+(<\/version>)/u,
  "$1" + version + "$2",
);
await replace(
  "docs-site/src/content/docs/bindings.md",
  /(\.package\(\s*\n\s*url: "https:\/\/github\.com\/willibrandon\/tree-sitter-logrotate",\s*\n\s*from: ")[^"]+(")/u,
  "$1" + version + "$2",
);
await replace("CMakeLists.txt", /(project\(tree-sitter-logrotate[\s\S]*?VERSION\s+")[^"]+("\s*)/u, `$1${version}$2`);
await replace("Makefile", /(^VERSION\s*:=\s*)[^\s]+$/mu, `$1${version}`);
await replace("build.zig.zon", /(\.version\s*=\s*)"[^"]+"/u, `$1"${version}"`);

process.stdout.write(`Updated release metadata to ${version}. Add the matching changelog section before tagging.\n`);
