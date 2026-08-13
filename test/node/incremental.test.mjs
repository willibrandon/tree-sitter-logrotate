import assert from "node:assert/strict";
import { test } from "node:test";

import { applyEdit, createParser, serializeTree } from "./helpers.mjs";

const baseSource = [
  "/var/log/one.log {",
  "  rotate 4",
  "  postrotate",
  "    echo one",
  "  endscript",
  "}",
  "",
  "/var/log/two.log {",
  "  weekly",
  "}",
  "",
].join("\n");

const edits = [
  ["directive name", "rotate", "rotate", "weekly"],
  ["optional equals", "rotate 4", "rotate 4", "rotate = 4"],
  ["path list", "/var/log/one.log", "/var/log/one.log", "/var/log/one.log /var/log/one.err"],
  ["opening brace", "one.log {", "{", "{ "],
  ["closing brace", "\n}\n\n/var/log/two", "}", "} "],
  ["script opener", "postrotate", "postrotate", "prerotate"],
  ["endscript terminator", "endscript", "endscript", "endscript "],
  ["first script byte", "    echo one", " ", "\t"],
  ["last script byte", "one\n  endscript", "one", "one now"],
];

for (const [name, locator, oldText, replacement] of edits) {
  test(`incremental parse matches a cold parse after editing ${name}`, () => {
    const parser = createParser();
    const oldTree = parser.parse(baseSource);
    const locatorIndex = baseSource.indexOf(locator);
    assert.notEqual(locatorIndex, -1);
    const startIndex = baseSource.indexOf(oldText, locatorIndex);
    assert.notEqual(startIndex, -1);

    const edited = applyEdit(
      parser,
      baseSource,
      oldTree,
      startIndex,
      startIndex + oldText.length,
      replacement,
    );
    const coldTree = parser.parse(edited.source);
    assert.deepEqual(serializeTree(edited.tree.rootNode), serializeTree(coldTree.rootNode));
  });
}

for (const opener of ["firstaction", "lastaction", "prerotate", "postrotate", "preremove"]) {
  test(`repairs an incomplete ${opener} block incrementally`, () => {
    const parser = createParser();
    const source = `/var/log/application.log {\n  ${opener}\n    echo editing\n}\n`;
    const oldTree = parser.parse(source);
    const insertAt = source.lastIndexOf("}\n");
    const edited = applyEdit(parser, source, oldTree, insertAt, insertAt, "  endscript\n");
    const coldTree = parser.parse(edited.source);
    assert.deepEqual(serializeTree(edited.tree.rootNode), serializeTree(coldTree.rootNode));
  });
}

test("repairs an unterminated quote across a CRLF boundary", () => {
  const parser = createParser();
  const source = 'mail "root@example.test\r\nweekly\r\n';
  const oldTree = parser.parse(source);
  const insertAt = source.indexOf("\r\n");
  const edited = applyEdit(parser, source, oldTree, insertAt, insertAt, '"');
  const coldTree = parser.parse(edited.source);
  assert.deepEqual(serializeTree(edited.tree.rootNode), serializeTree(coldTree.rootNode));
});

test("reuses a distant unchanged rotation block", () => {
  const parser = createParser();
  const oldTree = parser.parse(baseSource);
  const oldSecondBlock = oldTree.rootNode.descendantsOfType("rotation_block")[1];
  assert.ok(oldSecondBlock);

  const startIndex = baseSource.indexOf("rotate");
  const edited = applyEdit(parser, baseSource, oldTree, startIndex, startIndex + 6, "monthly");
  const newSecondBlock = edited.tree.rootNode.descendantsOfType("rotation_block")[1];
  assert.ok(newSecondBlock);
  assert.equal(newSecondBlock.id, oldSecondBlock.id);
});
