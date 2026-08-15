const testing = @import("std").testing;

const ts = @import("tree-sitter");
const root = @import("tree-sitter-logrotate");
const Language = ts.Language;
const Parser = ts.Parser;

test "can parse a logrotate configuration" {
    const parser = Parser.create();
    defer parser.destroy();

    const lang: *const ts.Language = Language.fromRaw(root.language());
    defer lang.destroy();

    try testing.expectEqual(void{}, parser.setLanguage(lang));
    try testing.expectEqual(lang, parser.getLanguage());

    const source = "/var/log/application.log {\n  rotate 7\n  compress\n}\n";
    const tree = parser.parseString(source, null) orelse return error.ParseFailed;
    defer tree.destroy();
    const syntax_root = tree.rootNode();
    try testing.expect(!syntax_root.hasError());
    try testing.expectEqualStrings("source_file", syntax_root.kind());
    try testing.expectEqual(@as(u32, 1), syntax_root.namedChildCount());
    const block = syntax_root.namedChild(0) orelse return error.MissingRotationBlock;
    try testing.expectEqualStrings("rotation_block", block.kind());
    try testing.expectEqualStrings("/var/log/application.log", nodeText(block.childByFieldName("paths") orelse return error.MissingPaths, source));

    var cursor = block.walk();
    defer cursor.destroy();
    const bodies = try block.childrenByFieldName("body", &cursor, testing.allocator);
    defer testing.allocator.free(bodies);
    try testing.expectEqual(@as(usize, 2), bodies.len);
    try testing.expectEqualStrings("rotate", nodeText(bodies[0].childByFieldName("name") orelse return error.MissingDirectiveName, source));
    try testing.expectEqualStrings("compress", nodeText(bodies[1].childByFieldName("name") orelse return error.MissingDirectiveName, source));
    const arguments = bodies[0].childByFieldName("arguments") orelse return error.MissingDirectiveArguments;
    const argument = arguments.namedChild(0) orelse return error.MissingDirectiveArgument;
    const integer = argument.namedChild(0) orelse return error.MissingInteger;
    try testing.expectEqualStrings("integer", integer.kind());
    try testing.expectEqualStrings("7", nodeText(integer, source));
}

test "can parse a logrotate state file" {
    const parser = Parser.create();
    defer parser.destroy();

    const lang: *const ts.Language = Language.fromRaw(root.stateLanguage());
    defer lang.destroy();

    try testing.expectEqual(void{}, parser.setLanguage(lang));
    try testing.expectEqual(lang, parser.getLanguage());

    const source = "logrotate state -- version 2\n\"/var/log/application.log\" 2026-8-14-12:30:45\n";
    const tree = parser.parseString(source, null) orelse return error.ParseFailed;
    defer tree.destroy();
    const syntax_root = tree.rootNode();
    try testing.expect(!syntax_root.hasError());
    try testing.expectEqualStrings("source_file", syntax_root.kind());
    try testing.expectEqual(@as(u32, 2), syntax_root.namedChildCount());
    const header = syntax_root.namedChild(0) orelse return error.MissingHeader;
    const record = syntax_root.namedChild(1) orelse return error.MissingRecord;
    try testing.expectEqualStrings("header", header.kind());
    try testing.expectEqualStrings("record", record.kind());
    try testing.expectEqualStrings("logrotate state -- version", nodeText(header.childByFieldName("keyword") orelse return error.MissingKeyword, source));
    try testing.expectEqualStrings("2", nodeText(header.childByFieldName("version") orelse return error.MissingVersion, source));
    try testing.expectEqualStrings("\"/var/log/application.log\"", nodeText(record.childByFieldName("path") orelse return error.MissingPath, source));
    const timestamp = record.childByFieldName("timestamp") orelse return error.MissingTimestamp;
    try testing.expectEqualStrings("2026-8-14-12:30:45", nodeText(timestamp, source));
    const fields = [_][]const u8{ "year", "month", "day", "hour", "minute", "second" };
    const expected = [_][]const u8{ "2026", "8", "14", "12", "30", "45" };
    for (fields, expected) |field, value| {
        try testing.expectEqualStrings(value, nodeText(timestamp.childByFieldName(field) orelse return error.MissingTimestampField, source));
    }
}

fn nodeText(node: ts.Node, source: []const u8) []const u8 {
    return source[@intCast(node.startByte())..@intCast(node.endByte())];
}
