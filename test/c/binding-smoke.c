#include "tree_sitter/api.h"
#include "tree_sitter/tree-sitter-logrotate.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
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

int main(void) {
  static const char source[] =
      "/var/log/application.log {\n"
      "  rotate 7\n"
      "  compress\n"
      "}\n";
  TSParser *parser = ts_parser_new();
  if (parser == NULL ||
      !ts_parser_set_language(parser, tree_sitter_logrotate())) {
    fputs("Could not load the Logrotate language.\n", stderr);
    ts_parser_delete(parser);
    return 1;
  }
  TSTree *tree = ts_parser_parse_string(parser, NULL, source,
                                        (uint32_t)strlen(source));
  const bool failed = tree == NULL || contains_error(ts_tree_root_node(tree));
  ts_tree_delete(tree);
  ts_parser_delete(parser);
  return failed ? 1 : 0;
}
