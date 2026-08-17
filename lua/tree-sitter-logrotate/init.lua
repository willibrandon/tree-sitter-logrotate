local M = {}

local MAXIMUM_FIRST_LINE_LENGTH = 8192
local SCRIPT_DIRECTIVES = {
  firstaction = true,
  lastaction = true,
  preremove = true,
  prerotate = true,
  postrotate = true,
}
local SCRIPT_INDENT_KEYS = {
  "0=then",
  "0=do",
  "0=else",
  "0=elif",
  "0=fi",
  "0=esac",
  "0=done",
  "0=end",
  ")",
  "0=;;",
  "0=;&",
  "0=fin",
  "0=fil",
  "0=fip",
  "0=fir",
  "0=fix",
  "0=endscript",
}
local SCRIPT_INDENT_KEYS_TO_REMOVE = {
  [":"] = true,
  ["0#"] = true,
}
local TREE_SITTER_FOLDEXPR = "v:lua.vim.treesitter.foldexpr()"
local SCRIPT_MATCH_WORDS = [[\<\%(firstaction\|lastaction\|postrotate\|preremove\|prerotate\)\>:\<endscript\>]]
local BLINK_ENTER_DESCRIPTION = "Insert a newline without accepting a completion"
local COMPLETION_ITEMS = {
  { word = "hourly", menu = "[frequency]", info = "Rotate after an hour has elapsed.", global = true, block = true },
  { word = "minutes", menu = "[frequency]", info = "Rotate after the specified positive number of minutes.", global = true, block = true },
  { word = "daily", menu = "[frequency]", info = "Rotate once per day.", global = true, block = true },
  { word = "weekly", menu = "[frequency]", info = "Rotate weekly, optionally on a selected weekday.", global = true, block = true },
  { word = "monthly", menu = "[frequency]", info = "Rotate monthly, optionally on a selected day of the month.", global = true, block = true },
  { word = "yearly", menu = "[frequency]", info = "Rotate when the calendar year changes.", global = true, block = true },
  { word = "size", menu = "[retention]", info = "Rotate when a log grows beyond the given size, independently of time.", global = true, block = true },
  { word = "minsize", menu = "[retention]", info = "Require both the configured time interval and minimum size.", global = true, block = true },
  { word = "maxsize", menu = "[retention]", info = "Rotate at this size even before a configured time interval elapses.", global = true, block = true },
  { word = "minage", menu = "[retention]", info = "Do not rotate logs younger than the given day count.", global = true, block = true },
  { word = "maxage", menu = "[retention]", info = "Remove rotated logs older than the given day count.", global = true, block = true },
  { word = "rotate", menu = "[retention]", info = "Keep this many rotations; -1 disables count-based removal.", global = true, block = true },
  { word = "start", menu = "[retention]", info = "Start numeric rotation suffixes at the given value.", global = true, block = true },
  { word = "compress", menu = "[compression]", info = "Compress rotated logs.", global = true, block = true },
  { word = "nocompress", menu = "[compression]", info = "Leave rotated logs uncompressed.", global = true, block = true },
  { word = "delaycompress", menu = "[compression]", info = "Delay compression until the following rotation.", global = true, block = true },
  { word = "nodelaycompress", menu = "[compression]", info = "Compress without the one-rotation delay.", global = true, block = true },
  { word = "compresscmd", menu = "[compression]", info = "Select the executable used to compress logs.", global = true, block = true },
  { word = "uncompresscmd", menu = "[compression]", info = "Select the executable used to uncompress logs.", global = true, block = true },
  { word = "compressext", menu = "[compression]", info = "Set the filename extension produced by compression.", global = true, block = true },
  { word = "compressoptions", menu = "[compression]", info = "Pass the remaining arguments to the compression command.", global = true, block = true },
  { word = "copy", menu = "[copy]", info = "Copy a log while leaving the original unchanged.", global = true, block = true },
  { word = "nocopy", menu = "[copy]", info = "Disable copy-without-changing-original behavior.", global = true, block = true },
  { word = "copytruncate", menu = "[copy]", info = "Copy then truncate the original log in place.", global = true, block = true },
  { word = "nocopytruncate", menu = "[copy]", info = "Disable copy-and-truncate behavior.", global = true, block = true },
  { word = "renamecopy", menu = "[copy]", info = "Rename temporarily and copy to the final rotated name.", global = true, block = true },
  { word = "norenamecopy", menu = "[copy]", info = "Disable temporary rename-and-copy behavior.", global = true, block = true },
  { word = "allowhardlink", menu = "[copy]", info = "Permit rotation of files with multiple hard links.", global = true, block = true },
  { word = "noallowhardlink", menu = "[copy]", info = "Refuse rotation of files with multiple hard links.", global = true, block = true },
  { word = "create", menu = "[files]", info = "Create a replacement log, optionally with mode, owner, and group.", global = true, block = true },
  { word = "nocreate", menu = "[files]", info = "Do not create a replacement log after rotation.", global = true, block = true },
  { word = "createolddir", menu = "[files]", info = "Create the old-log directory, optionally with mode and ownership.", global = true, block = true },
  { word = "nocreateolddir", menu = "[files]", info = "Do not create a missing old-log directory.", global = true, block = true },
  { word = "olddir", menu = "[files]", info = "Move rotated logs into the specified directory.", global = true, block = true },
  { word = "noolddir", menu = "[files]", info = "Keep rotated logs beside the original log.", global = true, block = true },
  { word = "su", menu = "[files]", info = "Perform rotation as the specified user and group.", global = true, block = true },
  { word = "dateext", menu = "[filenames]", info = "Use a date-derived suffix for rotated logs.", global = true, block = true },
  { word = "nodateext", menu = "[filenames]", info = "Use numeric rather than date-derived rotation suffixes.", global = true, block = true },
  { word = "dateformat", menu = "[filenames]", info = "Set the sortable suffix format used with date extensions.", global = true, block = true },
  { word = "dateyesterday", menu = "[filenames]", info = "Use yesterday's date in the date extension.", global = true, block = true },
  { word = "nodateyesterday", menu = "[filenames]", info = "Use the current date rather than yesterday's date.", global = true, block = true },
  { word = "datehourago", menu = "[filenames]", info = "Use the previous hour in the date extension.", global = true, block = true },
  { word = "nodatehourago", menu = "[filenames]", info = "Use the current hour rather than the previous hour.", global = true, block = true },
  { word = "extension", menu = "[filenames]", info = "Keep the selected original extension at the end of rotated names.", global = true, block = true },
  { word = "addextension", menu = "[filenames]", info = "Append the selected extension to rotated names.", global = true, block = true },
  { word = "missingok", menu = "[selection]", info = "Continue without an error when a log is missing.", global = true, block = true },
  { word = "nomissingok", menu = "[selection]", info = "Report an error when a configured log is missing.", global = true, block = true },
  { word = "ifempty", menu = "[selection]", info = "Allow empty logs to rotate.", global = true, block = true },
  { word = "notifempty", menu = "[selection]", info = "Skip rotation for empty logs.", global = true, block = true },
  { word = "ignoreduplicates", menu = "[selection]", info = "Ignore later matches of a log already configured for rotation.", global = true, block = true },
  { word = "mail", menu = "[mail]", info = "Mail a log that ages out to the specified address.", global = true, block = true },
  { word = "nomail", menu = "[mail]", info = "Disable mailing of expired logs.", global = true, block = true },
  { word = "mailfirst", menu = "[mail]", info = "Mail the newly rotated log rather than the expiring one.", global = true, block = true },
  { word = "maillast", menu = "[mail]", info = "Mail the rotated log that is about to expire.", global = true, block = true },
  { word = "shred", menu = "[removal]", info = "Securely overwrite logs before removing them.", global = true, block = true },
  { word = "noshred", menu = "[removal]", info = "Remove logs without secure overwriting.", global = true, block = true },
  { word = "shredcycles", menu = "[removal]", info = "Set how many overwrite passes secure removal performs.", global = true, block = true },
  { word = "firstaction", menu = "[scripts]", info = "Start a shell block run once before all matching logs rotate.", block = true },
  { word = "lastaction", menu = "[scripts]", info = "Start a shell block run once after all matching logs rotate.", block = true },
  { word = "prerotate", menu = "[scripts]", info = "Start a shell block run before a matching log rotates.", block = true },
  { word = "postrotate", menu = "[scripts]", info = "Start a shell block run after a matching log rotates.", block = true },
  { word = "preremove", menu = "[scripts]", info = "Start a shell block run before an old log is removed.", block = true },
  { word = "sharedscripts", menu = "[scripts]", info = "Run pre- and post-rotation scripts once for the whole path pattern.", global = true, block = true },
  { word = "nosharedscripts", menu = "[scripts]", info = "Run pre- and post-rotation scripts separately for each log.", global = true, block = true },
  { word = "endscript", menu = "[scripts]", info = "Terminate a logrotate shell script block.", script = true },
  { word = "include", menu = "[inclusion]", info = "Read a file or directory inline at this point.", global = true },
  { word = "tabooext", menu = "[inclusion]", info = "Replace or extend filename extensions ignored during directory includes.", global = true },
  { word = "taboopat", menu = "[inclusion]", info = "Replace or extend filename patterns ignored during directory includes.", global = true },
  { word = "errors", menu = "[compatibility]", info = "Recognized for compatibility but ignored; use normal diagnostics instead.", global = true, block = true },
}
local roots = {}
local associations = {}
local setup_complete = false
local blink_completion_registered = false
local parser_registration_complete = false
local PARSER_LANGUAGES = { "logrotate", "logrotate_state" }

