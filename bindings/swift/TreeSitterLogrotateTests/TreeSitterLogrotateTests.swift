import XCTest
import SwiftTreeSitter
import TreeSitterLogrotate

final class TreeSitterLogrotateTests: XCTestCase {
    func testCanParseLogrotateConfiguration() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_logrotate())
        try parser.setLanguage(language)
        let tree = try XCTUnwrap(parser.parse("/var/log/application.log {\n  rotate 7\n  compress\n}\n"))
        let root = try XCTUnwrap(tree.rootNode)
        XCTAssertFalse(root.hasError, String(describing: root))
    }
}
