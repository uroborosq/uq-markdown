// Bundles the two JS entry points with esbuild:
//   web/main.mjs        -> public/app.js   (browser: markdown-it + mermaid + ELK + ws client)
//   server/src/main.mjs -> build/server.js (node: http + ws sidecar)
// Both outputs are committed so the plugin works with only `node` in PATH (no npm install).

import { build, context } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions[]} */
const targets = [
  {
    entryPoints: [resolve(root, 'web/main.mjs')],
    outfile: resolve(root, 'public/app.js'),
    platform: 'browser',
    format: 'iife',
    bundle: true,
    minify: !watch,
    sourcemap: false,
    // mermaid ships its own workers/deps; let esbuild inline everything.
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'info',
  },
  {
    entryPoints: [resolve(root, 'server/src/main.mjs')],
    outfile: resolve(root, 'build/server.js'),
    platform: 'node',
    target: 'node18',
    format: 'esm',
    bundle: true,
    minify: false,
    sourcemap: false,
    // `ws` optionally requires these native/optional addons; they are not needed.
    external: ['bufferutil', 'utf-8-validate'],
    banner: {
      js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
    },
    logLevel: 'info',
  },
];

if (watch) {
  for (const t of targets) {
    const ctx = await context(t);
    await ctx.watch();
  }
  console.log('esbuild: watching…');
} else {
  await Promise.all(targets.map((t) => build(t)));
  console.log('esbuild: build complete');
}
