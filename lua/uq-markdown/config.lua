local M = {}

M.defaults = {
  -- Browser binary used to open the preview window. If nil, the first of
  -- `browser_candidates` found on PATH is used.
  browser = nil,
  browser_candidates = { 'chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome', 'brave' },
  -- Extra args appended to the browser invocation.
  browser_args = {},
  -- WM class / app-id for the preview window (lets your WM place it "on the side").
  app_class = 'uq-markdown',
  -- Isolated profile dir so the preview window is clean (no tabs/history/extensions).
  user_data_dir = vim.fn.stdpath('cache') .. '/uq-markdown-profile',
  -- 'auto' follows &background; or force 'light' / 'dark'.
  theme = 'auto',
  -- node binary.
  node = 'node',
  -- Filetypes considered "markdown" for buffer-following behaviour.
  filetypes = { 'markdown', 'markdown.mdx', 'md' },
  -- Update debounce (ms) while typing.
  debounce = 100,
}

M.options = vim.deepcopy(M.defaults)

function M.setup(opts)
  M.options = vim.tbl_deep_extend('force', vim.deepcopy(M.defaults), opts or {})
  return M.options
end

return M