local function repository_root()
  local source = assert(debug.getinfo(1, "S").source):sub(2)
  return vim.fs.dirname(vim.fs.dirname(vim.fs.dirname(vim.fs.normalize(source))))
end

local function define_parsers()
  local ok, parsers = pcall(require, "nvim-treesitter.parsers")
  if not ok then
    return false
  end

  local root = repository_root()
  parsers.logrotate = {
    install_info = {
      path = root,
      queries = "queries/logrotate",
    },
    requires = { "bash" },
  }
  parsers.logrotate_state = {
    install_info = {
      path = root,
      location = "src/state",
      queries = "queries/logrotate_state",
    },
  }
  return true
end

function M.register_parsers()
  if not parser_registration_complete then
    parser_registration_complete = true
    local group = vim.api.nvim_create_augroup("tree_sitter_logrotate_parsers", { clear = true })
    vim.api.nvim_create_autocmd("User", {
      group = group,
      pattern = "TSUpdate",
      callback = define_parsers,
    })
  end
  return define_parsers()
end

local function treesitter()
  local ok, module = pcall(require, "nvim-treesitter")
  if not ok then
    error("tree-sitter-logrotate requires nvim-treesitter on its current main branch")
  end
  return module
end

function M.install(options)
  options = options or {}
  M.register_parsers()
  return treesitter().install(PARSER_LANGUAGES, {
    force = options.force == true,
    max_jobs = options.max_jobs,
    summary = options.summary ~= false,
  })
