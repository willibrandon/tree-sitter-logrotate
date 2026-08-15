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
import Logrotate, { stateLanguage } from "tree-sitter-logrotate";
const parser = new Parser();
parser.setLanguage(Logrotate);
const tree = parser.parse("/var/log/app.log {\\n  daily\\n  rotate 7\\n}\\n");
if (tree.rootNode.type !== "source_file" || tree.rootNode.hasError) process.exit(1);
const block = tree.rootNode.namedChild(0);
if (block?.type !== "rotation_block" || block.childForFieldName("paths")?.text !== "/var/log/app.log") process.exit(1);
const directives = block.childrenForFieldName("body");
if (directives.map((node) => node.childForFieldName("name")?.text).join(",") !== "daily,rotate") process.exit(1);
if (directives[1]?.descendantsOfType("integer")[0]?.text !== "7") process.exit(1);
const stateParser = new Parser();
stateParser.setLanguage(stateLanguage);
const stateTree = stateParser.parse('logrotate state -- version 2\\n"/var/log/app.log" 2026-8-14-12:30:45\\n');
if (stateTree.rootNode.type !== "source_file" || stateTree.rootNode.hasError) process.exit(1);
if (stateTree.rootNode.namedChildren.map((node) => node.type).join(",") !== "header,record") process.exit(1);
const [header, record] = stateTree.rootNode.namedChildren;
if (header.childForFieldName("keyword")?.text !== "logrotate state -- version") process.exit(1);
if (header.childForFieldName("version")?.text !== "2") process.exit(1);
if (record.childForFieldName("path")?.text !== '"/var/log/app.log"') process.exit(1);
const timestamp = record.childForFieldName("timestamp");
if (timestamp?.text !== "2026-8-14-12:30:45") process.exit(1);
if (["year", "month", "day", "hour", "minute", "second"].map((field) => timestamp.childForFieldName(field)?.text).join(",") !== "2026,8,14,12,30,45") process.exit(1);
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
    "from tree_sitter_logrotate import language, state_language",
    "tree = Parser(Language(language())).parse(b'/var/log/app.log {\\n daily\\n rotate 7\\n}')",
    "state = Parser(Language(state_language())).parse(b'logrotate state -- version 2\\n\"/var/log/app.log\" 2026-8-14-12:30:45\\n')",
    "assert tree.root_node.type == 'source_file' and not tree.root_node.has_error",
    "block = tree.root_node.named_children[0]",
    "assert block.type == 'rotation_block' and block.child_by_field_name('paths').text == b'/var/log/app.log'",
    "directives = block.children_by_field_name('body')",
    "assert [node.child_by_field_name('name').text for node in directives] == [b'daily', b'rotate']",
    "assert directives[1].child_by_field_name('arguments').named_children[0].named_children[0].text == b'7'",
    "assert state.root_node.type == 'source_file' and not state.root_node.has_error",
    "header, record = state.root_node.named_children",
    "assert [header.type, record.type] == ['header', 'record']",
    "assert header.child_by_field_name('keyword').text == b'logrotate state -- version' and header.child_by_field_name('version').text == b'2'",
    "assert record.child_by_field_name('path').text == b'\"/var/log/app.log\"'",
    "timestamp = record.child_by_field_name('timestamp')",
    "assert timestamp.text == b'2026-8-14-12:30:45'",
    "assert [timestamp.child_by_field_name(field).text for field in ('year', 'month', 'day', 'hour', 'minute', 'second')] == [b'2026', b'8', b'14', b'12', b'30', b'45']",
  ].join("; ")]);

  const { Language, Parser } = await import("web-tree-sitter");
  await Parser.init();
  const language = await Language.load(resolve(outputDirectory, `tree-sitter-logrotate-${version}.wasm`));
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse("/var/log/app.log {\n  daily\n}\n");
  if (tree.rootNode.type !== "source_file" || tree.rootNode.hasError) throw new Error("WASM release parser rejected a valid configuration.");
  const block = tree.rootNode.namedChild(0);
  if (block?.type !== "rotation_block" || block.childForFieldName("paths")?.text !== "/var/log/app.log") {
    throw new Error("WASM release parser returned the wrong configuration structure.");
  }
  const directive = block.childrenForFieldName("body")[0];
  if (directive?.childForFieldName("name")?.text !== "daily") {
    throw new Error("WASM release parser returned the wrong directive.");
  }
  tree.delete();
  parser.delete();
  const stateLanguage = await Language.load(resolve(outputDirectory, `tree-sitter-logrotate-${version}-state.wasm`));
  const stateParser = new Parser();
  stateParser.setLanguage(stateLanguage);
  const stateTree = stateParser.parse('logrotate state -- version 2\n"/var/log/app.log" 2026-8-14-12:30:45\n');
  if (stateTree.rootNode.type !== "source_file" || stateTree.rootNode.hasError) throw new Error("WASM release state parser rejected a valid state file.");
  const [stateHeader, stateRecord] = stateTree.rootNode.namedChildren;
  if (stateHeader?.type !== "header" || stateRecord?.type !== "record") {
    throw new Error("WASM release state parser returned the wrong root structure.");
  }
  if (stateHeader.childForFieldName("keyword")?.text !== "logrotate state -- version" ||
      stateHeader.childForFieldName("version")?.text !== "2" ||
      stateRecord.childForFieldName("path")?.text !== '"/var/log/app.log"') {
    throw new Error("WASM release state parser returned the wrong header or path.");
  }
  const stateTimestamp = stateRecord.childForFieldName("timestamp");
  if (stateTimestamp?.text !== "2026-8-14-12:30:45" ||
      ["year", "month", "day", "hour", "minute", "second"].map(
        (field) => stateTimestamp.childForFieldName(field)?.text,
      ).join(",") !== "2026,8,14,12,30,45") {
    throw new Error("WASM release state parser returned the wrong timestamp structure.");
  }
  stateTree.delete();
  stateParser.delete();

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
            var root = tree.getRootNode();
            var block = root.getNamedChild(0).orElseThrow();
            var directive = block.getNamedChildren().get(1);
            if (root.hasError() || !root.getType().equals("source_file") ||
                !block.getType().equals("rotation_block") ||
                !block.getChildByFieldName("paths").orElseThrow().getText().equals("/var/log/app.log") ||
                !directive.getChildByFieldName("name").orElseThrow().getText().equals("rotate") ||
                !directive.getChildByFieldName("arguments").orElseThrow().getText().equals("7")) {
                throw new AssertionError(tree.getRootNode().toSexp());
            }
        }
        var stateLanguage = new Language(Objects.requireNonNull(TreeSitterLogrotate.stateLanguage()));
        try (var parser = new Parser(stateLanguage);
             Tree tree = parser.parse("logrotate state -- version 2\\n\\\"/var/log/app.log\\\" 2026-8-14-12:30:45\\n").orElseThrow()) {
            var root = tree.getRootNode();
            var header = root.getNamedChild(0).orElseThrow();
            var record = root.getNamedChild(1).orElseThrow();
            var timestamp = record.getChildByFieldName("timestamp").orElseThrow();
            if (root.hasError() || !root.getType().equals("source_file") ||
                !header.getType().equals("header") || !record.getType().equals("record") ||
                !header.getChildByFieldName("keyword").orElseThrow().getText().equals("logrotate state -- version") ||
                !header.getChildByFieldName("version").orElseThrow().getText().equals("2") ||
                !record.getChildByFieldName("path").orElseThrow().getText().equals("\\\"/var/log/app.log\\\"") ||
                !timestamp.getText().equals("2026-8-14-12:30:45") ||
                !timestamp.getChildByFieldName("year").orElseThrow().getText().equals("2026") ||
                !timestamp.getChildByFieldName("month").orElseThrow().getText().equals("8") ||
                !timestamp.getChildByFieldName("day").orElseThrow().getText().equals("14") ||
                !timestamp.getChildByFieldName("hour").orElseThrow().getText().equals("12") ||
                !timestamp.getChildByFieldName("minute").orElseThrow().getText().equals("30") ||
                !timestamp.getChildByFieldName("second").orElseThrow().getText().equals("45")) {
                throw new AssertionError(tree.getRootNode().toSexp());
            }
        }
    }
}
`);
  run("javac", ["--release", "25", "--class-path", javaClasspath, javaSource], { cwd: javaConsumer });
  const javaEnvironment = {
    ...process.env,
    LD_LIBRARY_PATH: [javaRuntime, process.env.LD_LIBRARY_PATH].filter(Boolean).join(delimiter),
    DYLD_LIBRARY_PATH: [javaRuntime, process.env.DYLD_LIBRARY_PATH].filter(Boolean).join(delimiter),
    PATH: [javaRuntime, process.env.PATH].filter(Boolean).join(delimiter),
  };
  run("java", [
    "--enable-native-access=ALL-UNNAMED",
    `-Djava.library.path=${javaRuntime}`,
    "--class-path",
    `${javaClasspath}${delimiter}${javaConsumer}`,
    "ReleaseJarSmoke",
  ], { cwd: javaConsumer, env: javaEnvironment });

  process.stdout.write("Release artifacts parsed configuration and state files through npm, Python, Java, and WASM.\n");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
