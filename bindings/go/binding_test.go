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

	source := []byte("/var/log/application.log {\n  rotate 7\n  compress\n}\n")
	tree := parser.Parse(source, nil)
	if tree == nil {
		t.Fatal("Parser returned no tree")
	}
	defer tree.Close()
	if tree.RootNode().HasError() {
		t.Fatalf("Parser returned an error tree: %s", tree.RootNode().ToSexp())
	}
	root := tree.RootNode()
	if root.Kind() != "source_file" || root.NamedChildCount() != 1 {
		t.Fatalf("Unexpected configuration root: %s", root.ToSexp())
	}
	block := root.NamedChild(0)
	if block == nil || block.Kind() != "rotation_block" {
		t.Fatalf("Expected one rotation_block, got: %s", root.ToSexp())
	}
	if path := block.ChildByFieldName("paths"); path == nil || path.Utf8Text(source) != "/var/log/application.log" {
		t.Fatalf("Unexpected rotation path in: %s", block.ToSexp())
	}
	if block.NamedChildCount() != 3 {
		t.Fatalf("Expected a path list and two directives, got: %s", block.ToSexp())
	}
	rotate := block.NamedChild(1)
	compress := block.NamedChild(2)
	assertFieldText(t, rotate, "name", source, "rotate")
	assertFieldText(t, compress, "name", source, "compress")
	arguments := rotate.ChildByFieldName("arguments")
	if arguments == nil || arguments.NamedChildCount() != 1 {
		t.Fatalf("Expected rotate arguments in: %s", rotate.ToSexp())
	}
	argument := arguments.NamedChild(0)
	if argument == nil || argument.NamedChildCount() != 1 || argument.NamedChild(0).Utf8Text(source) != "7" {
		t.Fatalf("Expected integer argument 7 in: %s", rotate.ToSexp())
	}
	if got := block.ToSexp(); got != "(rotation_block paths: (path_list (path_pattern)) body: (directive name: (directive_name) arguments: (directive_arguments (argument (integer)))) body: (directive name: (directive_name)))" {
		t.Fatalf("Unexpected rotation structure: %s", got)
	}
}

func TestCanParseLogrotateStateFile(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_logrotate.StateLanguage())
	if language == nil {
		t.Fatal("Error loading Logrotate state grammar")
	}

	parser := tree_sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(language); err != nil {
		t.Fatalf("Error setting Logrotate state grammar: %v", err)
	}

	source := []byte("logrotate state -- version 2\n\"/var/log/application.log\" 2026-8-14-12:30:45\n")
	tree := parser.Parse(source, nil)
	if tree == nil {
		t.Fatal("Parser returned no tree")
	}
	defer tree.Close()
	if tree.RootNode().HasError() {
		t.Fatalf("Parser returned an error tree: %s", tree.RootNode().ToSexp())
	}
	root := tree.RootNode()
	if root.Kind() != "source_file" || root.NamedChildCount() != 2 {
		t.Fatalf("Unexpected state root: %s", root.ToSexp())
	}
	header := root.NamedChild(0)
	record := root.NamedChild(1)
	if header == nil || header.Kind() != "header" || record == nil || record.Kind() != "record" {
		t.Fatalf("Expected header and record, got: %s", root.ToSexp())
	}
	assertFieldText(t, header, "keyword", source, "logrotate state -- version")
	assertFieldText(t, header, "version", source, "2")
	assertFieldText(t, record, "path", source, "\"/var/log/application.log\"")
	timestamp := record.ChildByFieldName("timestamp")
	if timestamp == nil {
		t.Fatalf("Missing timestamp in: %s", record.ToSexp())
	}
	assertFieldText(t, record, "timestamp", source, "2026-8-14-12:30:45")
	for field, expected := range map[string]string{
		"year": "2026", "month": "8", "day": "14",
		"hour": "12", "minute": "30", "second": "45",
	} {
		assertFieldText(t, timestamp, field, source, expected)
	}
}

func assertFieldText(t *testing.T, node *tree_sitter.Node, field string, source []byte, expected string) {
	t.Helper()
	child := node.ChildByFieldName(field)
	if child == nil {
		t.Fatalf("Missing %q field in %s", field, node.ToSexp())
	}
	if actual := child.Utf8Text(source); actual != expected {
		t.Errorf("%s field: got %q, want %q", field, actual, expected)
	}
}
