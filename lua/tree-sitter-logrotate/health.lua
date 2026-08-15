local M = {}

local function executable(name, description)
  if vim.fn.executable(name) == 1 then
    vim.health.ok(description .. ": " .. vim.fn.exepath(name))
  else
    vim.health.error(description .. " was not found in PATH")
  end
end

local function parser(language)
  local ok, loaded = pcall(vim.treesitter.language.add, language)
  if ok and loaded then
    vim.health.ok(language .. " parser is installed and loadable")
  else
    vim.health.error(language .. " parser is unavailable; run :LogrotateInstall")
  end
end

local function query(language, kind)
  local ok, value = pcall(vim.treesitter.query.get, language, kind)
  if ok and value ~= nil then
    vim.health.ok(language .. " " .. kind .. " query is available")
  else
    vim.health.error(language .. " " .. kind .. " query is unavailable")
  end
end

function M.check()
  vim.health.start("tree-sitter-logrotate")

  if vim.fn.has("nvim-0.12.0") == 1 then
    vim.health.ok("Neovim >= 0.12.0")
  else
    vim.health.error("Neovim >= 0.12.0 is required")
  end

  local ok = pcall(require, "nvim-treesitter")
  if ok then
    vim.health.ok("nvim-treesitter is available")
  else
    vim.health.error("nvim-treesitter is required")
  end

  executable("tree-sitter", "Tree-sitter CLI")
  if vim.env.CC ~= nil and vim.env.CC ~= "" then
    vim.health.ok("C compiler is configured through CC=" .. vim.env.CC)
  elseif vim.fn.executable("cc") == 1 then
    vim.health.ok("C compiler: " .. vim.fn.exepath("cc"))
  elseif vim.fn.executable("cl") == 1 then
    vim.health.ok("C compiler: " .. vim.fn.exepath("cl"))
  else
    vim.health.error("A C compiler is required to install parsers")
  end

  parser("logrotate")
  parser("logrotate_state")
  parser("bash")
  query("logrotate", "highlights")
  query("logrotate", "injections")
  query("logrotate", "folds")
  query("logrotate", "indents")
  query("logrotate_state", "highlights")
end

return M
