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
}

local function opts()
  return config.options
end

local function resolve_theme()
  local t = opts().theme
  if t == 'light' or t == 'dark' then return t end
  return vim.o.background == 'dark' and 'dark' or 'light'
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
  local line = vim.api.nvim_win_get_cursor(0)[1]
  server.send({ type = 'cursor', line = line })
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
        send_cursor()
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
    if not browser.open(opts(), port) then
      M.close()
      return
    end
    if is_markdown(start_buf) then
      switch_to(start_buf)
    end
  end, on_browser_message)
end

function M.close()
  if not state.active then return end
  state.active = false
  if state.timer then
    state.timer:stop()
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

function M.setup(user_opts)
  -- Commands are registered in plugin/uq-markdown.lua so they exist without
  -- calling setup(); setup() only applies configuration.
  config.setup(user_opts)
end

return M
