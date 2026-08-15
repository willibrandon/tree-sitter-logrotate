import XCTest
import SwiftTreeSitter
import TreeSitterLogrotate

final class TreeSitterLogrotateTests: XCTestCase {
    func testCanParseLogrotateConfiguration() throws {
        let source = "/var/log/application.log {\n  rotate 7\n  compress\n}\n"
        let parser = Parser()
        let language = Language(language: tree_sitter_logrotate())
        try parser.setLanguage(language)
        let tree = try XCTUnwrap(parser.parse(source))
        let root = try XCTUnwrap(tree.rootNode)
        XCTAssertFalse(root.hasError, String(describing: root))
        XCTAssertEqual(root.nodeType, "source_file")
        XCTAssertEqual(root.namedChildCount, 1)
        let block = try XCTUnwrap(root.namedChild(at: 0))
        XCTAssertEqual(block.nodeType, "rotation_block")
        XCTAssertEqual(try text(of: try XCTUnwrap(block.child(byFieldName: "paths")), in: source), "/var/log/application.log")
        XCTAssertEqual(block.namedChildCount, 3)
        let rotate = try XCTUnwrap(block.namedChild(at: 1))
        let compress = try XCTUnwrap(block.namedChild(at: 2))
        XCTAssertEqual(try text(of: try XCTUnwrap(rotate.child(byFieldName: "name")), in: source), "rotate")
        XCTAssertEqual(try text(of: try XCTUnwrap(compress.child(byFieldName: "name")), in: source), "compress")
        let arguments = try XCTUnwrap(rotate.child(byFieldName: "arguments"))
        let argument = try XCTUnwrap(arguments.namedChild(at: 0))
        XCTAssertEqual(try text(of: try XCTUnwrap(argument.namedChild(at: 0)), in: source), "7")
        XCTAssertEqual(
            block.sExpressionString,
            "(rotation_block paths: (path_list (path_pattern)) body: (directive name: (directive_name) arguments: (directive_arguments (argument (integer)))) body: (directive name: (directive_name)))"
        )
    }

    func testCanParseLogrotateStateFile() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_logrotate_state())
        try parser.setLanguage(language)
        let source = "logrotate state -- version 2\n\"/var/log/application.log\" 2026-8-14-12:30:45\n"
        let tree = try XCTUnwrap(parser.parse(source))
        let root = try XCTUnwrap(tree.rootNode)
        XCTAssertFalse(root.hasError, String(describing: root))
        XCTAssertEqual(root.nodeType, "source_file")
        XCTAssertEqual(root.namedChildCount, 2)
        let header = try XCTUnwrap(root.namedChild(at: 0))
        let record = try XCTUnwrap(root.namedChild(at: 1))
        XCTAssertEqual(header.nodeType, "header")
        XCTAssertEqual(record.nodeType, "record")
        XCTAssertEqual(try text(of: try XCTUnwrap(header.child(byFieldName: "keyword")), in: source), "logrotate state -- version")
        XCTAssertEqual(try text(of: try XCTUnwrap(header.child(byFieldName: "version")), in: source), "2")
        XCTAssertEqual(try text(of: try XCTUnwrap(record.child(byFieldName: "path")), in: source), "\"/var/log/application.log\"")
        let timestamp = try XCTUnwrap(record.child(byFieldName: "timestamp"))
        XCTAssertEqual(try text(of: timestamp, in: source), "2026-8-14-12:30:45")
        XCTAssertEqual(
            try ["year", "month", "day", "hour", "minute", "second"].map {
                try text(of: try XCTUnwrap(timestamp.child(byFieldName: $0)), in: source)
            },
            ["2026", "8", "14", "12", "30", "45"]
        )
    }

    private func text(of node: Node, in source: String) throws -> String {
        let range = try XCTUnwrap(Range<String.Index>(node.range, in: source))
        return String(source[range])
    }
}