end

function M.update(options)
  options = options or {}
  options.force = true
  return M.install(options)
end

function M.uninstall(options)
  options = options or {}
  return treesitter().uninstall(PARSER_LANGUAGES, {
    summary = options.summary ~= false,
  })
end

local function report_task(task, action)
  task:await(function(err, success)
    vim.schedule(function()
      if err ~= nil then
        vim.notify(err, vim.log.levels.ERROR, { title = "tree-sitter-logrotate" })
      elseif success then
        vim.notify(action .. " both logrotate parsers.", vim.log.levels.INFO, {
          title = "tree-sitter-logrotate",
        })
      else
        vim.notify(action .. " failed. Run :TSLog for details.", vim.log.levels.ERROR, {
          title = "tree-sitter-logrotate",
        })
      end
    end)
  end)
end

local function normalize_path(path)
  path = path:gsub("\\", "/")

  local prefix = ""
  if path:sub(1, 2) == "//" then
    prefix = "//"
    path = path:sub(3)
  elseif path:match("^%a:/") then
    prefix = path:sub(1, 3)
    path = path:sub(4)
  elseif path:sub(1, 1) == "/" then
    prefix = "/"
    path = path:sub(2)
  end

  local components = {}
  for component in path:gmatch("[^/]+") do
    if component == ".." and #components > 0 and components[#components] ~= ".." then
      table.remove(components)
    elseif component ~= "." and component ~= "" then
      table.insert(components, component)
    end
  end

  return prefix .. table.concat(components, "/")
end

local function basename(path)
  return normalize_path(path):match("([^/]+)$") or ""
end

function M.recognize_path(path)
  local normalized = normalize_path(path)
  local name = basename(normalized)

  if name == "logrotate.status" or normalized:match("/logrotate/status$") then
    return "logrotate_state"
  end

  if name == "logrotate.conf"
      or name:match("%.logrotate%.conf$")
      or name:match("%.logrotate$")
      or normalized:match("/logrotate%.d/[^/]+$") then
    return "logrotate"
  end

  return nil
end

local function skip_whitespace(line, index)
  while index <= #line and line:sub(index, index):match("%s") do
    index = index + 1
  end
  return index
end

local function parse_quoted_path(line, index)
  local quote = line:sub(index, index)
  local content_count = 0
  index = index + 1

  while index <= #line do
    local character = line:sub(index, index)
    if character == quote then
      if content_count == 0 then
        return nil
      end
      return index + 1
    end
    if character == "\\" then
      if index == #line then
        return nil
      end
      index = index + 2
    else
      index = index + 1
    end
    content_count = content_count + 1
  end

  return nil
end

local function parse_unquoted_path(line, index)
  if line:sub(index, index + 1) == "~/" then
    index = index + 2
  elseif line:sub(index, index) == "/" then
    index = index + 1
  else
    return nil
  end

  local content_count = 0
  while index <= #line do
    local character = line:sub(index, index)
    if character:match("%s") or character == "{" or character == "}" or character == "#" then
      break
    end
    if character == "\\" then
      if index == #line then
        return nil
      end
      index = index + 2
    else
      index = index + 1
    end
    content_count = content_count + 1
  end

  if content_count == 0 then
    return nil
  end
  return index
