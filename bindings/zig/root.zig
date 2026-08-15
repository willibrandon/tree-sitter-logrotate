extern fn tree_sitter_logrotate() callconv(.c) *const anyopaque;
extern fn tree_sitter_logrotate_state() callconv(.c) *const anyopaque;

pub fn language() *const anyopaque {
    return tree_sitter_logrotate();
}

pub fn stateLanguage() *const anyopaque {
    return tree_sitter_logrotate_state();
}
