import assert from "node:assert/strict";
import Parser from "tree-sitter";

import language from "../../bindings/node/index.js";

export function createParser() {
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}

export function parse(source) {
  return createParser().parse(source);
}

export function assertCleanTree(tree, message = "expected a syntax-error-free tree") {
  assert.equal(tree.rootNode.hasError, false, `${message}: ${tree.rootNode.toString()}`);
}

export function serializeTree(node) {
  return {
    type: node.type,
    named: node.isNamed,
    missing: node.isMissing,
    error: node.isError,
    startIndex: node.startIndex,
    endIndex: node.endIndex,
    startPosition: node.startPosition,
    endPosition: node.endPosition,
    children: node.children.map((child, index) => ({
      field: node.fieldNameForChild(index),
      node: serializeTree(child),
    })),
  };
}

export function pointAt(source, index) {
  const prefix = source.slice(0, index);
  const lines = prefix.split("\n");
  return {
    row: lines.length - 1,
    column: Buffer.byteLength(lines.at(-1) ?? ""),
  };
}

export function applyEdit(parser, source, tree, startIndex, oldEndIndex, replacement) {
  const newSource = `${source.slice(0, startIndex)}${replacement}${source.slice(oldEndIndex)}`;
  tree.edit({
    startIndex,
    oldEndIndex,
    newEndIndex: startIndex + Buffer.byteLength(replacement),
    startPosition: pointAt(source, startIndex),
    oldEndPosition: pointAt(source, oldEndIndex),
    newEndPosition: pointAt(newSource, startIndex + replacement.length),
  });
  return {
    source: newSource,
    tree: parser.parse(newSource, tree),
  };
}
