from tree_sitter import Language, Parser
from tree_sitter_logrotate import language, state_language


configuration_source = b"/var/log/app.log {\n  daily\n  rotate 7\n}\n"
configuration = Parser(Language(language())).parse(configuration_source)
configuration_root = configuration.root_node
assert configuration_root.type == "source_file"
assert not configuration_root.has_error
assert [child.type for child in configuration_root.named_children] == ["rotation_block"]

rotation = configuration_root.named_children[0]
assert rotation.child_by_field_name("paths").text == b"/var/log/app.log"
directives = rotation.children_by_field_name("body")
assert [directive.child_by_field_name("name").text for directive in directives] == [
    b"daily",
    b"rotate",
]
assert directives[1].child_by_field_name("arguments").named_children[0].named_children[0].text == b"7"

state_source = (
    b"logrotate state -- version 2\n"
    b'"/var/log/app.log" 2026-8-14-12:30:45\n'
)
state = Parser(Language(state_language())).parse(state_source)
state_root = state.root_node
assert state_root.type == "source_file"
assert not state_root.has_error
assert [child.type for child in state_root.named_children] == ["header", "record"]

header, record = state_root.named_children
assert header.child_by_field_name("keyword").text == b"logrotate state -- version"
assert header.child_by_field_name("version").text == b"2"
assert record.child_by_field_name("path").text == b'"/var/log/app.log"'
timestamp = record.child_by_field_name("timestamp")
assert timestamp.text == b"2026-8-14-12:30:45"
assert [
    timestamp.child_by_field_name(field).text
    for field in ("year", "month", "day", "hour", "minute", "second")
] == [b"2026", b"8", b"14", b"12", b"30", b"45"]
