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

// Decide where to scroll so the target block is visible. `rectTop` and
// `rectHeight` are the block's viewport-relative top and its height (px),
// `scrollY` the current scroll offset, `innerHeight` the viewport height.
// The comfortable zone is [band, 1-band] of the viewport. Returns null when no
// scroll is needed — the key to a jitter-free editing experience: typing on an
// on-screen block moves nothing.
//
// - A block that fits in the zone must sit entirely inside it; otherwise it is
//   centred, the way `zz` would in Neovim (so a diagram half cut off at the
//   bottom comes into full view).
// - A block taller than the zone can't be fully shown. It stays put while its
//   top is inside the zone (you're editing in it), else its top is aligned to
//   the zone's top edge to show as much of it as possible.
export function computeScrollTarget(rectTop, rectHeight, scrollY, innerHeight, band = 0.1) {
  const top = innerHeight * band;
  const bottom = innerHeight * (1 - band);
  const rectBottom = rectTop + rectHeight;
  if (rectHeight <= bottom - top) {
    if (rectTop >= top && rectBottom <= bottom) return null;
    return scrollY + rectTop + rectHeight / 2 - innerHeight / 2;
  }
  if (rectTop >= top && rectTop <= bottom) return null;
  return scrollY + rectTop - top;
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
