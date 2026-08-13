/**
 * @file Logrotate configuration grammar for Tree-sitter
 * @author Brandon Williams (https://github.com/willibrandon)
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

export default grammar({
  name: "logrotate",

  extras: _ => [/[\t\f\v ]+/],

  externals: $ => [$.script_body, $._recovery_script_body, $._error_sentinel],

  word: $ => $.directive_name,

  conflicts: $ => [
    [$._incomplete_rotation_before_directive],
    [$._block_item, $._unterminated_rotation_body],
    [$.rotation_block, $._unterminated_rotation_body]
  ],

  rules: {
    source_file: $ =>
      seq(
        repeat(
          choice(
            $._newline,
            seq($._top_level_item, $._newline),
            $._incomplete_rotation_before_directive
          )
        ),
        optional(choice($._top_level_item, $._incomplete_rotation_at_eof))
      ),

    _top_level_item: $ =>
      choice(
        $.comment,
        $.include_directive,
        $.rotation_block,
        $.directive
      ),

    comment: _ => token(seq("#", /[^\r\n]*/)),

    rotation_block: $ =>
      seq(
        choice(
          prec.dynamic(
            2,
            seq(
              field("paths", alias($._single_line_path_list, $.path_list)),
              "{"
            )
          ),
          prec.dynamic(
            -1,
            seq(
              field("paths", alias($._multiline_path_list, $.path_list)),
              optional($._newline),
              "{"
            )
          )
        ),
        choice(
          "}",
          seq(
            $._newline,
            choice(
              seq(
                field(
                  "body",
                  repeat(choice($._newline, seq($._block_item, $._newline)))
                ),
                "}"
              ),
              field("body", $._unterminated_rotation_body)
            )
          )
        )
      ),

    _block_item: $ => choice($.comment, $.script_block, $.directive),

    _unterminated_rotation_body: $ =>
      prec.right(
        10,
        seq(
          repeat(
            choice(
              $._newline,
              seq(choice($.comment, $.directive, $.script_block), $._newline)
            )
          ),
          $.unterminated_script_block
        )
      ),

    unterminated_script_block: $ =>
      seq(
        field("directive", $.script_directive),
        $._newline,
        field(
          "script",
          alias($._recovery_script_body, $.script_body)
        )
      ),

    _incomplete_rotation_before_directive: $ =>
      prec.dynamic(
        1,
        seq(
          alias($._single_line_path_list, $.path_list),
          $._newline,
          repeat(seq($.comment, $._newline)),
          $.directive,
          $._newline,
          $._error_sentinel
        )
      ),

    _incomplete_rotation_at_eof: $ =>
      prec.dynamic(
        1,
        seq(
          alias($._single_line_path_list, $.path_list),
          $._error_sentinel
        )
      ),

    _single_line_path_list: $ => repeat1($._path),

    _multiline_path_list: $ =>
      prec.left(
        seq(
          $._single_line_path_list,
          repeat1(
            seq(
              $._newline,
              repeat(choice($._newline, seq($.comment, $._newline))),
              $._single_line_path_list
            )
          )
        )
      ),

    _path: $ => choice($.path_pattern, $.quoted_path),

    path_pattern: $ =>
      seq(
        choice("/", "~"),
        repeat(
          choice(
            $._path_text_immediate,
            alias($._escape_sequence_immediate, $.escape_sequence)
          )
        )
      ),

    quoted_path: $ =>
      choice(
        seq(
          '"',
          repeat(
            choice(
              $._double_quote_text,
              alias($._escape_sequence_immediate, $.escape_sequence)
            )
          ),
          '"'
        ),
        seq(
          "'",
          repeat(
            choice(
              $._single_quote_text,
              alias($._escape_sequence_immediate, $.escape_sequence)
            )
          ),
          "'"
        )
      ),

    include_directive: $ =>
      seq(
        field("name", alias("include", $.directive_name)),
        optional(field("operator", "=")),
        field(
          "path",
          choice($._path, alias($._relative_path_pattern, $.path_pattern))
        )
      ),

    directive: $ =>
      seq(
        field("name", $.directive_name),
        optional(field("operator", "=")),
        optional(field("arguments", $.directive_arguments))
      ),

    directive_name: _ => /[A-Za-z][A-Za-z0-9_-]*/,

    directive_arguments: $ => repeat1($.argument),

    argument: $ =>
      choice(
        $.quoted_argument,
        $.size,
        $.integer,
        seq(
          choice($._argument_text, $.escape_sequence),
          repeat(
            choice(
              $._argument_text_immediate,
              alias($._escape_sequence_immediate, $.escape_sequence)
            )
          )
        )
      ),

    quoted_argument: $ =>
      choice(
        seq(
          '"',
          repeat(
            choice(
              $._double_quote_text,
              alias($._escape_sequence_immediate, $.escape_sequence)
            )
          ),
          '"'
        ),
        seq(
          "'",
          repeat(
            choice(
              $._single_quote_text,
              alias($._escape_sequence_immediate, $.escape_sequence)
            )
          ),
          "'"
        )
      ),

    escape_sequence: _ => token(/\\[^\r\n]?/),

    _escape_sequence_immediate: _ => token.immediate(/\\[^\r\n]?/),

    integer: _ => token(prec(1, /-?[0-9]+/)),

    size: _ => token(prec(2, /[0-9]+[kKMG]/)),

    script_block: $ =>
      seq(
        field("directive", $.script_directive),
        $._newline,
        optional(field("script", $.script_body)),
        field("terminator", $.endscript)
      ),

    script_directive: _ =>
      choice("firstaction", "lastaction", "prerotate", "postrotate", "preremove"),

    endscript: _ => "endscript",

    _path_text: _ => token(/[^\t\f\v \r\n{}"'\\]+/),

    _relative_path_pattern: $ =>
      seq(
        choice($._path_text, $.escape_sequence),
        repeat(
          choice(
            $._path_text_immediate,
            alias($._escape_sequence_immediate, $.escape_sequence)
          )
        )
      ),

    _path_text_immediate: _ => token.immediate(/[^\t\f\v \r\n{}"'\\]+/),

    _argument_text: _ => token(prec(-1, /[^\t\f\v \r\n{}"'\\]+/)),

    _argument_text_immediate: _ =>
      token.immediate(prec(-1, /[^\t\f\v \r\n{}"'\\]+/)),

    _double_quote_text: _ => token.immediate(/[^"\\\r\n]+/),

    _single_quote_text: _ => token.immediate(/[^'\\\r\n]+/),

    _newline: _ => /\r?\n/
  }
});
