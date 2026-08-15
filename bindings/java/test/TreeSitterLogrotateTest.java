import io.github.treesitter.jtreesitter.Language;
import io.github.treesitter.jtreesitter.Parser;
import io.github.treesitter.jtreesitter.Tree;
import io.github.treesitter.jtreesitter.logrotate.TreeSitterLogrotate;
import java.util.Objects;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

public class TreeSitterLogrotateTest {
    @Test
    public void testCanParseLogrotateConfiguration() {
        var source = "/var/log/application.log {\n  rotate 7\n  compress\n}\n";
        var language = new Language(Objects.requireNonNull(TreeSitterLogrotate.language()));
        try (var parser = new Parser(language);
             Tree tree = parser.parse(source).orElseThrow()) {
            var root = tree.getRootNode();
            assertFalse(root.hasError(), root.toSexp());
            assertEquals("source_file", root.getType());
            assertEquals(1, root.getNamedChildCount());
            var block = root.getNamedChild(0).orElseThrow();
            assertEquals("rotation_block", block.getType());
            assertEquals("/var/log/application.log", block.getChildByFieldName("paths").orElseThrow().getText());
            var directives = block.getChildrenByFieldName("body");
            assertEquals(2, directives.size());
            assertEquals("rotate", directives.get(0).getChildByFieldName("name").orElseThrow().getText());
            assertEquals("compress", directives.get(1).getChildByFieldName("name").orElseThrow().getText());
            var arguments = directives.get(0).getChildByFieldName("arguments").orElseThrow();
            var argument = arguments.getNamedChild(0).orElseThrow();
            assertEquals("7", argument.getNamedChild(0).orElseThrow().getText());
            assertEquals(
                "(rotation_block paths: (path_list (path_pattern)) body: (directive name: (directive_name) arguments: (directive_arguments (argument (integer)))) body: (directive name: (directive_name)))",
                block.toSexp());
        }
    }


    @Test
    public void testCanParseLogrotateStateFile() {
        var source = "logrotate state -- version 2\n\"/var/log/application.log\" 2026-8-14-12:30:45\n";
        var language = new Language(Objects.requireNonNull(TreeSitterLogrotate.stateLanguage()));
        try (var parser = new Parser(language);
             Tree tree = parser.parse(source).orElseThrow()) {
            var root = tree.getRootNode();
            assertFalse(root.hasError(), root.toSexp());
            assertEquals("source_file", root.getType());
            assertEquals(java.util.List.of("header", "record"), root.getNamedChildren().stream().map(node -> node.getType()).toList());

            var header = root.getNamedChild(0).orElseThrow();
            var record = root.getNamedChild(1).orElseThrow();
            assertEquals("logrotate state -- version", header.getChildByFieldName("keyword").orElseThrow().getText());
            assertEquals("2", header.getChildByFieldName("version").orElseThrow().getText());
            assertEquals("\"/var/log/application.log\"", record.getChildByFieldName("path").orElseThrow().getText());
            var timestamp = record.getChildByFieldName("timestamp").orElseThrow();
            assertEquals("2026-8-14-12:30:45", timestamp.getText());
            assertEquals("2026", timestamp.getChildByFieldName("year").orElseThrow().getText());
            assertEquals("8", timestamp.getChildByFieldName("month").orElseThrow().getText());
            assertEquals("14", timestamp.getChildByFieldName("day").orElseThrow().getText());
            assertEquals("12", timestamp.getChildByFieldName("hour").orElseThrow().getText());
            assertEquals("30", timestamp.getChildByFieldName("minute").orElseThrow().getText());
            assertEquals("45", timestamp.getChildByFieldName("second").orElseThrow().getText());
        }
    }
}
