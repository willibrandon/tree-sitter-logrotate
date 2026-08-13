import io.github.treesitter.jtreesitter.Language;
import io.github.treesitter.jtreesitter.Parser;
import io.github.treesitter.jtreesitter.Tree;
import io.github.treesitter.jtreesitter.logrotate.TreeSitterLogrotate;
import java.util.Objects;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;

public class TreeSitterLogrotateTest {
    @Test
    public void testCanParseLogrotateConfiguration() {
        var language = new Language(Objects.requireNonNull(TreeSitterLogrotate.language()));
        try (var parser = new Parser(language);
             Tree tree = parser.parse("/var/log/application.log {\n  rotate 7\n  compress\n}\n").orElseThrow()) {
            assertFalse(tree.getRootNode().hasError(), tree.getRootNode().toSexp());
        }
    }
}
