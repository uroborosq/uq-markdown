import test from 'node:test';
import assert from 'node:assert/strict';

import { pickTargetIndex, computeScrollTarget, keyScrollDelta } from './scroll.mjs';

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

test('computeScrollTarget: comfortably-visible block returns null (no scroll)', () => {
  // innerHeight 1000, band 0.1 -> visible dead-zone is [100, 900].
  assert.equal(computeScrollTarget(500, 2000, 1000), null);
});

test('computeScrollTarget: block above the viewport scrolls it to one-third', () => {
  // rectTop -50 is above the top dead-zone -> scroll so it lands at innerHeight/3.
  assert.equal(computeScrollTarget(-50, 2000, 1000), 2000 + -50 - 1000 / 3);
});

test('computeScrollTarget: block below the viewport scrolls it to one-third', () => {
  assert.equal(computeScrollTarget(950, 2000, 1000), 2000 + 950 - 1000 / 3);
});

test('computeScrollTarget: block exactly on the band edge is still considered visible', () => {
  assert.equal(computeScrollTarget(100, 2000, 1000), null);
  assert.equal(computeScrollTarget(900, 2000, 1000), null);
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
