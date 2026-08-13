package tree_sitter_logrotate_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_logrotate "github.com/willibrandon/tree-sitter-logrotate/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_logrotate.Language())
	if language == nil {
		t.Errorf("Error loading Logrotate grammar")
	}
}