end

local function parse_path(line, index)
  local character = line:sub(index, index)
  if character == '"' or character == "'" then
    return parse_quoted_path(line, index)
  end
  return parse_unquoted_path(line, index)
end

local function is_configuration_first_line(line)
  local index = skip_whitespace(line, 1)
  index = parse_path(line, index)
  if index == nil then
    return false
  end

  while true do
    local before_whitespace = index
    index = skip_whitespace(line, index)
    if line:sub(index, index) == "{" then
      index = skip_whitespace(line, index + 1)
      if line:sub(index, index) == "#" then
        return true
      end
      return index > #line
    end
    if index == before_whitespace then
      return false
    end
    index = parse_path(line, index)
    if index == nil then
      return false
    end
  end
end

function M.recognize_first_line(line)
  if #line > MAXIMUM_FIRST_LINE_LENGTH then
    return nil
  end
  if line == "logrotate state -- version 1" or line == "logrotate state -- version 2" then
    return "logrotate_state"
  end
  if is_configuration_first_line(line) then
    return "logrotate"
  end
  return nil
end

local function buffer_first_line(buffer)
  return vim.api.nvim_buf_get_lines(buffer, 0, 1, false)[1] or ""
end

local function is_associated(path)
  local associated_roots = associations[normalize_path(path)]
  if associated_roots == nil then
    return false
  end
  for root in pairs(associated_roots) do
    if vim.api.nvim_buf_is_valid(root) and vim.api.nvim_buf_is_loaded(root) then
      return true
    end
  end
  return false
end

local function detect_path_or_association(path)
  return M.recognize_path(path) or (is_associated(path) and "logrotate" or nil)
end

local function detect_content(_, buffer)
  return M.recognize_first_line(buffer_first_line(buffer))
end

function M.detect_buffer(buffer)
  buffer = buffer == 0 and vim.api.nvim_get_current_buf() or buffer
  local path = vim.api.nvim_buf_get_name(buffer)
  local detected = path ~= "" and detect_path_or_association(path) or nil
  return detected or M.recognize_first_line(buffer_first_line(buffer))
end

function M.apply_filetype(buffer)
  buffer = buffer == 0 and vim.api.nvim_get_current_buf() or buffer
  local detected = M.detect_buffer(buffer)
  if detected ~= nil and vim.bo[buffer].filetype ~= detected then
    vim.bo[buffer].filetype = detected
  end
  return detected
end

local function remove_root(root)
  local targets = roots[root]
  if targets == nil then
    return
  end
  for target in pairs(targets) do
    local target_roots = associations[target]
    if target_roots ~= nil then
      target_roots[root] = nil
      if next(target_roots) == nil then
        associations[target] = nil
      end
    end
  end
  roots[root] = nil
end

local function add_association(root, target)
  target = normalize_path(target)
  roots[root] = roots[root] or {}
  roots[root][target] = true
  associations[target] = associations[target] or {}
  associations[target][root] = true
end

local function unquote_path(path)
  local first = path:sub(1, 1)
  if (first == '"' or first == "'") and path:sub(-1) == first then
    path = path:sub(2, -2)
  end
  if path:match("^%a:[/\\]") or path:sub(1, 2) == "\\\\" then
    return path:gsub("\\", "/")
  end
  return path:gsub("\\(.)", "%1")
end

local function resolve_include(root_path, include_path)
  if include_path:find("[*?[]") then
    return nil
  end

  include_path = unquote_path(include_path)
  if include_path:sub(1, 2) == "~/" then
    include_path = vim.env.HOME .. include_path:sub(2)
  elseif not include_path:match("^/") and not include_path:match("^%a:/") then
    include_path = vim.fs.dirname(root_path) .. "/" .. include_path
  end
  return normalize_path(include_path)
end

local function include_paths(buffer)
  local ok, parser = pcall(vim.treesitter.get_parser, buffer, "logrotate")
  if not ok or parser == nil then
    return {}
  end

  local trees = parser:parse()
  if trees == nil or trees[1] == nil then
    return {}
  end

  local paths = {}
  local function visit(node)
    if node:type() == "include_directive" then
      local path_nodes = node:field("path")
      if path_nodes[1] ~= nil then
        table.insert(paths, vim.treesitter.get_node_text(path_nodes[1], buffer))
      end
      return
    end
    for child in node:iter_children() do
      visit(child)
    end
  end
  visit(trees[1]:root())
  return paths
end

