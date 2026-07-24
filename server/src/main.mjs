// uq-markdown sidecar.
//
// Responsibilities:
//   * serve the static preview page (public/index.html + public/app.js),
//   * serve local image files referenced by the markdown via /__local?path=<abs>,
//   * run a WebSocket server that pushes state to the browser,
//   * read newline-delimited JSON messages from stdin (sent by Neovim) and
//     relay them to connected browsers; remember the last `update` so a freshly
//     opened browser immediately shows the current file.
//
// Protocol (Neovim -> sidecar, one JSON object per line on stdin):
//   {"type":"update","path":"/abs/file.md","dir":"/abs","content":"...","theme":"dark"}
//   {"type":"cursor","line":42}
//   {"type":"theme","theme":"light"}
//   {"type":"close"}
//
// stdout: exactly one line `{"type":"ready","port":<n>}` once listening.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
import readline from 'node:readline';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
// build/server.js and public/ are siblings in the plugin root.
const PUBLIC_DIR = resolve(__dirname, '../public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
};

/** Last `update` message, replayed to newly connected browsers. */
let lastUpdate = null;
/** Last known cursor line, replayed on connect for scroll sync. */
let lastCursor = null;

async function serveStatic(res, filePath, contentType) {
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/' || url.pathname === '/index.html') {
    return serveStatic(res, resolve(PUBLIC_DIR, 'index.html'), MIME['.html']);
  }
  if (url.pathname === '/app.js') {
    return serveStatic(res, resolve(PUBLIC_DIR, 'app.js'), MIME['.js']);
  }
  // Local assets (images) referenced by the previewed markdown.
  if (url.pathname === '/__local') {
    const p = url.searchParams.get('path');
    if (!p) {
      res.writeHead(400).end('missing path');
      return;
    }
    const ct = MIME[extname(p).toLowerCase()] || 'application/octet-stream';
    return serveStatic(res, p, ct);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found');
});

const wss = new WebSocketServer({ server });

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

wss.on('connection', (ws) => {
  // Bring a new browser up to date immediately.
  if (lastUpdate) ws.send(JSON.stringify(lastUpdate));
  if (lastCursor != null) ws.send(JSON.stringify({ type: 'cursor', line: lastCursor }));

  ws.on('message', (raw) => {
    // Reverse channel (e.g. click-to-line). Relay to Neovim over stdout so it
    // can optionally act on it. Neovim ignores unknown message types.
    let obj;
    try {
      obj = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (obj && obj.type) process.stdout.write(JSON.stringify(obj) + '\n');
  });
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  process.stdout.write(JSON.stringify({ type: 'ready', port }) + '\n');
});

// ---- stdin: messages from Neovim -------------------------------------------
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  switch (msg.type) {
    case 'update':
      lastUpdate = msg;
      broadcast(msg);
      break;
    case 'cursor':
      lastCursor = msg.line;
      broadcast(msg);
      break;
    case 'theme':
      if (lastUpdate) lastUpdate.theme = msg.theme;
      broadcast(msg);
      break;
    case 'close':
      shutdown();
      break;
    default:
      broadcast(msg);
  }
});
rl.on('close', shutdown);

function shutdown() {
  try {
    broadcast({ type: 'shutdown' });
  } catch {}
  server.close();
  process.exit(0);
}
