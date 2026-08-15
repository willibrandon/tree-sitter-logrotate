local source = assert(debug.getinfo(1, "S").source):sub(2)
local repository = vim.fs.dirname(vim.fs.normalize(source))
vim.opt.runtimepath:prepend(repository)

local logrotate = require("tree-sitter-logrotate")
logrotate.register_parsers()

local success = logrotate.update({ summary = true }):wait(300000)
assert(success, "failed to install the logrotate configuration and state parsers; run :TSLog for details")
