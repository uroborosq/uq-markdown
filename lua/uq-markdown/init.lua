-- uq-markdown: live Markdown preview in a Chromium app-window with the latest
-- mermaid + ELK. The preview window is decoupled from any single buffer: it
-- follows whichever markdown buffer is active, and stays open when you move to
-- a non-markdown buffer (peek.nvim-style).

local config = require('uq-markdown.config')
local server = require('uq-markdown.server')
local browser = require('uq-markdown.browser')

local M = {}

local state = {
  active = false, -- preview session running
  current_buf = nil, -- markdown buffer currently mirrored in the preview
  augroup = nil,
  timer = nil, -- debounce timer
  cursor_timer = nil, -- trailing-send timer for cursor throttle
  cursor_last = 0, -- vim.uv.now() of the last cursor send
}

-- Cap how often a cursor position is pushed. Fast typing fires CursorMovedI on
-- every keystroke; without this the socket gets flooded with redundant sends.
local CURSOR_INTERVAL = 60

local function opts()
  return config.options
end

local function resolve_theme()
  local t = opts().theme
  if t == 'light' or t == 'dark' then return t end
  return vim.o.background == 'dark' and 'dark' or 'light'
end

-- Read+parse the mermaid config file, caching by (path, mtime) so we re-read it
-- when it changes on disk without paying the cost on every keystroke.
local mermaid_cache = { path = nil, mtime = nil, value = nil }
local mermaid_warned = nil -- last path we already warned about, to avoid spam
local function mermaid_warn(path, msg)
  if mermaid_warned ~= path then
    mermaid_warned = path
    vim.notify('[uq-markdown] ' .. msg, vim.log.levels.WARN)
  end
end
local function mermaid_config()
  local path = opts().mermaid_config
  if not path or path == '' then return nil end
  path = vim.fn.expand(path)
  local stat = vim.uv.fs_stat(path)
  if not stat then
    mermaid_warn(path, 'mermaid_config not found: ' .. path)
    return nil
  end
  local mtime = stat.mtime.sec
  if mermaid_cache.path == path and mermaid_cache.mtime == mtime then
    return mermaid_cache.value
  end
  local ok, data = pcall(function()
    return vim.json.decode(table.concat(vim.fn.readfile(path), '\n'))
  end)
  if not ok or type(data) ~= 'table' then
    mermaid_warn(path, 'failed to parse mermaid_config: ' .. path)
    data = nil
  else
    mermaid_warned = nil -- reset so a later breakage warns again
  end
  mermaid_cache = { path = path, mtime = mtime, value = data }
  return data
end

local function is_markdown(buf)
  local ft = vim.bo[buf].filetype
  for _, want in ipairs(opts().filetypes) do
    if ft == want then return true end
  end
  return false
end

local function send_update(buf)
  if not (state.active and buf and vim.api.nvim_buf_is_valid(buf)) then return end
  local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
  local path = vim.api.nvim_buf_get_name(buf)
  local dir = path ~= '' and vim.fn.fnamemodify(path, ':h') or vim.fn.getcwd()
  server.send({
    type = 'update',
    path = path,
    dir = dir,
    content = table.concat(lines, '\n'),
    theme = resolve_theme(),
    mermaid_config = mermaid_config(),
  })
end

local function debounced_update(buf)
  if not state.timer then state.timer = vim.uv.new_timer() end
  state.timer:stop()
  state.timer:start(
    opts().debounce,
    0,
    vim.schedule_wrap(function()
      send_update(buf)
    end)
  )
end

local function send_cursor()
  if not state.active then return end
  state.cursor_last = vim.uv.now()
  local line = vim.api.nvim_win_get_cursor(0)[1]
  server.send({ type = 'cursor', line = line })
end

-- Throttle cursor sends: emit immediately when the interval has elapsed,
-- otherwise schedule a single trailing send so the final position still lands.
local function send_cursor_throttled()
  if not state.active then return end
  if not state.cursor_timer then state.cursor_timer = vim.uv.new_timer() end
  local since = vim.uv.now() - state.cursor_last
  if since >= CURSOR_INTERVAL then
    state.cursor_timer:stop()
    send_cursor()
  else
    state.cursor_timer:stop()
    state.cursor_timer:start(CURSOR_INTERVAL - since, 0, vim.schedule_wrap(send_cursor))
  end
