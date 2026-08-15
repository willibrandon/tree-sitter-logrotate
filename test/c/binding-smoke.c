#include "tree_sitter/api.h"
#include "tree_sitter/tree-sitter-logrotate.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static bool contains_error(TSNode node) {
  if (ts_node_is_error(node) || ts_node_is_missing(node)) {
    return true;
  }
  const uint32_t child_count = ts_node_child_count(node);
  for (uint32_t index = 0; index < child_count; index++) {
    if (contains_error(ts_node_child(node, index))) {
      return true;
    }
  }
  return false;
}

static bool node_text_equals(TSNode node, const char *source,
                             const char *expected) {
  const uint32_t start = ts_node_start_byte(node);
  const uint32_t length = ts_node_end_byte(node) - start;
  return strlen(expected) == length && strncmp(source + start, expected, length) == 0;
}

static bool field_text_equals(TSNode node, const char *field,
                              const char *source, const char *expected) {
  const TSNode child = ts_node_child_by_field_name(node, field, (uint32_t)strlen(field));
  return !ts_node_is_null(child) && node_text_equals(child, source, expected);
}

static bool configuration_tree_is_correct(TSTree *tree, const char *source) {
  if (tree == NULL) return false;
  const TSNode root = ts_tree_root_node(tree);
  if (contains_error(root) || strcmp(ts_node_type(root), "source_file") != 0 ||
      ts_node_named_child_count(root) != 1) {
    return false;
  }
  const TSNode block = ts_node_named_child(root, 0);
  const TSNode rotate = ts_node_named_child(block, 1);
  const TSNode compress = ts_node_named_child(block, 2);
  const TSNode arguments = ts_node_child_by_field_name(rotate, "arguments", 9);
  const TSNode argument = ts_node_named_child(arguments, 0);
  const TSNode integer = ts_node_named_child(argument, 0);
  char *structure = ts_node_string(block);
  const bool correct = strcmp(ts_node_type(block), "rotation_block") == 0 &&
      ts_node_named_child_count(block) == 3 &&
      field_text_equals(block, "paths", source, "/var/log/application.log") &&
      field_text_equals(rotate, "name", source, "rotate") &&
      field_text_equals(compress, "name", source, "compress") &&
      !ts_node_is_null(integer) && strcmp(ts_node_type(integer), "integer") == 0 &&
      node_text_equals(integer, source, "7") &&
      structure != NULL && strcmp(structure,
          "(rotation_block paths: (path_list (path_pattern)) body: (directive name: (directive_name) arguments: (directive_arguments (argument (integer)))) body: (directive name: (directive_name)))") == 0;
  free(structure);
  return correct;
}

static bool state_tree_is_correct(TSTree *tree, const char *source) {
  if (tree == NULL) return false;
  const TSNode root = ts_tree_root_node(tree);
  if (contains_error(root) || strcmp(ts_node_type(root), "source_file") != 0 ||
      ts_node_named_child_count(root) != 2) {
    return false;
  }

  const TSNode header = ts_node_named_child(root, 0);
  const TSNode record = ts_node_named_child(root, 1);
  if (strcmp(ts_node_type(header), "header") != 0 ||
      strcmp(ts_node_type(record), "record") != 0 ||
      !field_text_equals(header, "keyword", source, "logrotate state -- version") ||
      !field_text_equals(header, "version", source, "2") ||
      !field_text_equals(record, "path", source, "\"/var/log/application.log\"") ||
      !field_text_equals(record, "timestamp", source, "2026-8-14-12:30:45")) {
    return false;
  }

  const TSNode timestamp = ts_node_child_by_field_name(record, "timestamp", 9);
  static const char *fields[] = {"year", "month", "day", "hour", "minute", "second"};
  static const char *values[] = {"2026", "8", "14", "12", "30", "45"};
  for (size_t index = 0; index < sizeof(fields) / sizeof(fields[0]); index++) {
    if (!field_text_equals(timestamp, fields[index], source, values[index])) return false;
  }
  return true;
}

int main(void) {
  static const char configuration[] =
      "/var/log/application.log {\n"
      "  rotate 7\n"
      "  compress\n"
      "}\n";
  static const char state[] =
      "logrotate state -- version 2\n"
      "\"/var/log/application.log\" 2026-8-14-12:30:45\n";
  TSParser *parser = ts_parser_new();
  if (parser == NULL ||
      !ts_parser_set_language(parser, tree_sitter_logrotate())) {
    fputs("Could not load the Logrotate language.\n", stderr);
    ts_parser_delete(parser);
    return 1;
  }
  TSTree *tree = ts_parser_parse_string(parser, NULL, configuration,
                                        (uint32_t)strlen(configuration));
  bool failed = !configuration_tree_is_correct(tree, configuration);
  ts_tree_delete(tree);
  if (!ts_parser_set_language(parser, tree_sitter_logrotate_state())) {
    fputs("Could not load the Logrotate state language.\n", stderr);
    ts_parser_delete(parser);
    return 1;
  }
  tree = ts_parser_parse_string(parser, NULL, state, (uint32_t)strlen(state));
  failed = failed || !state_tree_is_correct(tree, state);
  ts_tree_delete(tree);
  ts_parser_delete(parser);
  return failed ? 1 : 0;
}
