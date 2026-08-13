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
    try testing.expect(!tree.rootNode().hasError());
}
