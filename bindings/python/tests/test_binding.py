from unittest import TestCase

from tree_sitter import Language, Parser
import tree_sitter_logrotate


class TestLanguage(TestCase):
    def test_can_parse_logrotate_configuration(self):
        parser = Parser(Language(tree_sitter_logrotate.language()))
        source = b"/var/log/application.log {\n  rotate 7\n  compress\n}\n"
        tree = parser.parse(source)
        root = tree.root_node
        self.assertFalse(tree.root_node.has_error, tree.root_node)
        self.assertEqual(root.type, "source_file")
        self.assertEqual([child.type for child in root.named_children], ["rotation_block"])

        block = root.named_children[0]
        self.assertEqual(block.child_by_field_name("paths").text, b"/var/log/application.log")
        self.assertEqual(
            [directive.child_by_field_name("name").text for directive in block.children_by_field_name("body")],
            [b"rotate", b"compress"],
        )
        integer = block.descendant_for_byte_range(source.index(b"7"), source.index(b"7") + 1)
        self.assertEqual(integer.type, "integer")
        self.assertEqual(integer.text, b"7")

    def test_can_parse_logrotate_state_file(self):
        parser = Parser(Language(tree_sitter_logrotate.state_language()))
        source = b'logrotate state -- version 2\n"/var/log/application.log" 2026-8-14-12:30:45\n'
        tree = parser.parse(source)
        root = tree.root_node
        self.assertFalse(tree.root_node.has_error, tree.root_node)
        self.assertEqual(root.type, "source_file")
        self.assertEqual([child.type for child in root.named_children], ["header", "record"])

        header, record = root.named_children
        self.assertEqual(header.child_by_field_name("keyword").text, b"logrotate state -- version")
        self.assertEqual(header.child_by_field_name("version").text, b"2")
        self.assertEqual(record.child_by_field_name("path").text, b'"/var/log/application.log"')
        timestamp = record.child_by_field_name("timestamp")
        self.assertEqual(timestamp.text, b"2026-8-14-12:30:45")
        self.assertEqual(
            [timestamp.child_by_field_name(field).text for field in ("year", "month", "day", "hour", "minute", "second")],
            [b"2026", b"8", b"14", b"12", b"30", b"45"],
        )
