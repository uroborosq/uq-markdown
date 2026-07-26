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
