local integration = require("tree-sitter-logrotate")
local repository = integration._repository_root()
local fixture_repository = assert(vim.env.TREE_SITTER_LOGROTATE_ROOT)
local fixture = vim.json.decode(
  table.concat(vim.fn.readfile(fixture_repository .. "/test/fixtures/file-recognition.json"), "\n")
)

vim.filetype.add({
  pattern = {
    [".*"] = {
      function()
        return nil
      end,
      { priority = 2000 },
    },
  },
})

local assertions = 0
local function assert_equal(actual, expected, context)
  assertions = assertions + 1
  if actual ~= expected then
    error(string.format("%s: expected %s, got %s", context, vim.inspect(expected), vim.inspect(actual)))
  end
end

assert_equal(vim.fn.filereadable(repository .. "/pkg.json"), 1, "plugin repository root")
assert_equal(integration.register_parsers(), true, "custom parser registration")
local parser_definitions = require("nvim-treesitter.parsers")
assert_equal(parser_definitions.logrotate.install_info.path, vim.fs.normalize(repository), "configuration parser path")
assert_equal(parser_definitions.logrotate.install_info.queries, "queries/logrotate", "configuration query path")
assert_equal(parser_definitions.logrotate.requires[1], "bash", "configuration parser Bash dependency")
assert_equal(parser_definitions.logrotate_state.install_info.path, vim.fs.normalize(repository), "state parser path")
assert_equal(parser_definitions.logrotate_state.install_info.location, "src/state", "state parser location")
assert_equal(parser_definitions.logrotate_state.install_info.queries, "queries/logrotate_state", "state query path")
assert_equal(vim.fn.exists(":LogrotateInstall"), 2, "parser install command")
assert_equal(vim.fn.exists(":LogrotateUpdate"), 2, "parser update command")
assert_equal(vim.fn.exists(":LogrotateUninstall"), 2, "parser uninstall command")

for _, path in ipairs(fixture.configuration.fileNames.accepted) do
  assert_equal(integration.recognize_path(path), "logrotate", "configuration filename " .. path)
end
for _, path in ipairs(fixture.configuration.fileNames.rejected) do
  assert_equal(integration.recognize_path(path) == "logrotate", false, "rejected configuration filename " .. path)
end
for _, line in ipairs(fixture.configuration.firstLine.accepted) do
  assert_equal(integration.recognize_first_line(line), "logrotate", "configuration first line " .. line)
end
for _, line in ipairs(fixture.configuration.firstLine.rejected) do
  assert_equal(integration.recognize_first_line(line) == "logrotate", false, "rejected configuration first line " .. line)
end

local boundary = fixture.configuration.firstLine.boundary
local boundary_base = boundary.prefix .. string.rep(boundary["repeat"], boundary.count)
assert_equal(
  integration.recognize_first_line(boundary_base .. boundary.acceptedSuffix),
  "logrotate",
  "8,192-byte configuration first line"
)
assert_equal(
  integration.recognize_first_line(boundary_base .. boundary.rejectedSuffix),
  nil,
  "configuration first line above 8,192 bytes"
)

for _, path in ipairs(fixture.state.fileNames.accepted) do
  assert_equal(integration.recognize_path(path), "logrotate_state", "state filename " .. path)
end
for _, path in ipairs(fixture.state.fileNames.rejected) do
  assert_equal(integration.recognize_path(path) == "logrotate_state", false, "rejected state filename " .. path)
end
for _, line in ipairs(fixture.state.firstLine.accepted) do
  assert_equal(integration.recognize_first_line(line), "logrotate_state", "state first line " .. line)
end
for _, line in ipairs(fixture.state.firstLine.rejected) do
  assert_equal(integration.recognize_first_line(line) == "logrotate_state", false, "rejected state first line " .. line)
end

local scratch = vim.fn.tempname()
vim.fn.mkdir(scratch .. "/logrotate.d/nested", "p")
vim.fn.mkdir(scratch .. "/logrotate/nested", "p")
vim.fn.mkdir(scratch .. "/parts/nested", "p")

local function write(path, lines)
  vim.fn.writefile(lines, path)
end

local function edit(path)
  vim.cmd("edit " .. vim.fn.fnameescape(path))
  return vim.api.nvim_get_current_buf()
end

