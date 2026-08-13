/**
 * @file Logrotate configuration grammar for Tree-sitter
 * @author Brandon Williams <willibrandon@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

export default grammar({
  name: "logrotate",

  rules: {
    // TODO: add the actual grammar rules
    source_file: $ => "hello"
  }
});
