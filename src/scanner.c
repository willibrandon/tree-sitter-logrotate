#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

enum TokenType {
  SCRIPT_BODY,
  RECOVERY_SCRIPT_BODY,
  ERROR_SENTINEL,
};

enum BoundaryType {
  NO_BOUNDARY,
  SCRIPT_TERMINATOR_BOUNDARY,
  STANZA_RECOVERY_BOUNDARY,
};

static bool is_horizontal_space(int32_t character) {
  return character == ' ' || character == '\t';
}

static bool is_line_ending(int32_t character) {
  return character == '\r' || character == '\n';
}

static bool scan_terminator(TSLexer *lexer) {
  static const char terminator[] = "endscript";

  while (is_horizontal_space(lexer->lookahead)) {
    lexer->advance(lexer, false);
  }

  for (size_t index = 0; index < sizeof(terminator) - 1; index++) {
    if (lexer->lookahead != terminator[index]) {
      return false;
    }
    lexer->advance(lexer, false);
  }

  return lexer->eof(lexer) || is_horizontal_space(lexer->lookahead) ||
         is_line_ending(lexer->lookahead);
}

static bool scan_complete_stanza_header(TSLexer *lexer) {
  int32_t quote = 0;
  bool escaped = false;

  if (lexer->lookahead != '/' && lexer->lookahead != '~') {
    return false;
  }

  while (!lexer->eof(lexer) && !is_line_ending(lexer->lookahead)) {
    const int32_t character = lexer->lookahead;
    lexer->advance(lexer, false);

    if (escaped) {
      escaped = false;
    } else if (character == '\\') {
      escaped = true;
    } else if (quote != 0) {
      if (character == quote) {
        quote = 0;
      }
    } else if (character == '\'' || character == '"') {
      quote = character;
    } else if (character == '{') {
      while (is_horizontal_space(lexer->lookahead)) {
        lexer->advance(lexer, false);
      }
      return lexer->eof(lexer) || is_line_ending(lexer->lookahead);
    }
  }

  return false;
}

static enum BoundaryType scan_boundary_after_closing_brace(TSLexer *lexer) {
  if (lexer->lookahead != '}') {
    return NO_BOUNDARY;
  }

  lexer->advance(lexer, false);
  while (is_horizontal_space(lexer->lookahead)) {
    lexer->advance(lexer, false);
  }
  if (lexer->lookahead == '\r') {
    lexer->advance(lexer, false);
    if (lexer->lookahead == '\n') {
      lexer->advance(lexer, false);
    }
  } else if (lexer->lookahead == '\n') {
    lexer->advance(lexer, false);
  } else {
    return NO_BOUNDARY;
  }

  lexer->mark_end(lexer);
  if (is_horizontal_space(lexer->lookahead) || lexer->lookahead == 'e') {
    return scan_terminator(lexer) ? SCRIPT_TERMINATOR_BOUNDARY : NO_BOUNDARY;
  }

  return scan_complete_stanza_header(lexer) ? STANZA_RECOVERY_BOUNDARY
                                             : NO_BOUNDARY;
}

void *tree_sitter_logrotate_external_scanner_create(void) {
  return NULL;
}

void tree_sitter_logrotate_external_scanner_destroy(void *payload) {
  (void)payload;
}

unsigned tree_sitter_logrotate_external_scanner_serialize(void *payload,
                                                          char *buffer) {
  (void)payload;
  (void)buffer;
  return 0;
}

void tree_sitter_logrotate_external_scanner_deserialize(void *payload,
                                                        const char *buffer,
                                                        unsigned length) {
  (void)payload;
  (void)buffer;
  (void)length;
}

bool tree_sitter_logrotate_external_scanner_scan(void *payload, TSLexer *lexer,
                                                 const bool *valid_symbols) {
  (void)payload;

  if ((!valid_symbols[SCRIPT_BODY] && !valid_symbols[RECOVERY_SCRIPT_BODY]) ||
      valid_symbols[ERROR_SENTINEL]) {
    return false;
  }

  bool consumed = false;
  lexer->mark_end(lexer);

  for (;;) {
    if (lexer->eof(lexer)) {
      if (!consumed) {
        return false;
      }
      lexer->mark_end(lexer);
      lexer->result_symbol = SCRIPT_BODY;
      return true;
    }

    lexer->mark_end(lexer);
    if (scan_terminator(lexer)) {
      if (!consumed) {
        return false;
      }
      lexer->result_symbol = SCRIPT_BODY;
      return true;
    }

    if (valid_symbols[RECOVERY_SCRIPT_BODY]) {
      const enum BoundaryType boundary =
          scan_boundary_after_closing_brace(lexer);
      if (boundary == SCRIPT_TERMINATOR_BOUNDARY) {
        lexer->result_symbol = SCRIPT_BODY;
        return true;
      }
      if (boundary == STANZA_RECOVERY_BOUNDARY) {
        lexer->result_symbol = RECOVERY_SCRIPT_BODY;
        return true;
      }
    }

    consumed = true;
    while (!lexer->eof(lexer) && !is_line_ending(lexer->lookahead)) {
      lexer->advance(lexer, false);
    }

    if (lexer->lookahead == '\r') {
      lexer->advance(lexer, false);
      if (lexer->lookahead == '\n') {
        lexer->advance(lexer, false);
      }
    } else if (lexer->lookahead == '\n') {
      lexer->advance(lexer, false);
    }

    lexer->mark_end(lexer);
  }
}
