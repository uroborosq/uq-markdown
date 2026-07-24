// uq-markdown preview frontend.
//
// Renders markdown to HTML with markdown-it, then renders every ```mermaid
// block using the LATEST mermaid together with the ELK layout engine. ELK is
// the whole point of this plugin, so it is registered up front and used as the
// default layout for all diagrams (individual diagrams may still override it via
// their own frontmatter).

import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import hljs from 'highlight.js/lib/common';
import mermaid from 'mermaid';
import elkLayouts from '@mermaid-js/layout-elk';

// --- mermaid + ELK ----------------------------------------------------------
mermaid.registerLayoutLoaders(elkLayouts);

let currentTheme = 'default';
// User-supplied mermaid config (from the plugin's `mermaid_config` file). Its
// keys override the defaults below; if it sets `theme`, that wins over the
// nvim-derived theme.
let userMermaidConfig = {};
function initMermaid(theme) {
  currentTheme = theme === 'dark' ? 'dark' : 'default';
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    layout: 'elk', // default everything to ELK; frontmatter can override.
    theme: currentTheme,
    flowchart: { defaultRenderer: 'elk' },
    ...userMermaidConfig,
  });
}
initMermaid('default');

// --- markdown-it ------------------------------------------------------------
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
  // Syntax highlighting for regular code fences (mermaid is handled separately
  // by the fence override below, so it never reaches this).
  highlight(str, lang) {
    const code =
      lang && hljs.getLanguage(lang)
        ? hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
        : md.utils.escapeHtml(str);
    return `<pre class="hljs"><code class="language-${md.utils.escapeHtml(lang || '')}">${code}</code></pre>`;
  },
}).use(anchor, { permalink: false });

// Override the fence renderer so we can:
//   * emit ```mermaid blocks as <pre class="mermaid"> with the raw graph text
//     (mermaid reads textContent, so HTML-escaping round-trips: `A --> B` stays
//     `-->`), tagged with their source line for scroll sync;
//   * render every other fence through the highlight option, which returns a
//     ready <pre class="hljs"> block. We delegate to md.options.highlight
//     directly instead of the built-in fence rule so behaviour never depends on
//     whether that rule is present.
md.renderer.rules.fence = function (tokens, idx) {
  const token = tokens[idx];
  const info = (token.info || '').trim().split(/\s+/)[0];
  if (info === 'mermaid') {
    const line = token.map ? token.map[0] + 1 : '';
    return `<pre class="mermaid" data-source-line="${line}">${md.utils.escapeHtml(
      token.content,
    )}</pre>\n`;
  }
  return md.options.highlight(token.content, info, '') + '\n';
};

// Tag top-level block tokens with their source line for scroll sync.
md.core.ruler.push('source_line', (state) => {
  for (const token of state.tokens) {
    if (token.map && token.level === 0 && token.type.endsWith('_open')) {
      token.attrSet('data-source-line', String(token.map[0] + 1));
    }
  }
});

// --- DOM --------------------------------------------------------------------
const content = document.getElementById('content');
let currentDir = null; // directory of the previewed file, for image resolution.

function rewriteLocalImages(root, dir) {
  if (!dir) return;
  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';
    if (/^(https?:|data:|blob:)/i.test(src)) continue;
    // Resolve relative paths against the markdown file's directory.
    let abs;
    if (src.startsWith('/')) abs = src;
    else if (src.startsWith('file://')) abs = src.replace('file://', '');
    else abs = dir.replace(/\/$/, '') + '/' + src.replace(/^\.\//, '');
    img.src = '/__local?path=' + encodeURIComponent(abs);
  }
}

// Lightweight wheel-zoom + drag-pan for (often large) ELK diagrams.
function makeZoomable(pre) {
  const svg = pre.querySelector('svg');
  if (!svg) return;
  svg.style.maxWidth = 'none';
  let scale = 1;
  let tx = 0;
  let ty = 0;
  const apply = () => {
    svg.style.transformOrigin = '0 0';
    svg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };
  pre.addEventListener(
    'wheel',
    (e) => {
      if (!(e.ctrlKey || e.metaKey || e.altKey)) return; // let the page scroll normally
      e.preventDefault();
      const rect = pre.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      // zoom towards the cursor
      tx = mx - (mx - tx) * factor;
      ty = my - (my - ty) * factor;
      scale *= factor;
      apply();
    },
    { passive: false },
  );
  let dragging = false;
  let sx = 0;
  let sy = 0;
  pre.addEventListener('mousedown', (e) => {
    dragging = true;
    sx = e.clientX - tx;
    sy = e.clientY - ty;
    pre.classList.add('dragging');
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    tx = e.clientX - sx;
    ty = e.clientY - sy;
    apply();
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
    pre.classList.remove('dragging');
  });
  pre.addEventListener('dblclick', () => {
    scale = 1;
    tx = 0;
    ty = 0;
    apply();
  });
}

let renderToken = 0;
async function render(update) {
  currentDir = update.dir || null;
  const theme = update.theme || 'default';
  const nextUserConfig = update.mermaid_config || {};
  const configChanged = JSON.stringify(nextUserConfig) !== JSON.stringify(userMermaidConfig);
  if (configChanged) userMermaidConfig = nextUserConfig;
  if (configChanged || (theme === 'dark' ? 'dark' : 'default') !== currentTheme) initMermaid(theme);
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';

  const token = ++renderToken;
  const prevScroll = window.scrollY;

  content.innerHTML = md.render(update.content || '');
  rewriteLocalImages(content, currentDir);

  // Render mermaid diagrams. Each render regenerates the DOM, so nodes are fresh.
  const nodes = content.querySelectorAll('pre.mermaid');
  if (nodes.length) {
    try {
      await mermaid.run({ nodes });
    } catch (e) {
      console.error('[uq-markdown] mermaid render error', e);
    }
    if (token !== renderToken) return; // a newer update superseded us
    for (const pre of content.querySelectorAll('pre.mermaid')) makeZoomable(pre);
  }

  // Keep the viewport roughly stable across live edits.
  window.scrollTo(0, prevScroll);
}

function scrollToLine(line) {
  const els = content.querySelectorAll('[data-source-line]');
  let target = null;
  for (const el of els) {
    const l = parseInt(el.getAttribute('data-source-line'), 10);
    if (l <= line) target = el;
    else break;
  }
  if (target) {
    const rect = target.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + rect.top - window.innerHeight / 3, behavior: 'smooth' });
  }
}

// Reverse sync: clicking a block tells Neovim which source line it maps to.
content.addEventListener('dblclick', (e) => {
  const el = e.target.closest('[data-source-line]');
  if (!el || !ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'sync-cursor', line: parseInt(el.getAttribute('data-source-line'), 10) }));
});

// --- WebSocket --------------------------------------------------------------
let ws = null;
function connect() {
  ws = new WebSocket(`ws://${location.host}`);
  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    switch (msg.type) {
      case 'update':
        render(msg);
        break;
      case 'cursor':
        scrollToLine(msg.line);
        break;
      case 'theme':
        initMermaid(msg.theme);
        document.documentElement.dataset.theme = msg.theme === 'dark' ? 'dark' : 'light';
        break;
      case 'shutdown':
        ws.close();
        break;
    }
  });
  ws.addEventListener('close', () => setTimeout(connect, 500));
  ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'ready' })));
}
connect();
