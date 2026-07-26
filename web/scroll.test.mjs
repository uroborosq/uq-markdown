import test from 'node:test';
import assert from 'node:assert/strict';

import { pickTargetIndex, computeScrollTarget } from './scroll.mjs';

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