function M.refresh_root(buffer)
  remove_root(buffer)
  if not vim.api.nvim_buf_is_valid(buffer)
      or not vim.api.nvim_buf_is_loaded(buffer)
      or vim.bo[buffer].filetype ~= "logrotate" then
    return
  end

  local root_path = vim.api.nvim_buf_get_name(buffer)
  if root_path == "" then
    return
  end

  roots[buffer] = {}
  for _, include_path in ipairs(include_paths(buffer)) do
    local target = resolve_include(root_path, include_path)
    local stat = target ~= nil and vim.uv.fs_stat(target) or nil
    if stat ~= nil and stat.type == "file" then
      add_association(buffer, target)
    elseif stat ~= nil and stat.type == "directory" then
      for name, type in vim.fs.dir(target) do
        if type == "file" then
          add_association(buffer, target .. "/" .. name)
        elseif type == "link" then
          local linked = target .. "/" .. name
          local linked_stat = vim.uv.fs_stat(linked)
          if linked_stat ~= nil and linked_stat.type == "file" then
            add_association(buffer, linked)
          end
        end
      end
    end
  end
end

local function start_tree_sitter(buffer, language)
  pcall(vim.treesitter.language.add, language)
  pcall(vim.treesitter.start, buffer, language)
end

local function configuration_root(buffer)
  local ok, parser = pcall(vim.treesitter.get_parser, buffer, "logrotate")
  if not ok or parser == nil then
    return nil
  end
  local trees = parser:parse()
  if trees == nil or trees[1] == nil then
    return nil
  end
  return trees[1]:root()
end

local function node_contains_row(node, row)
  local start_row = node:start()
  local end_row = select(1, node:end_())
  return start_row <= row and row <= end_row
end

local function tree_completion_scope(buffer, row, root)
  if root == nil then
    return nil
  end

  local scope
  local function visit(node)
    if not node_contains_row(node, row) then
      return false
    end

    local node_type = node:type()
    if node_type == "script_block" or node_type == "unterminated_script_block" then
      local directive = node:field("directive")[1]
      local terminator = node:field("terminator")[1]
      if directive ~= nil then
        local directive_row = directive:start()
        local end_row = terminator ~= nil and terminator:start() or select(1, node:end_())
        if directive_row < row and (terminator == nil and row <= end_row or row < end_row) then
          scope = "script"
          return true
        end
      end
    elseif node_type == "rotation_block" then
      local start_row = node:start()
      local closing_row
      for child in node:iter_children() do
        if child:type() == "}" then
          closing_row = child:start()
          break
        end
      end
      if start_row < row and (closing_row == nil or row < closing_row) then
        scope = "block"
      end
    end

    for child in node:iter_children() do
      if visit(child) then
        return true
      end
    end
    return false
  end
  visit(root)
  return scope
end

local function lexical_completion_scope(buffer, row)
  local scope = "global"
  local lines = vim.api.nvim_buf_get_lines(buffer, 0, row, false)
  for _, line in ipairs(lines) do
    local text = vim.trim(line)
    if scope == "script" then
      if text == "endscript" then
        scope = "block"
      end
    elseif SCRIPT_DIRECTIVES[text] then
      scope = "script"
    elseif text:match("^}") then
      scope = "global"
    elseif text:match("{%s*(#.*)?$") then
      scope = "block"
    end
  end
  return scope
end

local function completion_scope(buffer, row)
  local scope = tree_completion_scope(buffer, row, configuration_root(buffer))
  return scope or lexical_completion_scope(buffer, row)
end

local function completion_start()
  local column = vim.fn.col(".") - 1
  local line = vim.api.nvim_get_current_line():sub(1, column)
  local indentation, word = line:match("^(%s*)([A-Za-z][A-Za-z0-9_-]*)$")
  if indentation ~= nil and word ~= nil then
    return #indentation
  end
  if line:match("^%s*$") then
    return #line
  end
  return -3
end

