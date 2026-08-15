import assert from "node:assert";
import { test } from "node:test";
import Parser from "tree-sitter";

test("can parse a logrotate configuration", async () => {
  const source = "/var/log/application.log {\n  rotate 7\n  compress\n}\n";
  const parser = new Parser();
  const { default: language } = await import("./index.js");
  parser.setLanguage(language);
  const tree = parser.parse(source);
  assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
  assert.equal(tree.rootNode.type, "source_file");
  assert.deepEqual(tree.rootNode.namedChildren.map(({ type }) => type), ["rotation_block"]);

  const block = tree.rootNode.namedChildren[0];
  assert.equal(block.childForFieldName("paths")?.text, "/var/log/application.log");
  assert.deepEqual(
    block.childrenForFieldName("body").map((directive) =>
      directive.childForFieldName("name")?.text
    ),
    ["rotate", "compress"],
  );
  assert.equal(block.descendantsOfType("integer")[0]?.text, "7");
});

test("can parse a logrotate state file", async () => {
  const parser = new Parser();
  const { stateLanguage } = await import("./index.js");
  parser.setLanguage(stateLanguage);
  const tree = parser.parse(
    'logrotate state -- version 2\n"/var/log/application.log" 2026-8-14-12:30:45\n',
  );
  assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
  assert.equal(tree.rootNode.type, "source_file");
  assert.deepEqual(tree.rootNode.namedChildren.map(({ type }) => type), ["header", "record"]);

  const [header, record] = tree.rootNode.namedChildren;
  assert.equal(header.childForFieldName("keyword")?.text, "logrotate state -- version");
  assert.equal(header.childForFieldName("version")?.text, "2");
  assert.equal(record.childForFieldName("path")?.text, '"/var/log/application.log"');
  const timestamp = record.childForFieldName("timestamp");
  assert.equal(timestamp?.text, "2026-8-14-12:30:45");
  assert.deepEqual(
    ["year", "month", "day", "hour", "minute", "second"].map((field) =>
      timestamp?.childForFieldName(field)?.text
    ),
    ["2026", "8", "14", "12", "30", "45"],
  );
});
