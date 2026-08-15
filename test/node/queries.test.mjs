import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import Parser from "tree-sitter";

import language, { stateLanguage } from "../../bindings/node/index.js";
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
    "  create 0640 application adm",
    "  su application adm",
    '  vendor_option "value"',
    "}",
    "",
  ].join("\n");
  const tree = parse(source);
  assertCleanTree(tree);
  const captures = capturesByName(await loadQuery("highlights"), tree);

  assert.deepEqual(captures.get("keyword")?.map(({ text }) => text), [
    "include",
    "rotate",
    "create",
    "su",
  ]);
  assert.deepEqual(captures.get("property")?.map(({ text }) => text), ["vendor_option"]);
  assert.deepEqual(captures.get("number")?.map(({ text }) => text), ["14", "0640"]);
  assert.deepEqual(captures.get("operator")?.map(({ text }) => text), ["="]);
  assert.deepEqual(captures.get("string")?.map(({ text }) => text), ['"value"']);
  assert.deepEqual(captures.get("variable.parameter")?.map(({ text }) => text), [
    "application",
    "adm",
    "application",
    "adm",
  ]);
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

test("state highlights capture the header, path, and timestamp", () => {
  const source = [
    "logrotate state -- version 2",
    '"/var/log/application output.log" 2026-8-14-12:30:45',
    "",
  ].join("\n");
  const parser = new Parser();
  parser.setLanguage(stateLanguage);
  const tree = parser.parse(source);
  assertCleanTree(tree);
  const query = new Parser.Query(stateLanguage, stateLanguage.HIGHLIGHTS_QUERY);
  const captures = capturesByName(query, tree);

  assert.deepEqual(captures.get("keyword")?.map(({ text }) => text), [
    "logrotate state -- version",
  ]);
  assert.deepEqual(captures.get("string.special.path")?.map(({ text }) => text), [
    '"/var/log/application output.log"',
  ]);
  assert.deepEqual(captures.get("number")?.map(({ text }) => text), [
    "2",
    "2026",
    "8",
    "14",
    "12",
    "30",
    "45",
  ]);
});
