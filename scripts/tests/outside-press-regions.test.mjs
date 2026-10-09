import assert from 'node:assert/strict';
import test from 'node:test';
import { getOutsidePressRegions } from '../../src/lib/outside-press-regions.ts';

const contains = (rect, x, y) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;

test('outside interception covers the window while leaving every point inside the picker available', () => {
  const viewport = { x: 0, y: 0, width: 390, height: 800 };
  const picker = { x: 48, y: 70, width: 294, height: 32 };
  const regions = getOutsidePressRegions(viewport, picker);
  for (let x = 0; x < viewport.width; x++) {
    for (let y = 0; y < viewport.height; y++) {
      const count = regions.filter((rect) => contains(rect, x, y)).length;
      assert.equal(count, contains(picker, x, y) ? 0 : 1);
    }
  }
});

test('a portal offset is subtracted from window coordinates', () => {
  assert.deepEqual(
    getOutsidePressRegions({ x: 10, y: 20, width: 390, height: 800 }, { x: 58, y: 90, width: 294, height: 32 }),
    getOutsidePressRegions({ x: 0, y: 0, width: 390, height: 800 }, { x: 48, y: 70, width: 294, height: 32 }),
  );
});

test('a control on an edge leaves no negative or overlapping interception regions', () => {
  const viewport = { x: 0, y: 0, width: 800, height: 390 };
  const regions = getOutsidePressRegions(viewport, { x: 0, y: 0, width: 800, height: 32 });
  assert.deepEqual(regions, [{ x: 0, y: 32, width: 800, height: 358 }]);
  const clipped = getOutsidePressRegions(viewport, { x: -10, y: -10, width: 100, height: 100 });
  assert.equal(
    clipped.reduce((area, rect) => area + rect.width * rect.height, 0),
    800 * 390 - 90 * 90,
  );
});
