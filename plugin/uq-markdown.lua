-- Registered at startup so the commands exist without requiring setup().
if vim.g.loaded_uq_markdown then
  return
end
vim.g.loaded_uq_markdown = true

local function cmd(name, fn, desc)
  vim.api.nvim_create_user_command(name, function()
    require('uq-markdown')[fn]()
  end, { desc = desc })
end

cmd('MdPreview', 'open', 'Open uq-markdown preview')
cmd('MdPreviewStop', 'close', 'Stop uq-markdown preview')
cmd('MdPreviewToggle', 'toggle', 'Toggle uq-markdown preview')
cmd('MdPreviewConfig', 'show_config', 'Show uq-markdown config (debug)')
