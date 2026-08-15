#ifndef TREE_SITTER_LOGROTATE_H_
#define TREE_SITTER_LOGROTATE_H_

typedef struct TSLanguage TSLanguage;

#ifdef __cplusplus
extern "C" {
#endif

const TSLanguage *tree_sitter_logrotate(void);
/** Get the language for logrotate state files. */
const TSLanguage *tree_sitter_logrotate_state(void);

#ifdef __cplusplus
}
#endif

#endif // TREE_SITTER_LOGROTATE_H_
