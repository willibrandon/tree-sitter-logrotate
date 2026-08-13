#include <stdbool.h>
#include <stddef.h>

#include <tree_sitter/api.h>

const TSLanguage *tree_sitter_logrotate(void);

int main(void) {
  static const char source[] = "hello";
  TSParser *parser = ts_parser_new();
  if (parser == NULL) {
    return 1;
  }

  if (!ts_parser_set_language(parser, tree_sitter_logrotate())) {
    ts_parser_delete(parser);
    return 2;
  }

  TSTree *tree = ts_parser_parse_string(parser, NULL, source, sizeof(source) - 1);
  if (tree == NULL) {
    ts_parser_delete(parser);
    return 3;
  }

  const bool has_error = ts_node_has_error(ts_tree_root_node(tree));
  ts_tree_delete(tree);
  ts_parser_delete(parser);
  return has_error ? 4 : 0;
}