local function wipe(buffer)
  if vim.api.nvim_buf_is_valid(buffer) then
    vim.api.nvim_buf_delete(buffer, { force = true })
  end
end

local function captures(query, tree, source)
  local found = {}
  for capture in query:iter_captures(tree:root(), source) do
    found[query.captures[capture]] = true
  end
  return found
end

local function capture_values(query, tree, source)
  local found = {}
  for capture, node in query:iter_captures(tree:root(), source) do
    local name = query.captures[capture]
    found[name] = found[name] or {}
    table.insert(found[name], vim.treesitter.get_node_text(node, source))
  end
  return found
end

local function node_text(node, source)
  return vim.treesitter.get_node_text(assert(node), source)
end

local function completion_words(items)
  local words = {}
  for _, item in ipairs(items) do
    table.insert(words, item.word)
  end
  table.sort(words)
  return table.concat(words, ",")
end

write(scratch .. "/logrotate.conf", {
  "/var/log/application.log {",
  "  rotate 7",
  "  create 0640 application adm",
  "  su application adm",
  "  postrotate",
  "    printf '%s\\n' rotated",
  "  endscript",
  "}",
})
write(scratch .. "/logrotate.d/application", { "rotate 7" })
write(scratch .. "/logrotate.d/status", { "rotate 7" })
write(scratch .. "/logrotate.d/nested/application", { "rotate 7" })
write(scratch .. "/application.logrotate", { "rotate 7" })
write(scratch .. "/application.logrotate.conf", { "rotate 7" })
write(scratch .. "/application.conf", { "rotate 7" })
write(scratch .. "/logrotate.status", { "logrotate state -- version 2", '"/var/log/application.log" 2026-8-14-0:0:0' })
write(scratch .. "/logrotate/status", { "logrotate state -- version 2", '"/var/log/application.log" 2026-8-14-0:0:0' })
write(scratch .. "/logrotate/nested/status", { "rotate 7" })
write(scratch .. "/content-detected", { "/var/log/application.log {", "}" })
write(scratch .. "/state-content-detected", { "logrotate state -- version 1" })
write(scratch .. "/generic-content", { "rotate 7" })

