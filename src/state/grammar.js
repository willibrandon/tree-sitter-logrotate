/**
 * @file Logrotate state grammar for Tree-sitter
 * @author Brandon Williams (https://github.com/willibrandon)
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

export default grammar({
  name: "logrotate_state",

  extras: _ => [],

  rules: {
    source_file: $ =>
      seq(
        $.header,
        repeat(seq($._newline, optional(choice($.record, $.invalid_record))))
      ),

    header: $ =>
      seq(
        field(
          "keyword",
          alias("logrotate state -- version", $.header_keyword)
        ),
        " ",
        field("version", $.version)
      ),

    version: _ => /[12]/,

    record: $ =>
      seq(
        field("path", $.quoted_path),
        /[\t ]+/,
        field("timestamp", $.timestamp)
      ),

    quoted_path: $ =>
      seq(
        '"',
        repeat(choice($.escape_sequence, token.immediate(/[^"\\\r\n]+/))),
        '"'
      ),

    escape_sequence: _ => token.immediate(/\\[^\r\n]/),

    timestamp: $ =>
      seq(
        field("year", $.year),
        "-",
        field("month", $.month),
        "-",
        field("day", $.day),
        optional(
          seq(
            "-",
            field("hour", $.hour),
            ":",
            field("minute", $.minute),
            ":",
            field("second", $.second)
          )
        )
      ),

    year: _ => /[+-]?\d+/,
    month: _ => /[+-]?\d+/,
    day: _ => /[+-]?\d+/,
    hour: _ => /[+-]?\d+/,
    minute: _ => /[+-]?\d+/,
    second: _ => /[+-]?\d+/,

    invalid_record: _ => token(prec(-1, /[^\r\n]+/)),

    _newline: _ => /\r?\n/
  }
});