function M.complete(find_start, base)
  if vim.bo.filetype ~= "logrotate" then
    return find_start == 1 and -3 or {}
  end
  if find_start == 1 then
    return completion_start()
  end

  local buffer = vim.api.nvim_get_current_buf()
  local row = vim.api.nvim_win_get_cursor(0)[1] - 1
  local scope = completion_scope(buffer, row)
  local prefix = base:lower()
  local items = {}
  for _, item in ipairs(COMPLETION_ITEMS) do
    if item[scope] and item.word:sub(1, #prefix):lower() == prefix then
      table.insert(items, {
        word = item.word,
        abbr = item.word,
        menu = item.menu,
        info = item.info,
        icase = 1,
        dup = 0,
      })
    end
  end
  table.sort(items, function(left, right)
    return left.word < right.word
  end)
  return items
end

local function script_directive_indent(buffer, target_row, root)
  local previous_line = vim.fn.prevnonblank(target_row + 1)
  local previous_is_directive = false
  if previous_line > 0 then
    local text = vim.api.nvim_buf_get_lines(buffer, previous_line - 1, previous_line, false)[1] or ""
    previous_is_directive = SCRIPT_DIRECTIVES[vim.trim(text)] == true
  end

  if root == nil then
    if previous_is_directive then
      local opener_indent = vim.fn.indent(previous_line)
      local step = opener_indent > 0 and opener_indent or vim.fn.shiftwidth()
      return opener_indent + step, false
    end
    return nil
  end
  local opener
  local exact = false
  local function visit(node)
    local node_type = node:type()
    if node_type == "script_block" or node_type == "unterminated_script_block" then
      local directive = node:field("directive")[1]
      local terminator = node:field("terminator")[1]
      if directive ~= nil then
        local directive_row = directive:start()
        local end_row = terminator ~= nil and terminator:start() or select(1, node:end_())
        if terminator ~= nil and end_row == target_row then
          opener = directive
          exact = true
          return true
        elseif directive_row < target_row and target_row < end_row then
          opener = directive
          return true
        end
      end
    end
    for child in node:iter_children() do
      if visit(child) then
        return true
      end
    end
    return false
  end
  visit(root)

  if opener == nil then
    if previous_is_directive then
      local opener_indent = vim.fn.indent(previous_line)
      local step = opener_indent > 0 and opener_indent or vim.fn.shiftwidth()
      return opener_indent + step, false
    end
    return nil
  end
  local opener_row = opener:start()
  local opener_indent = vim.fn.indent(opener_row + 1)
  if exact then
    return opener_indent, true
  end

  local rotation_indent = 0
  local ancestor = opener:parent()
  while ancestor ~= nil do
    if ancestor:type() == "rotation_block" then
      local rotation_row = ancestor:start()
      rotation_indent = vim.fn.indent(rotation_row + 1)
      break
    end
    ancestor = ancestor:parent()
  end
  local step = opener_indent - rotation_indent
  if step <= 0 then
    step = vim.fn.shiftwidth()
  end
  return opener_indent + step, false
end

local function bash_case_item_indent(buffer, target_row)
  local target = vim.trim(vim.api.nvim_buf_get_lines(buffer, target_row, target_row + 1, false)[1] or "")
  if target == "esac" or target:match("%)$") then
    return nil
  end

  local previous_line = vim.fn.prevnonblank(target_row + 1)
  if previous_line == 0 then
    return nil
  end
  local previous = vim.api.nvim_buf_get_lines(buffer, previous_line - 1, previous_line, false)[1] or ""
  local previous_text = vim.trim(previous)
  if previous_text == ";;" or previous_text == ";&" or previous_text == ";;&" then
    return nil
  end
  if previous_text:match("^case%s+.+%s+in$") then
    return nil
  end

  local ok, parser = pcall(vim.treesitter.get_parser, buffer, "logrotate")
  local bash = ok and parser ~= nil and parser:children().bash or nil
  if bash == nil then
    return nil
  end

  local row = previous_line - 1
  local content_end = (previous:find("%s*$") or (#previous + 1)) - 1
  if content_end == 0 then
    return nil
  end
  for _, tree in ipairs(bash:parse()) do
    local root = tree:root()
    local node = root:descendant_for_range(row, content_end - 1, row, content_end)
    while node ~= nil do
      if node:type() == "case_item" then
        local parent = node:parent()
        if parent == nil or parent:type() ~= "case_statement" or parent:start() ~= node:start() then
          return vim.fn.indent(node:start() + 1) + vim.fn.shiftwidth()
        end
        return nil
      end
      node = node:parent()
    end
  end
  return nil
end

local function indent_after_script_terminator(buffer, target_row, root)
  if root == nil then
    return nil
  end
  local target = vim.api.nvim_buf_get_lines(buffer, target_row, target_row + 1, false)[1] or ""
  if not target:match("^%s*$") then
    return nil
  end
  local previous_line = vim.fn.prevnonblank(target_row + 1)
  if previous_line == 0 then
    return nil
  end
  local previous = vim.api.nvim_buf_get_lines(buffer, previous_line - 1, previous_line, false)[1] or ""
  if vim.trim(previous) ~= "endscript" then
    return nil
  end

  local content_end = (previous:find("%s*$") or (#previous + 1)) - 1
  local node = root:descendant_for_range(previous_line - 1, content_end - 1, previous_line - 1, content_end)
  while node ~= nil do
    if node:type() == "script_block" then
      local directive = node:field("directive")[1]
      return directive ~= nil and vim.fn.indent(directive:start() + 1) or nil
    end
    node = node:parent()
  end
  return nil
end

local function rotation_body_indent(buffer, target_row, root)
  if root == nil then
    return nil
  end

  local computed
  local exact = false
  local function visit(node)
    if node:type() == "rotation_block" then
      local start_row = node:start()
      local end_row = select(1, node:end_())
      if start_row < target_row and target_row <= end_row then
        local closing_row
        for child in node:iter_children() do
          if child:type() == "}" then
            closing_row = child:start()
            break
          end
        end

        local base = vim.fn.indent(start_row + 1)
        if closing_row == target_row then
          computed = base
          exact = true
          return true
        end
        if closing_row == nil or target_row < closing_row then
          local step = vim.fn.shiftwidth()
          for _, body in ipairs(node:field("body")) do
            local body_row = body:start()
            if body_row ~= target_row then
              local candidate = vim.fn.indent(body_row + 1) - base
              if candidate > 0 and (step <= 0 or candidate < step) then
                step = candidate
              elseif candidate > step and step == vim.fn.shiftwidth() then
                step = candidate
              end
            end
          end
          if step <= 0 then
            step = vim.fn.shiftwidth()
          end
          computed = base + step
          return true
        end
      end
    end
    for child in node:iter_children() do
      if visit(child) then
        return true
      end
    end
    return false
  end
  visit(root)
  return computed, exact
end

function M.indentexpr()
  local ok, tree_sitter = pcall(require, "nvim-treesitter")
  if not ok or type(tree_sitter.indentexpr) ~= "function" then
    return -1
  end

  local fallback = tree_sitter.indentexpr()
  local buffer = vim.api.nvim_get_current_buf()
  local target_row = vim.v.lnum - 1
  local root = configuration_root(buffer)
  local script_indent, script_exact = script_directive_indent(buffer, target_row, root)
  local case_item_indent = bash_case_item_indent(buffer, target_row)
  local after_terminator_indent = indent_after_script_terminator(buffer, target_row, root)
  local rotation_indent, rotation_exact = rotation_body_indent(buffer, target_row, root)
  if script_exact then
    return script_indent
  end
  if rotation_exact then
    return rotation_indent
  end
  return math.max(
    fallback,
    script_indent or -1,
    case_item_indent or -1,
    after_terminator_indent or -1,
    rotation_indent or -1
  )
end

local function enable_tree_sitter_indentation(buffer)
  local ok, tree_sitter = pcall(require, "nvim-treesitter")
  if ok and type(tree_sitter.indentexpr) == "function" then
    vim.bo[buffer].indentexpr = "v:lua.require'tree-sitter-logrotate'.indentexpr()"
    local indentkeys = vim.split(vim.bo[buffer].indentkeys, ",", { plain = true })
    for index = #indentkeys, 1, -1 do
      if SCRIPT_INDENT_KEYS_TO_REMOVE[indentkeys[index]] then
        table.remove(indentkeys, index)
      end
    end
    for _, key in ipairs(SCRIPT_INDENT_KEYS) do
      if not vim.list_contains(indentkeys, key) then
        table.insert(indentkeys, key)
      end
    end
    vim.bo[buffer].indentkeys = table.concat(indentkeys, ",")
    vim.bo[buffer].smartindent = false
  end
end

local function restore_tree_sitter_indentation(buffer)
  vim.schedule(function()
    if vim.api.nvim_buf_is_valid(buffer) and vim.bo[buffer].filetype == "logrotate" then
      enable_tree_sitter_indentation(buffer)
    end
  end)
end

local function append_undo_ftplugin(buffer, command)
  local undo = vim.b[buffer].undo_ftplugin
  if undo == nil or undo == "" then
    vim.b[buffer].undo_ftplugin = command
  else
    vim.b[buffer].undo_ftplugin = undo .. " | " .. command
  end
end

local function configure_logrotate_buffer(buffer)
  vim.bo[buffer].comments = ":#"
  vim.bo[buffer].commentstring = "# %s"
  vim.bo[buffer].omnifunc = "v:lua.require'tree-sitter-logrotate'.complete"
  vim.b[buffer].match_ignorecase = 0
  vim.b[buffer].match_words = SCRIPT_MATCH_WORDS
  append_undo_ftplugin(
    buffer,
    "setlocal comments< commentstring< omnifunc< indentexpr< indentkeys< smartindent<"
      .. " | unlet! b:match_ignorecase b:match_words"
  )
end

local function enable_tree_sitter_folding(buffer)
  for _, window in ipairs(vim.fn.win_findbuf(buffer)) do
    if vim.api.nvim_win_is_valid(window)
        and vim.wo[window].foldmethod == "indent"
        and (vim.wo[window].foldexpr == "0" or vim.wo[window].foldexpr == "") then
      vim.wo[window].foldmethod = "expr"
      vim.wo[window].foldexpr = TREE_SITTER_FOLDEXPR
    end
  end
end

local function enable_blink_completion(buffer)
  if not vim.api.nvim_buf_is_valid(buffer) or vim.bo[buffer].filetype ~= "logrotate" then
    return
  end
  local ok, blink = pcall(require, "blink.cmp")
  if ok and type(blink.add_filetype_source) == "function" then
    if not blink_completion_registered then
      blink.add_filetype_source("logrotate", "omni")
      blink_completion_registered = true
    end
    local mapping = vim.api.nvim_buf_call(buffer, function()
      return vim.fn.maparg("<CR>", "i", false, true)
    end)
    local blink_mapping = type(mapping.desc) == "string" and vim.startswith(mapping.desc, "blink.cmp:")
    if mapping.desc ~= BLINK_ENTER_DESCRIPTION and (mapping.buffer ~= 1 or blink_mapping) then
      local enter = vim.api.nvim_replace_termcodes("<CR>", true, false, true)
      vim.keymap.set("i", "<CR>", function()
        if type(blink.is_visible) == "function"
            and type(blink.cancel) == "function"
            and blink.is_visible() then
          blink.cancel({
            callback = function()
              vim.api.nvim_feedkeys(enter, "n", false)
            end,
          })
          return ""
        end
        return enter
      end, {
        buffer = buffer,
        desc = BLINK_ENTER_DESCRIPTION,
        expr = true,
        replace_keycodes = false,
      })
      if not vim.b[buffer].tree_sitter_logrotate_enter_map then
        vim.b[buffer].tree_sitter_logrotate_enter_map = true
        append_undo_ftplugin(
          buffer,
          "silent! iunmap <buffer> <CR> | unlet! b:tree_sitter_logrotate_enter_map"
        )
      end
    end
  end
end

function M.setup()
  if setup_complete then
    return
  end
  setup_complete = true
  M.register_parsers()

  local group = vim.api.nvim_create_augroup("tree_sitter_logrotate", { clear = true })
  vim.api.nvim_create_user_command("LogrotateInstall", function(command)
    report_task(M.install({ force = command.bang }), "Installed")
  end, {
    bang = true,
    desc = "Install the logrotate configuration and state parsers",
  })
  vim.api.nvim_create_user_command("LogrotateUpdate", function()
    report_task(M.update(), "Updated")
  end, {
    desc = "Rebuild the logrotate configuration and state parsers",
  })
  vim.api.nvim_create_user_command("LogrotateUninstall", function()
    report_task(M.uninstall(), "Uninstalled")
  end, {
    desc = "Uninstall the logrotate configuration and state parsers",
  })
  vim.filetype.add({
    extension = {
      logrotate = "logrotate",
    },
    filename = {
      ["logrotate.conf"] = "logrotate",
      ["logrotate.status"] = "logrotate_state",
    },
    pattern = {
      [".*%.logrotate%.conf"] = "logrotate",
      [".*/logrotate%.d/[^/]+"] = "logrotate",
      [".*/logrotate/status"] = "logrotate_state",
      [".*[^/]"] = {
        function(path)
          return is_associated(path) and "logrotate" or nil
        end,
        { priority = 1000 },
      },
      [".*."] = {
        detect_content,
        { priority = -math.huge },
      },
    },
  })

  vim.api.nvim_create_autocmd({ "BufReadPost", "BufNewFile" }, {
    group = group,
    callback = function(event)
      M.apply_filetype(event.buf)
    end,
  })
  vim.api.nvim_create_autocmd("FileType", {
    group = group,
    pattern = { "logrotate", "logrotate_state" },
    callback = function(event)
      start_tree_sitter(event.buf, vim.bo[event.buf].filetype)
      if vim.bo[event.buf].filetype == "logrotate" then
        configure_logrotate_buffer(event.buf)
        enable_tree_sitter_indentation(event.buf)
        restore_tree_sitter_indentation(event.buf)
        enable_tree_sitter_folding(event.buf)
        local buffer = event.buf
        vim.schedule(function()
          enable_blink_completion(buffer)
        end)
        M.refresh_root(event.buf)
      end
    end,
  })
  vim.api.nvim_create_autocmd("BufWinEnter", {
    group = group,
    callback = function(event)
      if vim.bo[event.buf].filetype == "logrotate" then
        enable_tree_sitter_folding(event.buf)
      end
    end,
  })
  vim.api.nvim_create_autocmd("InsertEnter", {
    group = group,
    callback = function(event)
      if vim.bo[event.buf].filetype == "logrotate" then
        local buffer = event.buf
        vim.schedule(function()
          enable_blink_completion(buffer)
        end)
      end
    end,
  })
  vim.api.nvim_create_autocmd({ "TextChanged", "TextChangedI", "BufWritePost" }, {
    group = group,
    callback = function(event)
      if vim.bo[event.buf].filetype == "logrotate" then
        M.refresh_root(event.buf)
      end
    end,
  })
  vim.api.nvim_create_autocmd({ "BufDelete", "BufWipeout" }, {
    group = group,
    callback = function(event)
      remove_root(event.buf)
    end,
  })
end

M._normalize_path = normalize_path
M._resolve_include = resolve_include
M._remove_root = remove_root
M._repository_root = repository_root

return M