vim.wo.foldmethod = "indent"
vim.wo.foldexpr = "0"
local buffer = edit(scratch .. "/logrotate.conf")
assert_equal(vim.bo[buffer].filetype, "logrotate", "automatic logrotate.conf detection")
assert_equal(vim.bo[buffer].commentstring, "# %s", "configuration comment string")
assert_equal(vim.bo[buffer].comments, ":#", "configuration comment leader")
assert_equal(
  vim.bo[buffer].omnifunc,
  "v:lua.require'tree-sitter-logrotate'.complete",
  "configuration omnifunc"
)
assert_equal(vim.b[buffer].match_ignorecase, 0, "script matching is case-sensitive")
assert_equal(
  vim.b[buffer].match_words,
  [[\<\%(firstaction\|lastaction\|postrotate\|preremove\|prerotate\)\>:\<endscript\>]],
  "script match words"
)
assert_equal(vim.wo.foldmethod, "expr", "Tree-sitter fold method")
assert_equal(
  vim.tbl_contains({ "v:lua.vim.treesitter.foldexpr()", "v:lua.LazyVim.treesitter.foldexpr()" }, vim.wo.foldexpr),
  true,
  "Tree-sitter fold expression"
)
local parser = vim.treesitter.get_parser(buffer, "logrotate")
local configuration_tree = parser:parse(true)[1]
local configuration_root = configuration_tree:root()
assert_equal(configuration_root:has_error(), false, "configuration parser errors")
assert_equal(configuration_root:type(), "source_file", "configuration parser root")
assert_equal(configuration_root:named_child_count(), 1, "configuration root children")
local rotation = configuration_root:named_child(0)
assert_equal(rotation:type(), "rotation_block", "configuration rotation block")
assert_equal(node_text(rotation:field("paths")[1], buffer), "/var/log/application.log", "configuration path")
local directives = rotation:field("body")
assert_equal(#directives, 4, "configuration directive count")
assert_equal(node_text(directives[1]:field("name")[1], buffer), "rotate", "configuration rotate directive")
assert_equal(node_text(directives[2]:field("name")[1], buffer), "create", "configuration create directive")
assert_equal(node_text(directives[3]:field("name")[1], buffer), "su", "configuration su directive")
assert_equal(node_text(directives[4]:field("directive")[1], buffer), "postrotate", "configuration script directive")
local arguments = directives[1]:field("arguments")[1]
local integer = arguments:named_child(0):named_child(0)
assert_equal(integer:type(), "integer", "configuration integer node")
assert_equal(node_text(integer, buffer), "7", "configuration rotate count")
local configuration_highlights = capture_values(
  assert(vim.treesitter.query.get("logrotate", "highlights")),
  configuration_tree,
  buffer
)
assert_equal(#configuration_highlights["string.special.path"] > 0, true, "configuration path highlight")
assert_equal(#configuration_highlights.keyword > 0, true, "configuration directive highlight")
assert_equal(#configuration_highlights.number > 0, true, "configuration number highlight")
local parameters = configuration_highlights["variable.parameter"] or {}
table.sort(parameters)
assert_equal(
  table.concat(parameters, ","),
  "adm,adm,application,application",
  "configuration user and group highlights"
)
local configuration_folds = captures(
  assert(vim.treesitter.query.get("logrotate", "folds")),
  configuration_tree,
  buffer
)
assert_equal(configuration_folds.fold, true, "configuration folds")
local configuration_indents = capture_values(
  assert(vim.treesitter.query.get("logrotate", "indents")),
  configuration_tree,
  buffer
)
assert_equal(#configuration_indents["indent.begin"], 2, "configuration indent starts")
assert_equal(configuration_indents["indent.branch"][1], "endscript", "script indent branch")
assert_equal(configuration_indents["indent.branch"][2], "}", "rotation indent branch")
assert_equal(configuration_indents["indent.end"][1], "endscript", "script indent end")
assert_equal(configuration_indents["indent.end"][2], "}", "rotation indent end")
assert_equal(parser:children().bash ~= nil, true, "Bash script injection")
local bash_tree = parser:children().bash:parse(true)[1]
assert_equal(bash_tree:root():has_error(), false, "Bash injection parser errors")

vim.wo.foldlevel = 99
vim.api.nvim_win_set_cursor(0, { 1, 0 })
vim.cmd("normal! zc")
assert_equal(vim.fn.foldclosed(1), 1, "rotation fold closes")
assert_equal(vim.fn.foldclosedend(1), 8, "rotation fold range")
vim.cmd("normal! zo")

vim.api.nvim_win_set_cursor(0, { 5, 2 })
vim.cmd("normal %")
assert_equal(vim.fn.line("."), 7, "script opener jumps to endscript")
vim.cmd("normal %")
assert_equal(vim.fn.line("."), 5, "endscript jumps to script opener")

vim.api.nvim_buf_set_lines(buffer, 0, 0, false, { "da" })
vim.api.nvim_win_set_cursor(0, { 1, 2 })
assert_equal(integration.complete(1, ""), 0, "top-level completion start")
local top_level_completions = integration.complete(0, "da")
assert_equal(completion_words(top_level_completions), "daily,dateext,dateformat,datehourago,dateyesterday", "top-level completions")
assert_equal(top_level_completions[1].menu, "[frequency]", "completion category")
assert_equal(top_level_completions[1].info, "Rotate once per day.", "completion documentation")
vim.api.nvim_buf_set_lines(buffer, 0, 1, false, {})

vim.api.nvim_buf_set_lines(buffer, 1, 2, false, { "  pre" })
vim.api.nvim_win_set_cursor(0, { 2, 5 })
assert_equal(integration.complete(1, ""), 2, "rotation-block completion start")
assert_equal(completion_words(integration.complete(0, "pre")), "preremove,prerotate", "rotation-block completions")

vim.api.nvim_buf_set_lines(buffer, 5, 6, false, { "    end" })
vim.api.nvim_win_set_cursor(0, { 6, 7 })
assert_equal(integration.complete(1, ""), 4, "script completion start")
assert_equal(completion_words(integration.complete(0, "end")), "endscript", "script terminator completion")
vim.api.nvim_buf_set_lines(buffer, 5, 6, false, { "    pre" })
vim.api.nvim_win_set_cursor(0, { 6, 7 })
assert_equal(completion_words(integration.complete(0, "pre")), "", "logrotate directives excluded from shell")

vim.api.nvim_buf_set_lines(buffer, 1, 2, false, { "  rotate x" })
vim.api.nvim_win_set_cursor(0, { 2, 9 })
assert_equal(integration.complete(1, ""), -3, "completion excluded from directive arguments")
wipe(buffer)

buffer = edit(scratch .. "/logrotate.d/application")
assert_equal(vim.bo[buffer].filetype, "logrotate", "automatic direct logrotate.d child detection")
wipe(buffer)

buffer = edit(scratch .. "/logrotate.d/status")
assert_equal(vim.bo[buffer].filetype, "logrotate", "direct logrotate.d status is configuration")
wipe(buffer)

buffer = edit(scratch .. "/logrotate.d/nested/application")
assert_equal(vim.bo[buffer].filetype == "logrotate", false, "nested logrotate.d child rejection")
wipe(buffer)

vim.wo.foldmethod = "manual"
vim.wo.foldexpr = "0"
buffer = edit(scratch .. "/application.logrotate")
assert_equal(vim.bo[buffer].filetype, "logrotate", "automatic .logrotate extension detection")
assert_equal(vim.wo.foldmethod, "manual", "custom fold method is preserved")
assert_equal(vim.wo.foldexpr, "0", "custom fold expression is preserved")
wipe(buffer)

buffer = edit(scratch .. "/application.logrotate.conf")
assert_equal(vim.bo[buffer].filetype, "logrotate", "automatic .logrotate.conf suffix detection")
wipe(buffer)

buffer = edit(scratch .. "/application.conf")
assert_equal(vim.bo[buffer].filetype == "logrotate", false, "generic .conf rejection")
wipe(buffer)

buffer = edit(scratch .. "/logrotate.status")
assert_equal(vim.bo[buffer].filetype, "logrotate_state", "automatic state detection")
parser = vim.treesitter.get_parser(buffer, "logrotate_state")
local state_tree = parser:parse()[1]
local state_root = state_tree:root()
assert_equal(state_root:has_error(), false, "state parser accepts a valid state file")
assert_equal(state_root:type(), "source_file", "state parser root")
assert_equal(state_root:named_child_count(), 2, "state root children")
local header = state_root:named_child(0)
local record = state_root:named_child(1)
assert_equal(header:type(), "header", "state header node")
assert_equal(record:type(), "record", "state record node")
assert_equal(node_text(header:field("keyword")[1], buffer), "logrotate state -- version", "state header keyword")
assert_equal(node_text(header:field("version")[1], buffer), "2", "state header version")
assert_equal(node_text(record:field("path")[1], buffer), '"/var/log/application.log"', "state record path")
local timestamp = record:field("timestamp")[1]
assert_equal(node_text(timestamp, buffer), "2026-8-14-0:0:0", "state record timestamp")
for index, field in ipairs({ "year", "month", "day", "hour", "minute", "second" }) do
  local expected = ({ "2026", "8", "14", "0", "0", "0" })[index]
  assert_equal(node_text(timestamp:field(field)[1], buffer), expected, "state timestamp " .. field)
end
local state_highlights = captures(
  assert(vim.treesitter.query.get("logrotate_state", "highlights")),
  state_tree,
  buffer
)
assert_equal(state_highlights.keyword, true, "state header highlight")
assert_equal(state_highlights.number, true, "state timestamp highlight")
assert_equal(state_highlights["string.special.path"], true, "state path highlight")
wipe(buffer)

buffer = edit(scratch .. "/logrotate/status")
assert_equal(vim.bo[buffer].filetype, "logrotate_state", "automatic logrotate/status detection")
wipe(buffer)

buffer = edit(scratch .. "/logrotate/nested/status")
assert_equal(vim.bo[buffer].filetype == "logrotate_state", false, "nested logrotate status rejection")
wipe(buffer)

buffer = edit(scratch .. "/content-detected")
assert_equal(vim.bo[buffer].filetype, "logrotate", "automatic first-line detection")
wipe(buffer)

buffer = edit(scratch .. "/state-content-detected")
assert_equal(vim.bo[buffer].filetype, "logrotate_state", "automatic state first-line detection")
wipe(buffer)

buffer = edit(scratch .. "/generic-content")
assert_equal(vim.bo[buffer].filetype == "logrotate", false, "generic content configuration rejection")
assert_equal(vim.bo[buffer].filetype == "logrotate_state", false, "generic content state rejection")
wipe(buffer)

assert(vim.treesitter.query.get("logrotate", "highlights"), "configuration highlight query must load")
assert(vim.treesitter.query.get("logrotate", "injections"), "configuration injection query must load")
assert(vim.treesitter.query.get("logrotate", "folds"), "configuration fold query must load")
assert(vim.treesitter.query.get("logrotate", "indents"), "configuration indent query must load")
assert(vim.treesitter.query.get("logrotate_state", "highlights"), "state highlight query must load")

local included_file = scratch .. "/included.conf"
write(included_file, { "rotate 7" })
write(scratch .. "/include-root.logrotate", { "include included.conf" })
local root = edit(scratch .. "/include-root.logrotate")
assert_equal(vim.bo[root].filetype, "logrotate", "include root detection")
buffer = edit(included_file)
assert_equal(vim.bo[buffer].filetype, "logrotate", "open-root relative include detection")
wipe(buffer)
wipe(root)

vim.fn.mkdir(scratch .. "/quoted parts", "p")
write(scratch .. "/quoted parts/application config", { "rotate 7" })
write(scratch .. "/quoted-root.logrotate", { 'include "quoted parts/application config"' })
root = edit(scratch .. "/quoted-root.logrotate")
buffer = edit(scratch .. "/quoted parts/application config")
assert_equal(vim.bo[buffer].filetype, "logrotate", "quoted include detection")
wipe(buffer)
wipe(root)

write(scratch .. "/absolute-target", { "rotate 7" })
write(scratch .. "/absolute-root.logrotate", { "include " .. scratch .. "/absolute-target" })
root = edit(scratch .. "/absolute-root.logrotate")
buffer = edit(scratch .. "/absolute-target")
assert_equal(vim.bo[buffer].filetype, "logrotate", "absolute include detection")
wipe(buffer)
wipe(root)

write(scratch .. "/parts/10-application", { "rotate 7" })
write(scratch .. "/parts/nested/application", { "rotate 7" })
write(scratch .. "/directory-root.logrotate", { "include parts" })
root = edit(scratch .. "/directory-root.logrotate")
buffer = edit(scratch .. "/parts/10-application")
assert_equal(vim.bo[buffer].filetype, "logrotate", "included directory direct child detection")
wipe(buffer)
buffer = edit(scratch .. "/parts/nested/application")
assert_equal(vim.bo[buffer].filetype == "logrotate", false, "included directory nested child rejection")
wipe(buffer)
wipe(root)

write(scratch .. "/parts/application.conf", { "rotate 7" })
write(scratch .. "/wildcard-root.logrotate", { "include parts/*.conf" })
root = edit(scratch .. "/wildcard-root.logrotate")
buffer = edit(scratch .. "/parts/application.conf")
assert_equal(vim.bo[buffer].filetype == "logrotate", false, "wildcard include rejection")
wipe(buffer)
wipe(root)

write(scratch .. "/closed-target", { "rotate 7" })
buffer = edit(scratch .. "/closed-target")
assert_equal(vim.bo[buffer].filetype == "logrotate", false, "closed root does not create an association")
wipe(buffer)

assert_equal(
  integration._resolve_include("C:/ProgramData/logrotate/logrotate.conf", "parts/application.conf"),
  "C:/ProgramData/logrotate/parts/application.conf",
  "Windows relative include resolution"
)
assert_equal(
  integration._resolve_include("C:/ProgramData/logrotate/logrotate.conf", "D:/logrotate/application.conf"),
  "D:/logrotate/application.conf",
  "Windows absolute include resolution"
)
assert_equal(
  integration._resolve_include("C:/ProgramData/logrotate/logrotate.conf", [[D:\logrotate\application.conf]]),
  "D:/logrotate/application.conf",
  "Windows backslash include resolution"
)
assert_equal(
  integration._resolve_include("C:/ProgramData/logrotate/logrotate.conf", [[\\server\share\application.conf]]),
  "//server/share/application.conf",
  "Windows UNC include resolution"
)
assert_equal(
  integration._resolve_include("/workspace/logrotate.conf", "parts/*.conf"),
  nil,
  "wildcard include resolution rejection"
)

vim.fn.delete(scratch, "rf")
print(string.format("Neovim integration passed %d assertions.", assertions))
