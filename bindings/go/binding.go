package tree_sitter_logrotate

// #cgo CFLAGS: -std=c11 -fPIC
// typedef struct TSLanguage TSLanguage;
// TSLanguage *tree_sitter_logrotate(void);
// TSLanguage *tree_sitter_logrotate_state(void);
import "C"

import "unsafe"

// Get the tree-sitter Language for this grammar.
func Language() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_logrotate())
}

// StateLanguage returns the tree-sitter language for logrotate state files.
func StateLanguage() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_logrotate_state())
}
