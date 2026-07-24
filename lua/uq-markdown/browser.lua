-- Launches the preview window as a clean Chromium "app" window and tracks it so
-- it can be closed together with the preview.

local M = {}

M.job = nil

local function resolve_browser(opts)
  if opts.browser and vim.fn.executable(opts.browser) == 1 then
    return opts.browser
  end
  for _, cand in ipairs(opts.browser_candidates) do
    if vim.fn.executable(cand) == 1 then
      return cand
    end
  end
  return nil
end

--- @param opts table config.options
--- @param port integer
--- @return boolean ok
function M.open(opts, port)
  if M.job then return true end

  local bin = resolve_browser(opts)
  if not bin then
    vim.notify(
      '[uq-markdown] no Chromium-based browser found (tried: '
        .. table.concat(opts.browser_candidates, ', ')
        .. ')',
      vim.log.levels.ERROR
    )
    return false
  end

  local url = ('http://127.0.0.1:%d/'):format(port)
  local cmd = {
    bin,
    '--app=' .. url,
    '--class=' .. opts.app_class,
    '--user-data-dir=' .. opts.user_data_dir,
    '--no-first-run',
    '--no-default-browser-check',
  }
  vim.list_extend(cmd, opts.browser_args or {})

  M.job = vim.fn.jobstart(cmd, {
    detach = false,
    on_exit = function()
      M.job = nil
    end,
  })

  if M.job <= 0 then
    vim.notify('[uq-markdown] failed to launch browser: ' .. bin, vim.log.levels.ERROR)
    M.job = nil
    return false
  end
  return true
end

function M.is_open()
  return M.job ~= nil
end

function M.close()
  if not M.job then return end
  pcall(vim.fn.jobstop, M.job)
  M.job = nil
end

return M
