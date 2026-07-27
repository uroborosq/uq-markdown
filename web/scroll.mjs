// Pure scroll-sync helpers, kept free of browser globals so they can be unit
// tested with `node --test`. The DOM glue in main.mjs feeds these the numbers
// (source lines, element offsets, viewport height) and acts on their result.

// Index of the last block whose source line is at or above `line`, or -1 if
// none. Assumes `lines` is non-decreasing (top-level block tokens in document
// order), so we can stop at the first block that starts past the cursor.
export function pickTargetIndex(lines, line) {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] <= line) idx = i;
    else break;
  }
  return idx;
}

// Decide where to scroll so the target block is visible. `rectTop` is the
// block's viewport-relative top (px), `scrollY` the current scroll offset,
// `innerHeight` the viewport height. Returns null when the block is already
// within the comfortable band [band, 1-band] of the viewport — the key to a
// jitter-free editing experience: typing on an on-screen line moves nothing.
// Otherwise returns the absolute scrollY that places the block a third of the
// way down.
export function computeScrollTarget(rectTop, scrollY, innerHeight, band = 0.1) {
  const top = innerHeight * band;
  const bottom = innerHeight * (1 - band);
  if (rectTop >= top && rectTop <= bottom) return null;
  return scrollY + rectTop - innerHeight / 3;
}

// Vim-style navigation keys -> a scroll delta, or null when the key is not one
// of ours (so the caller leaves the event alone). `mods` is anything with the
// KeyboardEvent modifier flags — the event itself in the browser, a plain object
// in tests. h/j/k/l move by `step` px; <C-d>/<C-u> move by half a viewport, like
// vim. Shift/alt/meta combos are deliberately ignored: those are vim commands
// (J, K) or browser shortcuts, not scrolling.
export function keyScrollDelta(key, mods, innerHeight, step = 64) {
  if (mods.altKey || mods.metaKey || mods.shiftKey) return null;
  const half = Math.round(innerHeight / 2);
  if (mods.ctrlKey) {
    if (key === 'd') return { x: 0, y: half };
    if (key === 'u') return { x: 0, y: -half };
    return null;
  }
  switch (key) {
    case 'j':
      return { x: 0, y: step };
    case 'k':
      return { x: 0, y: -step };
    case 'l':
      return { x: step, y: 0 };
    case 'h':
      return { x: -step, y: 0 };
    default:
      return null;
  }
}

// Fold a repeated key press into a single accumulated destination. `pending` is
// the offset the previous press aimed at (null when nothing is animating),
// `current` where the viewport actually sits right now, `max` the furthest it
// can go. Building on `pending` rather than `current` is what makes holding a
// key travel at a steady speed: a smooth animation measures its delta from the
// live position, so without this every repeat would restart from mid-flight and
// the page would crawl instead of accelerating away.
export function accumulateScroll(pending, current, delta, max) {
  const base = pending === null ? current : pending;
  return Math.max(0, Math.min(max, base + delta));
}
