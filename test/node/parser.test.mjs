import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { assertCleanTree, parse } from "./helpers.mjs";

test("parses the complete example without resolving includes or executing scripts", async () => {
  const source = await readFile(new URL("../../examples/complete.logrotate", import.meta.url), "utf8");
  const tree = parse(source);
  assertCleanTree(tree);

  const root = tree.rootNode;
  assert.deepEqual(
    root.namedChildren.map(({ type }) => type),
    ["comment", "include_directive", "include_directive", "include_directive", "rotation_block"],
  );
  assert.equal(root.namedChildren.at(-1)?.childForFieldName("paths")?.type, "path_list");
});

test("keeps every script body raw and excludes its terminator", () => {
  const directives = ["firstaction", "lastaction", "prerotate", "postrotate", "preremove"];
  const blocks = directives.map((name) => `  ${name}\n    printf '%s' endscript\n  endscript`).join("\n");
  const source = `/var/log/application.log {\n${blocks}\n}\n`;
  const tree = parse(source);
  assertCleanTree(tree);

  const scriptBlocks = tree.rootNode.descendantsOfType("script_block");
  assert.equal(scriptBlocks.length, directives.length);
  for (const [index, block] of scriptBlocks.entries()) {
    assert.equal(block.childForFieldName("directive")?.text, directives[index]);
    assert.equal(block.childForFieldName("script")?.text, "    printf '%s' endscript\n");
    assert.equal(block.childForFieldName("terminator")?.text, "endscript");
  }
});

test("does not mistake terminator lookalikes for endscript", () => {
  const source = [
    "/var/log/application.log {",
    "  postrotate",
    "    echo endscript",
    "    \"endscript\"",
    "    endscript_helper",
    "    printf '%s' endscript",
    "  endscript",
    "}",
    "",
  ].join("\n");
  const tree = parse(source);
  assertCleanTree(tree);
  assert.equal(
    tree.rootNode.descendantsOfType("script_body")[0]?.text,
    "    echo endscript\n    \"endscript\"\n    endscript_helper\n    printf '%s' endscript\n",
  );
});

test("keeps a leading shell brace in the raw body before a real terminator", () => {
  const source = [
    "/var/log/application.log {",
    "  postrotate",
    "if true; then",
    "  echo rotated",
    "}",
    "  endscript",
    "}",
    "",
  ].join("\n");
  const tree = parse(source);

  assertCleanTree(tree);
  assert.equal(
    tree.rootNode.descendantsOfType("script_body")[0]?.text,
    "if true; then\n  echo rotated\n}\n",
  );
});

test("produces the same named tree shape for LF and CRLF", () => {
  const lf = "/var/log/application.log {\n  rotate 4\n  postrotate\n    echo rotated\n  endscript\n}\n";
  const crlf = lf.replaceAll("\n", "\r\n");
  const lfTree = parse(lf);
  const crlfTree = parse(crlf);
  assertCleanTree(lfTree);
  assertCleanTree(crlfTree);
  assert.equal(crlfTree.rootNode.toString(), lfTree.rootNode.toString());
});

test("accepts a final directive and block without a trailing newline", () => {
  for (const source of ["weekly", "/var/log/application.log {\n  daily\n}"]) {
    assertCleanTree(parse(source));
  }
});

test("accepts trailing horizontal whitespace without changing directive ranges", () => {
  const source = "/var/log/application.log {\n\tdaily   \t\n\trotate\t4  \n}\n";
  const tree = parse(source);
  assertCleanTree(tree);

  const directives = tree.rootNode.descendantsOfType("directive");
  assert.deepEqual(directives.map(({ text }) => text), ["daily", "rotate\t4"]);
  assert.deepEqual(
    directives.map(({ startPosition, endPosition }) => [startPosition.column, endPosition.column]),
    [
      [1, 6],
      [1, 9],
    ],
  );
});

test("keeps literal hashes in paths and quoted arguments", () => {
  const source = [
    'dateformat "-%Y%m%d # literal"',
    "/var/log/#archive.log {",
    "  rotate 4",
    "}",
    "",
  ].join("\n");
  const tree = parse(source);
  assertCleanTree(tree);
  assert.equal(tree.rootNode.descendantsOfType("comment").length, 0);
  assert.equal(tree.rootNode.descendantsOfType("path_pattern")[0]?.text, "/var/log/#archive.log");
});

test("handles long paths and script bodies without changing their bytes", () => {
  const path = `/var/log/${"a".repeat(16_384)}.log`;
  const body = `${"printf x\n".repeat(10_000)}`;
  const source = `${path} {\n  postrotate\n${body}  endscript\n}\n`;
  const tree = parse(source);
  assertCleanTree(tree);
  assert.equal(tree.rootNode.descendantsOfType("path_pattern")[0]?.text, path);
  assert.equal(tree.rootNode.descendantsOfType("script_body")[0]?.text, body);
});

test("recovers a later stanza after an unterminated script at a strong boundary", () => {
  const source = [
    "/var/log/incomplete.log {",
    "  postrotate",
    "    echo still-editing",
    "}",
    "/var/log/healthy.log {",
    "  rotate 4",
    "}",
    "",
  ].join("\n");
  const tree = parse(source);
  const healthyBlock = tree.rootNode.descendantsOfType("rotation_block").at(-1);

  assert.equal(healthyBlock?.childForFieldName("paths")?.text, "/var/log/healthy.log");
  assert.equal(healthyBlock?.descendantsOfType("directive_name")[0]?.text, "rotate");
  assert.ok(tree.rootNode.hasError, "the unterminated script must remain an explicit syntax error");
});
