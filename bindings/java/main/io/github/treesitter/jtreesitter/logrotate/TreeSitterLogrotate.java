package io.github.treesitter.jtreesitter.logrotate;

import java.io.IOException;
import java.lang.foreign.Arena;
import java.lang.foreign.FunctionDescriptor;
import java.lang.foreign.Linker;
import java.lang.foreign.MemoryLayout;
import java.lang.foreign.MemorySegment;
import java.lang.foreign.SymbolLookup;
import java.lang.foreign.ValueLayout;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;

public final class TreeSitterLogrotate {
    private static final ValueLayout VOID_PTR =
            ValueLayout.ADDRESS.withTargetLayout(MemoryLayout.sequenceLayout(Long.MAX_VALUE, ValueLayout.JAVA_BYTE));
    private static final FunctionDescriptor FUNC_DESC = FunctionDescriptor.of(VOID_PTR);
    private static final Linker LINKER = Linker.nativeLinker();
    private static final TreeSitterLogrotate INSTANCE = new TreeSitterLogrotate();

    private final Arena arena = Arena.ofAuto();
    private volatile SymbolLookup lookup = null;

    private TreeSitterLogrotate() {}

    /**
     * Get the tree-sitter language for this grammar.
     */
    public static MemorySegment language() {
        return language(INSTANCE.findLibrary());
    }

    /**
     * Get the tree-sitter language for this grammar.
     *
     * <strong>The {@linkplain Arena} used in the {@code lookup}
     * must not be closed while the language is being used.</strong>
     */
    public static MemorySegment language(SymbolLookup lookup) {
        return call(lookup, "tree_sitter_logrotate");
    }

    /**
     * Get the tree-sitter language for logrotate state files.
     */
    public static MemorySegment stateLanguage() {
        return stateLanguage(INSTANCE.findLibrary());
    }

    /**
     * Get the tree-sitter language for logrotate state files.
     *
     * <strong>The {@linkplain Arena} used in the {@code lookup}
     * must not be closed while the language is being used.</strong>
     */
    public static MemorySegment stateLanguage(SymbolLookup lookup) {
        return call(lookup, "tree_sitter_logrotate_state");
    }

    private synchronized SymbolLookup findLibrary() {
        if (lookup != null)
            return lookup;

        var library = System.mapLibraryName("tree-sitter-logrotate");
        SymbolLookup resolved;
        try {
            resolved = SymbolLookup.libraryLookup(library, arena);
        } catch (IllegalArgumentException lookupError) {
            try {
                System.loadLibrary("tree-sitter-logrotate");
                resolved = SymbolLookup.loaderLookup();
            } catch (UnsatisfiedLinkError systemError) {
                try {
                    resolved = loadBundledLibrary(library);
                } catch (RuntimeException | UnsatisfiedLinkError bundledError) {
                    lookupError.addSuppressed(systemError);
                    lookupError.addSuppressed(bundledError);
                    throw lookupError;
                }
            }
        }
        lookup = resolved;
        return resolved;
    }

    private SymbolLookup loadBundledLibrary(String library) {
        var resource = "/META-INF/native/%s/%s".formatted(platformId(), library);
        try (var input = TreeSitterLogrotate.class.getResourceAsStream(resource)) {
            if (input == null)
                throw new IllegalStateException("Bundled native library is unavailable for " + platformId());

            var suffixStart = library.lastIndexOf('.');
            var suffix = suffixStart < 0 ? null : library.substring(suffixStart);
            Path extracted = Files.createTempFile("tree-sitter-logrotate-", suffix);
            extracted.toFile().deleteOnExit();
            Files.copy(input, extracted, StandardCopyOption.REPLACE_EXISTING);
            System.load(extracted.toAbsolutePath().toString());
            return SymbolLookup.loaderLookup();
        } catch (IOException error) {
            throw new IllegalStateException("Unable to load " + resource, error);
        }
    }

    private static String platformId() {
        var os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        var architecture = System.getProperty("os.arch", "").toLowerCase(Locale.ROOT);
        var normalizedOs = os.contains("win") ? "win32" : os.contains("mac") ? "darwin" : os.contains("linux") ? "linux" : os;
        var normalizedArchitecture = switch (architecture) {
            case "amd64", "x86_64" -> "x64";
            case "aarch64", "arm64" -> "arm64";
            default -> architecture;
        };
        return "%s-%s".formatted(normalizedOs, normalizedArchitecture);
    }

    private static UnsatisfiedLinkError unresolved(String name) {
        return new UnsatisfiedLinkError("Unresolved symbol: %s".formatted(name));
    }

    @SuppressWarnings("SameParameterValue")
    private static MemorySegment call(SymbolLookup lookup, String name) throws UnsatisfiedLinkError {
        var address = lookup.find(name).orElseThrow(() -> unresolved(name));
        try {
            var function = LINKER.downcallHandle(address, FUNC_DESC);
            return (MemorySegment) function.invokeExact();
        } catch (Throwable e) {
            throw new RuntimeException("Call to %s failed".formatted(name), e);
        }
    }
}
