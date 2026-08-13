import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";
import { optionValue, packageMetadata, repositoryRoot, run } from "./release-common.mjs";

const metadata = await packageMetadata();
const version = metadata.version;
const outputDirectory = resolve(repositoryRoot, optionValue("--output", "dist"));
const temporaryDirectory = await mkdtemp(resolve(tmpdir(), "tree-sitter-logrotate-release-"));

try {
  run(process.execPath, [resolve(repositoryRoot, "scripts/verify-release-artifacts.mjs"), "--output", outputDirectory]);

  const npmConsumer = resolve(temporaryDirectory, "npm");
  await mkdir(npmConsumer);
  const npmCli = process.env.npm_execpath ?? resolve(repositoryRoot, "node_modules/npm/bin/npm-cli.js");
  run(process.execPath, [npmCli, "init", "--yes"], { cwd: npmConsumer, env: process.env });
  run(process.execPath, [
    npmCli,
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    resolve(outputDirectory, `tree-sitter-logrotate-${version}.tgz`),
    "tree-sitter@0.25.1",
  ], { cwd: npmConsumer, env: process.env });
  await writeFile(resolve(npmConsumer, "test.mjs"), `
import Parser from "tree-sitter";
import Logrotate from "tree-sitter-logrotate";
const parser = new Parser();
parser.setLanguage(Logrotate);
const tree = parser.parse("/var/log/app.log {\\n  daily\\n  rotate 7\\n}\\n");
if (tree.rootNode.type !== "source_file" || tree.rootNode.hasError) process.exit(1);
`);
  run(process.execPath, [resolve(npmConsumer, "test.mjs")], { cwd: npmConsumer });

  const wheelNames = await readdir(outputDirectory);
  const platformTags = process.platform === "linux"
    ? ["manylinux", "musllinux", "linux"]
    : process.platform === "darwin"
      ? ["macosx"]
      : process.platform === "win32"
        ? ["win"]
        : [];
  const architectureTags = process.arch === "x64"
    ? ["x86_64", "amd64"]
    : process.arch === "arm64"
      ? ["aarch64", "arm64"]
      : process.arch === "ia32"
        ? ["i686", "win32"]
        : [process.arch];
  const wheelName = wheelNames.find((entry) =>
    entry.endsWith(".whl")
      && platformTags.some((tag) => entry.includes(tag))
      && architectureTags.some((tag) => entry.includes(tag)))
    ?? wheelNames.find((entry) => entry.endsWith("-any.whl"));
  if (wheelName === undefined) throw new Error("No Python wheel is available for the consumer test.");
  const pythonEnvironment = resolve(temporaryDirectory, "python");
  run(process.env.PYTHON ?? "python3", ["-m", "venv", pythonEnvironment]);
  const python = process.platform === "win32" ? resolve(pythonEnvironment, "Scripts/python.exe") : resolve(pythonEnvironment, "bin/python");
  run(python, ["-m", "pip", "install", "--disable-pip-version-check", "tree-sitter==0.26.0", resolve(outputDirectory, wheelName)]);
  run(python, ["-c", [
    "from tree_sitter import Language, Parser",
    "from tree_sitter_logrotate import language",
    "tree = Parser(Language(language())).parse(b'/var/log/app.log {\\n daily\\n}')",
    "assert tree.root_node.type == 'source_file' and not tree.root_node.has_error",
  ].join("; ")]);

  const { Language, Parser } = await import("web-tree-sitter");
  await Parser.init();
  const language = await Language.load(resolve(outputDirectory, `tree-sitter-logrotate-${version}.wasm`));
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse("/var/log/app.log {\n  daily\n}\n");
  if (tree.rootNode.type !== "source_file" || tree.rootNode.hasError) throw new Error("WASM release parser rejected a valid configuration.");
  tree.delete();
  parser.delete();

  const javaConsumer = resolve(temporaryDirectory, "java");
  await mkdir(javaConsumer);
  const javaSource = resolve(javaConsumer, "ReleaseJarSmoke.java");
  const javaPackage = resolve(outputDirectory, `jtreesitter-logrotate-${version}.jar`);
  const javaClasspathFile = resolve(javaConsumer, "classpath.txt");
  run("mvn", [
    "--batch-mode",
    "--no-transfer-progress",
    "org.apache.maven.plugins:maven-dependency-plugin:3.11.0:build-classpath",
    `-Dmdep.outputFile=${javaClasspathFile}`,
    "-Dmdep.includeScope=runtime",
  ]);
  const javaDependencies = (await readFile(javaClasspathFile, "utf8")).trim();
  const javaClasspath = [javaPackage, javaDependencies].filter(Boolean).join(delimiter);
  const javaRuntime = resolve(javaConsumer, "native");
  run("cmake", [
    "-S",
    repositoryRoot,
    "-B",
    javaRuntime,
    "-G",
    "Ninja",
    "-DBUILD_TESTING=false",
    "-DTREE_SITTER_BUILD_JAVA_TEST_RUNTIME=true",
  ]);
  run("cmake", ["--build", javaRuntime, "--target", "tree-sitter-runtime"]);
  await writeFile(javaSource, `
import io.github.treesitter.jtreesitter.Language;
import io.github.treesitter.jtreesitter.Parser;
import io.github.treesitter.jtreesitter.Tree;
import io.github.treesitter.jtreesitter.logrotate.TreeSitterLogrotate;
import java.util.Objects;

public final class ReleaseJarSmoke {
    public static void main(String[] args) {
        var language = new Language(Objects.requireNonNull(TreeSitterLogrotate.language()));
        try (var parser = new Parser(language);
             Tree tree = parser.parse("/var/log/app.log {\\n  rotate 7\\n}\\n").orElseThrow()) {
            if (tree.getRootNode().hasError()) {
                throw new AssertionError(tree.getRootNode().toSexp());
            }
        }
    }
}
`);
  run("javac", ["--release", "25", "--class-path", javaClasspath, javaSource], { cwd: javaConsumer });
  run("java", [
    "--enable-native-access=ALL-UNNAMED",
    `-Djava.library.path=${javaRuntime}`,
    "--class-path",
    `${javaClasspath}${delimiter}${javaConsumer}`,
    "ReleaseJarSmoke",
  ], { cwd: javaConsumer });

  process.stdout.write("Release artifacts parsed through npm, Python, Java, and WASM.\n");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
