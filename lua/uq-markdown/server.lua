-- Owns the Node sidecar process: start/stop, send JSON messages on its stdin,
-- and parse its stdout (the `ready` handshake plus any reverse-sync messages).

local M = {}

-- Plugin root, derived from this file's location (…/lua/uq-markdown/server.lua).
local function plugin_root()
  local src = debug.getinfo(1, 'S').source:sub(2)
  return vim.fn.fnamemodify(src, ':h:h:h')
end

M.job = nil
M.port = nil

local stdout_buf = ''

--- @param opts table config.options
--- @param on_ready fun(port:integer)
--- @param on_message fun(msg:table)  -- reverse messages from the browser
function M.start(opts, on_ready, on_message)
  if M.job then
    if M.port then on_ready(M.port) end
    return
  end

  local server_js = plugin_root() .. '/build/server.js'
  if vim.fn.filereadable(server_js) == 0 then
    vim.notify(
      '[uq-markdown] build/server.js not found — run `npm install && npm run build` in ' .. plugin_root(),
      vim.log.levels.ERROR
    )
    return
  end

  stdout_buf = ''
  M.job = vim.fn.jobstart({ opts.node, server_js }, {
    on_stdout = function(_, data)
      if not data then return end
      stdout_buf = stdout_buf .. table.concat(data, '\n')
      while true do
        local nl = stdout_buf:find('\n')
        if not nl then break end
        local line = stdout_buf:sub(1, nl - 1)
        stdout_buf = stdout_buf:sub(nl + 1)
        if line ~= '' then
          local ok, msg = pcall(vim.json.decode, line)
          if ok and type(msg) == 'table' then
            if msg.type == 'ready' then
              M.port = msg.port
              on_ready(msg.port)
            elseif on_message then
              on_message(msg)
            end
          end
        end
      end
    end,
    on_stderr = function(_, data)
      if data and #table.concat(data) > 0 then
        vim.schedule(function()
          vim.notify('[uq-markdown] sidecar: ' .. table.concat(data, '\n'), vim.log.levels.DEBUG)
        end)
      end
    end,
    on_exit = function()
      M.job = nil
      M.port = nil
    end,
  })

  if M.job <= 0 then
    vim.notify('[uq-markdown] failed to start node sidecar', vim.log.levels.ERROR)
    M.job = nil
  end
end

--- Send a JSON message to the sidecar over its stdin.
function M.send(msg)
  if not M.job then return end
  vim.fn.chansend(M.job, vim.json.encode(msg) .. '\n')
end

function M.is_running()
  return M.job ~= nil
end

function M.stop()
  if not M.job then return end
  M.send({ type = 'close' })
  local job = M.job
  -- Give the sidecar a moment to exit cleanly, then hard-stop.
  vim.defer_fn(function()
    pcall(vim.fn.jobstop, job)
  end, 200)
  M.job = nil
  M.port = nil
end

return M
