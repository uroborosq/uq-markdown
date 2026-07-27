# uq-markdown

Live Markdown preview for Neovim in a clean Chromium **app-window** on the side,
with images and — the whole point — **mermaid diagrams rendered by the latest
mermaid + the ELK layout engine**.

Unlike existing preview plugins, the mermaid bundle is built here from npm, so
you get `mermaid@latest` and `@mermaid-js/layout-elk` under your control, with
ELK as the default layout for every diagram.

## How it works

```
Neovim (Lua) ──stdin(JSON)──▶ Node sidecar ──HTTP/WS──▶ Chromium --app window
                                (build/server.js)         (public/app.js:
                                                            markdown-it +
                                                            mermaid + ELK)
```

- Neovim streams the active buffer to a small Node sidecar over the job's stdin.
- The sidecar serves the preview page and pushes updates to the browser via WebSocket.
- The page renders markdown with `markdown-it`, highlights code fences with
  `highlight.js` (GitHub light/dark theme, follows your `&background`), and renders
  every ` ```mermaid ` block with mermaid + ELK. Large diagrams support
  **Ctrl/Alt + wheel** to zoom and **drag** to pan (double-click to reset).
- The preview window takes **vim-style keys**: `h`/`j`/`k`/`l` scroll, `<C-d>`/`<C-u>`
  jump half a screen. `h`/`l` pan the wide table or code block under the mouse pointer
  when there is one, otherwise the page.
- The preview **follows the active markdown buffer** and stays open when you switch
  to non-markdown buffers (peek.nvim-style).

## Requirements

- Neovim ≥ 0.10 (uses `vim.uv`, `vim.json`).
- `node` on `PATH` (only to run the sidecar — no `npm install` needed to use the plugin).
- A Chromium-based browser (`chromium`, `google-chrome`, `brave`, …).

## Install

The repo ships the prebuilt bundles (`public/app.js`, `build/server.js`), so a plain
plugin-manager install just works.

lazy.nvim:

```lua
{
  'uroborosq/uq-markdown', -- or dir = '/path/to/uq-markdown'
  ft = { 'markdown' },
  config = function()
    require('uq-markdown').setup({})
  end,
}
```

## Usage

- `:MdPreview` — open the preview (opens the browser window).
- `:MdPreviewStop` — close the preview and stop the sidecar.
- `:MdPreviewToggle` — toggle.

Open a markdown file, run `:MdPreview`. Edit → live reload. Move the cursor → the
preview scroll-syncs. Double-click a block in the browser to jump the cursor to that
source line.

## Configuration (defaults)

```lua
require('uq-markdown').setup({
  browser = nil,                -- force a browser binary; nil = auto-detect
  browser_candidates = { 'chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome', 'brave' },
  browser_args = {},            -- extra CLI args for the browser
  app_class = 'uq-markdown',    -- WM class/app-id of the preview window (for tiling rules)
  user_data_dir = vim.fn.stdpath('cache') .. '/uq-markdown-profile',
  theme = 'auto',               -- 'auto' follows &background; or 'light' / 'dark'
  mermaid_config = nil,         -- path to a mermaid config JSON (like mermaid CLI's `-c`)
  node = 'node',
  filetypes = { 'markdown', 'markdown.mdx', 'md' },
  debounce = 100,               -- ms between edits and refresh
})
```

`mermaid_config` points at a JSON file whose keys are merged into
`mermaid.initialize` (same shape as the mermaid CLI's `-c`), overriding the
plugin defaults — e.g. `{ "theme": "forest", "flowchart": { "curve": "linear" } }`.
It's re-read automatically when the file changes on disk. If it sets `theme`,
that wins over the nvim-derived light/dark theme.

Tip: to dock the window on the side, add a rule in your WM keyed on the
`uq-markdown` window class (e.g. i3/sway `for_window [app_id="uq-markdown"] …`,
Hyprland `windowrule`, etc.).

### Sway

The preview window is launched with `--class=uq-markdown`. Sway reads this as the
window's `app_id` **only when Chromium runs in native Wayland mode**, so add the
Wayland hint via `browser_args` and match on `app_id`:

```lua
require('uq-markdown').setup({
  browser_args = { '--ozone-platform-hint=auto' },
})
```

Then in `~/.config/sway/config`:

```
# Dock the preview as a floating window pinned to the right third of the screen.
no_focus [app_id="uq-markdown"] 
```

Prefer it tiled next to your editor instead? Drop the `floating`/`sticky`/
`move` lines and keep only the `for_window [app_id="uq-markdown"]` selector with
whatever layout commands you like (e.g. `split none`).

Caveat: if Chromium falls back to Xwayland (no Wayland hint, or an X11 session),
it has no `app_id` — match on `class` instead: `for_window [class="uq-markdown"]`.
Check what the running window exposes with `swaymsg -t get_tree`.

## Development

Only needed if you change the JS/frontend:

```sh
npm install
npm run build      # rebuilds public/app.js and build/server.js
npm run watch      # rebuild on change
```

`npm install` may warn that esbuild's postinstall script was blocked; the build
still works because the platform binary (`@esbuild/linux-x64`) is installed as a
normal dependency.

Bundled versions are pinned to `latest` in `package.json`; re-run `npm install &&
npm run build` to pull a newer mermaid/ELK.
