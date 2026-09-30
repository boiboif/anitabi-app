import assert from 'node:assert/strict';
import test from 'node:test';
import { getStableMapImageSortKeys } from '../../src/utils/map-image-sort.ts';

test('map image draw keys keep latitude order and resolve identical latitudes', () => {
  const byLatitude = [
    { order: 10, point: { geo: [35.72, 139.7] } },
    { order: 228, point: { geo: [35.729828, 139.713151] } },
    { order: 229, point: { geo: [35.729828, 139.713111] } },
    { order: 300, point: { geo: [35.74, 139.7] } },
  ];

  const keys = getStableMapImageSortKeys(byLatitude, 301);

  assert.equal(keys[300], 1);
  assert.equal(keys[228], 2);
  assert.equal(keys[229], 3);
  assert.equal(keys[10], 4);
  assert.equal(keys[11], 0);
});
