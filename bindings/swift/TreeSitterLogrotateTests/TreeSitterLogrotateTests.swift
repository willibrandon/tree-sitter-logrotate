import XCTest
import SwiftTreeSitter
import TreeSitterLogrotate

final class TreeSitterLogrotateTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_logrotate())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Logrotate grammar")
    }
}
