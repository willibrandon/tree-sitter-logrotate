import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";

import { Language, Parser } from "web-tree-sitter";

const root = resolve(import.meta.dirname, "../..");

await Parser.init();
const language = await Language.load(resolve(process.env.TREE_SITTER_BUILD_DIR ?? resolve(root, "build"), "tree-sitter-logrotate.wasm"));

test("the Node WASM host parses the complete example", async () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const source = await readFile(resolve(root, "examples/complete.logrotate"), "utf8");
  const tree = parser.parse(source);
  assert.ok(tree);
  assert.equal(tree.rootNode.hasError, false);
  assert.equal(tree.rootNode.descendantsOfType("include_directive").length, 3);
  assert.equal(tree.rootNode.descendantsOfType("rotation_block").length, 1);
  assert.match(tree.rootNode.descendantsOfType("script_body")[0]?.text ?? "", /systemctl reload application/u);
  tree.delete();
  parser.delete();
});

test("the Node WASM host reparses an incremental script edit", () => {
  const parser = new Parser();
  parser.setLanguage(language);
  const source = "/var/log/application.log {\n  postrotate\n    echo before\n  endscript\n}\n";
  const replacement = "after ";
  const startIndex = source.indexOf("before");
  const oldTree = parser.parse(source);
  assert.ok(oldTree);
  oldTree.edit({
    startIndex,
    oldEndIndex: startIndex + replacement.length,
    newEndIndex: startIndex + replacement.length,
    startPosition: { row: 2, column: 9 },
    oldEndPosition: { row: 2, column: 15 },
    newEndPosition: { row: 2, column: 15 },
  });
  const updated = `${source.slice(0, startIndex)}${replacement}${source.slice(startIndex + replacement.length)}`;
  const incrementalTree = parser.parse(updated, oldTree);
  const coldTree = parser.parse(updated);
  assert.ok(incrementalTree);
  assert.ok(coldTree);
  assert.equal(incrementalTree.rootNode.toString(), coldTree.rootNode.toString());
  assert.equal(incrementalTree.rootNode.descendantsOfType("script_body")[0]?.text, "    echo after \n");
  coldTree.delete();
  incrementalTree.delete();
  oldTree.delete();
  parser.delete();
});
