import assert from "node:assert";
import { test } from "node:test";
import Parser from "tree-sitter";

test("can parse a logrotate configuration", async () => {
  const parser = new Parser();
  const { default: language } = await import("./index.js");
  parser.setLanguage(language);
  const tree = parser.parse("/var/log/application.log {\n  rotate 7\n  compress\n}\n");
  assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
});
