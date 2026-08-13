import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import Parser from "tree-sitter";

import language from "../../bindings/node/index.js";
import { assertCleanTree, parse } from "./helpers.mjs";

async function loadQuery(name) {
  const source = await readFile(new URL(`../../queries/${name}.scm`, import.meta.url), "utf8");
  return new Parser.Query(language, source);
}

function capturesByName(query, tree) {
  const captures = new Map();
  for (const capture of query.captures(tree.rootNode)) {
    const values = captures.get(capture.name) ?? [];
    values.push(capture.node);
    captures.set(capture.name, values);
  }
  return captures;
}

test("portable queries compile against the public node vocabulary", async () => {
  await Promise.all(["highlights", "injections", "folds"].map(loadQuery));
});

test("highlight captures distinguish known and vendor directives", async () => {
  const source = [
    "include /etc/logrotate.d",
    "/var/log/application.log {",
    "  rotate = 14",
    '  vendor_option "value"',
    "}",
    "",
  ].join("\n");
  const tree = parse(source);
  assertCleanTree(tree);
  const captures = capturesByName(await loadQuery("highlights"), tree);

  assert.deepEqual(captures.get("keyword")?.map(({ text }) => text), ["include", "rotate"]);
  assert.deepEqual(captures.get("property")?.map(({ text }) => text), ["vendor_option"]);
  assert.deepEqual(captures.get("number")?.map(({ text }) => text), ["14"]);
  assert.deepEqual(captures.get("operator")?.map(({ text }) => text), ["="]);
  assert.deepEqual(captures.get("string")?.map(({ text }) => text), ['"value"']);
});

test("injection covers only raw shell bytes", async () => {
  const source = "/var/log/application.log {\n  postrotate\n    echo rotated\n  endscript\n}\n";
  const tree = parse(source);
  const captures = capturesByName(await loadQuery("injections"), tree);
  const content = captures.get("injection.content") ?? [];
  assert.equal(content.length, 1);
  assert.equal(content[0]?.text, "    echo rotated\n");
  assert.equal(source.slice(content[0]?.endIndex), "  endscript\n}\n");
});

test("folds use exact rotation and script block ranges", async () => {
  const source = "/var/log/application.log {\n  postrotate\n    echo rotated\n  endscript\n}\n";
  const tree = parse(source);
  const captures = capturesByName(await loadQuery("folds"), tree);
  assert.deepEqual(captures.get("fold")?.map(({ text }) => text), [
    source.trimEnd(),
    "postrotate\n    echo rotated\n  endscript",
  ]);
});
