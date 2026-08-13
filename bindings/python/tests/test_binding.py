from unittest import TestCase

from tree_sitter import Language, Parser
import tree_sitter_logrotate


class TestLanguage(TestCase):
    def test_can_parse_logrotate_configuration(self):
        parser = Parser(Language(tree_sitter_logrotate.language()))
        tree = parser.parse(b"/var/log/application.log {\n  rotate 7\n  compress\n}\n")
        self.assertFalse(tree.root_node.has_error, tree.root_node)
