import assert from 'node:assert/strict';
import test from 'node:test';
import { getBangumiOverviewBounds, getPointFlyToZoom } from '../../src/lib/map-camera.ts';

test('overview bounds use longitude-latitude order and enclose every valid point', () => {
  const points = [{ geo: [35.2, 139.8] }, { geo: [34.5, 140.1] }, { geo: [36.1, 138.3] }];
  const before = structuredClone(points);
  assert.deepEqual(getBangumiOverviewBounds(points), { ne: [140.1, 36.1], sw: [138.3, 34.5] });
  assert.deepEqual(points, before);
});

test('one valid location retains equal bounds for the existing single-point camera path', () => {
  assert.deepEqual(getBangumiOverviewBounds([{ geo: [35, 139] }, { geo: [35, 139] }, { geo: [0, 0] }]), {
    ne: [139, 35],
    sw: [139, 35],
  });
});

test('empty or unusable overview coordinates do not produce an invalid camera command', () => {
  assert.equal(getBangumiOverviewBounds([]), null);
  assert.equal(getBangumiOverviewBounds([{ geo: [0, 0] }, { geo: [NaN, 139] }, { geo: [35, Infinity] }]), null);
  assert.deepEqual(getBangumiOverviewBounds([{ geo: [NaN, 139] }, { geo: [35, 139] }]), {
    ne: [139, 35],
    sw: [139, 35],
  });
});

test('legitimate equator and prime-meridian locations remain in the overview', () => {
  assert.deepEqual(getBangumiOverviewBounds([{ geo: [0, -5] }, { geo: [-10, 0] }]), {
    ne: [0, 0],
    sw: [-5, -10],
  });
});

test('point requests retain the existing density-to-zoom thresholds', () => {
  for (const [density, zoom] of [
    [undefined, 15],
    [65, 15],
    [64, 16],
    [32, 17],
    [16, 18],
    [8, 19],
    [4, 20],
    [2, 21],
    [1, 22],
  ]) {
    assert.equal(getPointFlyToZoom(density), zoom);
  }
});
