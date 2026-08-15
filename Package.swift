// swift-tools-version:5.9

import PackageDescription

let sources = ["src/parser.c", "src/scanner.c", "src/state/src/parser.c"]

let package = Package(
    name: "TreeSitterLogrotate",
    products: [
        .library(name: "TreeSitterLogrotate", targets: ["TreeSitterLogrotate"]),
    ],
    dependencies: [
        .package(url: "https://github.com/tree-sitter/swift-tree-sitter", from: "0.25.0"),
    ],
    targets: [
        .target(
            name: "TreeSitterLogrotate",
            dependencies: [],
            path: ".",
            sources: sources,
            resources: [
                .copy("queries")
            ],
            publicHeadersPath: "bindings/swift",
            cSettings: [.headerSearchPath("src")]
        ),
        .testTarget(
            name: "TreeSitterLogrotateTests",
            dependencies: [
                .product(name: "SwiftTreeSitter", package: "swift-tree-sitter"),
                "TreeSitterLogrotate",
            ],
            path: "bindings/swift/TreeSitterLogrotateTests"
        )
    ],
    cLanguageStandard: .c11
)
