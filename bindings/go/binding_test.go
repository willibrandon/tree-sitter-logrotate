package tree_sitter_logrotate_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_logrotate "github.com/willibrandon/tree-sitter-logrotate/bindings/go"
)

func TestCanParseLogrotateConfiguration(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_logrotate.Language())
	if language == nil {
		t.Fatal("Error loading Logrotate grammar")
	}

	parser := tree_sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(language); err != nil {
		t.Fatalf("Error setting Logrotate grammar: %v", err)
	}

	tree := parser.Parse([]byte("/var/log/application.log {\n  rotate 7\n  compress\n}\n"), nil)
	if tree == nil {
		t.Fatal("Parser returned no tree")
	}
	defer tree.Close()
	if tree.RootNode().HasError() {
		t.Fatalf("Parser returned an error tree: %s", tree.RootNode().ToSexp())
	}
}
