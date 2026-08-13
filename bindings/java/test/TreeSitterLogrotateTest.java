import io.github.treesitter.jtreesitter.Language;
import io.github.treesitter.jtreesitter.logrotate.TreeSitterLogrotate;
import java.util.Objects;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

public class TreeSitterLogrotateTest {
    @Test
    public void testCanLoadLanguage() {
        assertDoesNotThrow(() -> new Language(Objects.requireNonNull(TreeSitterLogrotate.language())));
    }
}
