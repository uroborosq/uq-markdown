import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pickTargetIndex,
  computeScrollTarget,
  keyScrollDelta,
  accumulateScroll,
} from './scroll.mjs';

const NONE = { ctrlKey: false, altKey: false, metaKey: false, shiftKey: false };
const CTRL = { ...NONE, ctrlKey: true };

test('pickTargetIndex: no blocks yields -1', () => {
  assert.equal(pickTargetIndex([], 5), -1);
});

test('pickTargetIndex: all blocks below the line yields -1', () => {
  assert.equal(pickTargetIndex([10, 20, 30], 5), -1);
});

test('pickTargetIndex: picks the last block at or above the line', () => {
  // lines start at 1, 4, 9; cursor on line 6 belongs to the block starting at 4.
  assert.equal(pickTargetIndex([1, 4, 9], 6), 1);
});

test('pickTargetIndex: exact match selects that block', () => {
  assert.equal(pickTargetIndex([1, 4, 9], 9), 2);
});

// computeScrollTarget(rectTop, rectHeight, scrollY, innerHeight, band)
// innerHeight 1000, band 0.1 -> comfortable zone is [100, 900], 800px tall.

test('computeScrollTarget: block fully inside the comfortable zone returns null', () => {
  assert.equal(computeScrollTarget(500, 100, 2000, 1000), null);
});

test('computeScrollTarget: zone edges count as inside', () => {
  assert.equal(computeScrollTarget(100, 800, 2000, 1000), null);
});

test('computeScrollTarget: block above the viewport is centred', () => {
  // centre of the block (-50 + 100/2 = 0) moves to the viewport centre (500).
  assert.equal(computeScrollTarget(-50, 100, 2000, 1000), 2000 + 0 - 500);
});

test('computeScrollTarget: block below the viewport is centred', () => {
  assert.equal(computeScrollTarget(950, 100, 2000, 1000), 2000 + 1000 - 500);
});

test('computeScrollTarget: block whose top is visible but bottom is cut off is centred', () => {
  // a 400px diagram starting at 800 spills past 900 -> bring it to the middle.
  assert.equal(computeScrollTarget(800, 400, 2000, 1000), 2000 + 1000 - 500);
});

test('computeScrollTarget: block taller than the zone with a visible top stays put', () => {
  // long code block you are typing inside: never yank it around.
  assert.equal(computeScrollTarget(300, 2000, 2000, 1000), null);
});

test('computeScrollTarget: block taller than the zone with an off-screen top aligns its top', () => {
  assert.equal(computeScrollTarget(-500, 2000, 2000, 1000), 2000 - 500 - 100);
  assert.equal(computeScrollTarget(950, 2000, 2000, 1000), 2000 + 950 - 100);
});

test('keyScrollDelta: j/k scroll down/up by one step', () => {
  assert.deepEqual(keyScrollDelta('j', NONE, 1000, 64), { x: 0, y: 64 });
  assert.deepEqual(keyScrollDelta('k', NONE, 1000, 64), { x: 0, y: -64 });
});

test('keyScrollDelta: l/h scroll right/left by one step', () => {
  assert.deepEqual(keyScrollDelta('l', NONE, 1000, 64), { x: 64, y: 0 });
  assert.deepEqual(keyScrollDelta('h', NONE, 1000, 64), { x: -64, y: 0 });
});

test('keyScrollDelta: <C-d>/<C-u> move half a viewport', () => {
  assert.deepEqual(keyScrollDelta('d', CTRL, 900), { x: 0, y: 450 });
  assert.deepEqual(keyScrollDelta('u', CTRL, 900), { x: 0, y: -450 });
});

test('keyScrollDelta: unhandled keys return null', () => {
  assert.equal(keyScrollDelta('a', NONE, 1000), null);
  assert.equal(keyScrollDelta('d', NONE, 1000), null); // plain d is not a scroll
  assert.equal(keyScrollDelta('ArrowDown', NONE, 1000), null); // browser handles it
});

test('keyScrollDelta: ctrl does not hijack hjkl, and other modifiers are ignored', () => {
  assert.equal(keyScrollDelta('j', CTRL, 1000), null);
  assert.equal(keyScrollDelta('j', { ...NONE, shiftKey: true }, 1000), null);
  assert.equal(keyScrollDelta('d', { ...CTRL, altKey: true }, 1000), null);
  assert.equal(keyScrollDelta('u', { ...CTRL, metaKey: true }, 1000), null);
});

test('accumulateScroll: with no animation in flight it moves from the live position', () => {
  assert.equal(accumulateScroll(null, 300, 64, 5000), 364);
});

test('accumulateScroll: repeats stack on the pending target, not the live position', () => {
  // The point of the helper: mid-animation the viewport is still at 300, but a
  // second press must aim past the first press's destination, not re-measure.
  assert.equal(accumulateScroll(364, 310, 64, 5000), 428);
  assert.equal(accumulateScroll(428, 350, 64, 5000), 492);
});

test('accumulateScroll: clamps to the scrollable range', () => {
  assert.equal(accumulateScroll(null, 20, -64, 5000), 0);
  assert.equal(accumulateScroll(4980, 4900, 64, 5000), 5000);
  assert.equal(accumulateScroll(null, 0, -64, 0), 0);
});

test('accumulateScroll: a pending target outside the range is still clamped', () => {
  assert.equal(accumulateScroll(-500, 0, -64, 5000), 0);
  assert.equal(accumulateScroll(9000, 4000, 64, 5000), 5000);
});
