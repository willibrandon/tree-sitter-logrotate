//! This crate provides Logrotate language support for the [tree-sitter] parsing library.
//!
//! Typically, you will use the [`LANGUAGE`] constant to add this language to a
//! tree-sitter [`Parser`], and then use the parser to parse some code:
//!
//! ```
//! let code = "/var/log/application.log {\n  rotate 7\n}\n";
//! let mut parser = tree_sitter::Parser::new();
//! let language = tree_sitter_logrotate::LANGUAGE;
//! parser
//!     .set_language(&language.into())
//!     .expect("Error loading Logrotate parser");
//! let tree = parser.parse(code, None).unwrap();
//! assert!(!tree.root_node().has_error());
//! let block = tree.root_node().named_child(0).unwrap();
//! assert_eq!(block.kind(), "rotation_block");
//! assert_eq!(block.child_by_field_name("paths").unwrap().utf8_text(code.as_bytes()).unwrap(), "/var/log/application.log");
//! ```
//!
//! [`Parser`]: https://docs.rs/tree-sitter/0.26.12/tree_sitter/struct.Parser.html
//! [tree-sitter]: https://tree-sitter.github.io/

use tree_sitter_language::LanguageFn;

unsafe extern "C" {
    fn tree_sitter_logrotate() -> *const ();
    fn tree_sitter_logrotate_state() -> *const ();
}

/// The tree-sitter [`LanguageFn`] for this grammar.
pub const LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_logrotate) };

/// The tree-sitter [`LanguageFn`] for logrotate state files.
pub const STATE_LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_logrotate_state) };

/// The content of the [`node-types.json`] file for this grammar.
///
/// [`node-types.json`]: https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types
pub const NODE_TYPES: &str = include_str!("../../src/node-types.json");

/// The content of the state grammar's [`node-types.json`] file.
pub const STATE_NODE_TYPES: &str = include_str!("../../src/state/src/node-types.json");

/// The syntax highlighting query for logrotate state files.
pub const STATE_HIGHLIGHTS_QUERY: &str = include_str!("../../src/state/queries/highlights.scm");

#[cfg(with_highlights_query)]
/// The syntax highlighting query for this grammar.
pub const HIGHLIGHTS_QUERY: &str = include_str!("../../queries/highlights.scm");

#[cfg(with_injections_query)]
/// The language injection query for this grammar.
pub const INJECTIONS_QUERY: &str = include_str!("../../queries/injections.scm");

#[cfg(with_locals_query)]
/// The local variable query for this grammar.
pub const LOCALS_QUERY: &str = include_str!("../../queries/locals.scm");

#[cfg(with_tags_query)]
/// The symbol tagging query for this grammar.
pub const TAGS_QUERY: &str = include_str!("../../queries/tags.scm");

#[cfg(test)]
mod tests {
    #[test]
    fn test_can_parse_logrotate_configuration() {
        let source = "/var/log/application.log {\n  rotate 7\n  compress\n}\n";
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE.into())
            .expect("Error loading Logrotate parser");
        let tree = parser.parse(source, None).expect("Parser returned no tree");
        let root = tree.root_node();
        assert!(!root.has_error(), "{root}");
        assert_eq!(root.kind(), "source_file");
        assert_eq!(root.named_child_count(), 1);
        let block = root.named_child(0).expect("missing rotation block");
        assert_eq!(block.kind(), "rotation_block");
        assert_eq!(node_text(block.child_by_field_name("paths"), source), "/var/log/application.log");
        assert_eq!(block.named_child_count(), 3);
        let rotate = block.named_child(1).expect("missing rotate directive");
        let compress = block.named_child(2).expect("missing compress directive");
        assert_eq!(node_text(rotate.child_by_field_name("name"), source), "rotate");
        assert_eq!(node_text(compress.child_by_field_name("name"), source), "compress");
        let arguments = rotate.child_by_field_name("arguments").expect("missing rotate arguments");
        let argument = arguments.named_child(0).expect("missing rotate argument");
        assert_eq!(node_text(argument.named_child(0), source), "7");
        assert_eq!(
            block.to_sexp(),
            "(rotation_block paths: (path_list (path_pattern)) body: (directive name: (directive_name) arguments: (directive_arguments (argument (integer)))) body: (directive name: (directive_name)))"
        );
    }

    #[test]
    fn test_can_parse_logrotate_state_file() {
        let source = "logrotate state -- version 2\n\"/var/log/application.log\" 2026-8-14-12:30:45\n";
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::STATE_LANGUAGE.into())
            .expect("Error loading Logrotate state parser");
        let tree = parser.parse(source, None).expect("Parser returned no tree");
        let root = tree.root_node();
        assert!(!root.has_error(), "{root}");
        assert_eq!(root.kind(), "source_file");
        assert_eq!(root.named_child_count(), 2);
        let header = root.named_child(0).expect("missing state header");
        let record = root.named_child(1).expect("missing state record");
        assert_eq!(header.kind(), "header");
        assert_eq!(record.kind(), "record");
        assert_eq!(node_text(header.child_by_field_name("keyword"), source), "logrotate state -- version");
        assert_eq!(node_text(header.child_by_field_name("version"), source), "2");
        assert_eq!(node_text(record.child_by_field_name("path"), source), "\"/var/log/application.log\"");
        let timestamp = record.child_by_field_name("timestamp").expect("missing timestamp");
        assert_eq!(node_text(Some(timestamp), source), "2026-8-14-12:30:45");
        for (field, expected) in [
            ("year", "2026"), ("month", "8"), ("day", "14"),
            ("hour", "12"), ("minute", "30"), ("second", "45"),
        ] {
            assert_eq!(node_text(timestamp.child_by_field_name(field), source), expected, "{field}");
        }
    }

    fn node_text<'a>(node: Option<tree_sitter::Node<'_>>, source: &'a str) -> &'a str {
        node.expect("missing syntax node")
            .utf8_text(source.as_bytes())
            .expect("node text is not UTF-8")
    }
}
