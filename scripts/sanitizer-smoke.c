#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <tree_sitter/api.h>

const TSLanguage *tree_sitter_logrotate(void);

static int parse_and_check(TSParser *parser, const char *source, size_t length,
                           bool expect_error) {
  TSTree *tree = ts_parser_parse_string(parser, NULL, source, (uint32_t)length);
  if (tree == NULL) {
    return 1;
  }

  const bool has_error = ts_node_has_error(ts_tree_root_node(tree));
  ts_tree_delete(tree);
  return has_error == expect_error ? 0 : 2;
}

static int check_incremental_repair(TSParser *parser) {
  static const char before[] =
      "/var/log/editing.log {\n"
      "  postrotate\n"
      "    echo editing\n"
      "}\n";
  static const char after[] =
      "/var/log/editing.log {\n"
      "  postrotate\n"
      "    echo editing\n"
      "  endscript\n"
      "}\n";
  static const char insertion[] = "  endscript\n";
  const uint32_t insertion_byte = (uint32_t)(sizeof(before) - sizeof("}\n"));

  TSTree *old_tree =
      ts_parser_parse_string(parser, NULL, before, (uint32_t)(sizeof(before) - 1));
  if (old_tree == NULL || !ts_node_has_error(ts_tree_root_node(old_tree))) {
    ts_tree_delete(old_tree);
    return 1;
  }

  const TSInputEdit edit = {
      .start_byte = insertion_byte,
      .old_end_byte = insertion_byte,
      .new_end_byte = insertion_byte + (uint32_t)(sizeof(insertion) - 1),
      .start_point = {.row = 3, .column = 0},
      .old_end_point = {.row = 3, .column = 0},
      .new_end_point = {.row = 4, .column = 0},
  };
  ts_tree_edit(old_tree, &edit);

  TSTree *new_tree = ts_parser_parse_string(
      parser, old_tree, after, (uint32_t)(sizeof(after) - 1));
  const bool repaired = new_tree != NULL &&
                        !ts_node_has_error(ts_tree_root_node(new_tree));
  ts_tree_delete(new_tree);
  ts_tree_delete(old_tree);
  return repaired ? 0 : 2;
}

static int check_large_script(TSParser *parser) {
  static const char prefix[] = "/var/log/large.log {\n  postrotate\n";
  static const char line[] = "    echo endscript_suffix\n";
  static const char suffix[] = "  endscript\n}\n";
  const size_t repetitions = 50000;
  const size_t length = sizeof(prefix) - 1 + repetitions * (sizeof(line) - 1) +
                        sizeof(suffix) - 1;
  char *source = malloc(length + 1);
  if (source == NULL) {
    return 1;
  }

  char *cursor = source;
  memcpy(cursor, prefix, sizeof(prefix) - 1);
  cursor += sizeof(prefix) - 1;
  for (size_t index = 0; index < repetitions; ++index) {
    memcpy(cursor, line, sizeof(line) - 1);
    cursor += sizeof(line) - 1;
  }
  memcpy(cursor, suffix, sizeof(suffix));

  const int result = parse_and_check(parser, source, length, false);
  free(source);
  return result;
}

int main(void) {
  static const char valid[] =
      "include /etc/logrotate.d\n"
      "/var/log/application.log {\n"
      "  rotate 7\n"
      "  postrotate\n"
      "    echo endscript now\n"
      "    endscript_suffix\n"
      "  endscript\n"
      "}\n";
  static const char malformed[] =
      "/var/log/application.log {\n"
      "  postrotate\n"
      "    echo unterminated\n";

  TSParser *parser = ts_parser_new();
  if (parser == NULL) {
    return 1;
  }
  if (!ts_parser_set_language(parser, tree_sitter_logrotate())) {
    ts_parser_delete(parser);
    return 2;
  }

  int result = parse_and_check(parser, valid, sizeof(valid) - 1, false);
  if (result == 0) {
    result = parse_and_check(parser, malformed, sizeof(malformed) - 1, true);
  }
  if (result == 0) {
    result = check_incremental_repair(parser);
  }
  if (result == 0) {
    result = check_large_script(parser);
  }

  ts_parser_delete(parser);
  return result;
}
