# Queries

The canonical queries are portable Tree-sitter queries:

- `highlights.scm` captures comments, structural and known directives, values, paths, escapes,
  user and group arguments, and punctuation using common capture names.
- `injections.scm` injects Bash into `script_body` only.
- `folds.scm` folds complete rotation and script blocks.

Host-specific predicates, captures, indentation, text objects, and outline queries belong in the
corresponding integration. Run `npm run test:highlight` and `npm run test:node` after changing a
query or public grammar node.