end

-- Switch the preview to a markdown buffer (called when one becomes active).
local function switch_to(buf)
  state.current_buf = buf
  send_update(buf)
  send_cursor()
end

-- Reverse sync: browser asked to move the cursor to a source line.
local function on_browser_message(msg)
  if msg.type ~= 'sync-cursor' or not state.current_buf then return end
  vim.schedule(function()
    for _, win in ipairs(vim.api.nvim_list_wins()) do
      if vim.api.nvim_win_get_buf(win) == state.current_buf then
        local lc = vim.api.nvim_buf_line_count(state.current_buf)
        vim.api.nvim_win_set_cursor(win, { math.min(msg.line, lc), 0 })
        break
      end
    end
  end)
end

local function setup_autocmds()
  state.augroup = vim.api.nvim_create_augroup('uq_markdown', { clear = true })
  local grp = state.augroup

  -- Follow the active markdown buffer; keep the window on non-markdown buffers.
  vim.api.nvim_create_autocmd({ 'BufEnter', 'BufWinEnter' }, {
    group = grp,
    callback = function(ev)
      if state.active and is_markdown(ev.buf) and ev.buf ~= state.current_buf then
        switch_to(ev.buf)
      end
    end,
  })

  vim.api.nvim_create_autocmd({ 'TextChanged', 'TextChangedI', 'InsertLeave' }, {
    group = grp,
    callback = function(ev)
      if state.active and is_markdown(ev.buf) then
        state.current_buf = ev.buf
        debounced_update(ev.buf)
      end
    end,
  })

  vim.api.nvim_create_autocmd({ 'CursorMoved', 'CursorMovedI' }, {
    group = grp,
    callback = function(ev)
      if state.active and is_markdown(ev.buf) then
        send_cursor_throttled()
      end
    end,
  })

  vim.api.nvim_create_autocmd('OptionSet', {
    group = grp,
    pattern = 'background',
    callback = function()
      if state.active then
        server.send({ type = 'theme', theme = resolve_theme() })
      end
    end,
  })
end

function M.open()
  if state.active then
    -- Already running: just make sure a browser window exists and refresh.
    if server.port then browser.open(opts(), server.port) end
    if is_markdown(vim.api.nvim_get_current_buf()) then
      switch_to(vim.api.nvim_get_current_buf())
    end
    return
  end

  state.active = true
  setup_autocmds()

  local start_buf = vim.api.nvim_get_current_buf()

  server.start(opts(), function(port)
    -- on_ready (already on the main loop via jobstart callback)
    -- Push the first update (with the resolved theme) before opening the
    -- browser, so the server can bake the theme into index.html on first load
    -- and avoid a white-background flash before the WebSocket connects.
    if is_markdown(start_buf) then
      switch_to(start_buf)
    end
    if not browser.open(opts(), port) then
      M.close()
      return
    end
  end, on_browser_message)
end

function M.close()
  if not state.active then return end
  state.active = false
  if state.timer then
    state.timer:stop()
  end
  if state.cursor_timer then
    state.cursor_timer:stop()
  end
  if state.augroup then
    pcall(vim.api.nvim_del_augroup_by_id, state.augroup)
    state.augroup = nil
  end
  browser.close()
  server.stop()
  state.current_buf = nil
end

function M.toggle()
  if state.active then
    M.close()
  else
    M.open()
  end
end

function M.is_active()
  return state.active
end

-- Print the current configuration (and resolved mermaid config) for debugging.
function M.show_config()
  local info = {
    options = opts(),
    resolved_theme = resolve_theme(),
    mermaid_config = mermaid_config(),
    active = state.active,
  }
  vim.notify(vim.inspect(info), vim.log.levels.INFO, { title = 'uq-markdown' })
end

function M.setup(user_opts)
  -- Commands are registered in plugin/uq-markdown.lua so they exist without
  -- calling setup(); setup() only applies configuration.
  config.setup(user_opts)
end

return M
