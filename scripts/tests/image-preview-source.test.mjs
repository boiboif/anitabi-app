import assert from 'node:assert/strict';
import test from 'node:test';
import { getPreviewContainerOrigin, getPreviewSourceGeometry } from '../../src/utils/image-preview-source.ts';

const viewport = { width: 400, height: 800 };
const landscape = { width: 1600, height: 900 };

test('sheet touch coordinates locate the source independently of its Fabric position', () => {
  // The image is 26px below a sheet starting at y=200, rather than y=26 on screen.
  const origin = getPreviewContainerOrigin({ pageX: 58, pageY: 276, locationX: 50, locationY: 50 });
  assert.deepEqual(origin, { x: 8, y: 226 });
  const geometry = getPreviewSourceGeometry(landscape, viewport, {
    ...origin,
    width: 180,
    height: 140,
    contentFit: 'cover',
    borderRadius: 12,
  });
  assert.deepEqual(geometry.clip, { x: 8, y: 226, width: 180, height: 140, borderRadius: 12 });
});

test('moving or scrolling the sheet uses each new touch without accumulating offsets', () => {
  for (const y of [226, 626, 176, 226]) {
    assert.deepEqual(getPreviewContainerOrigin({ pageX: 58, pageY: y + 70, locationX: 50, locationY: 70 }), {
      x: 8,
      y,
    });
  }
});

test('accessibility and invalid touch events retain the layout measurement fallback', () => {
  assert.equal(getPreviewContainerOrigin(), null);
  assert.equal(getPreviewContainerOrigin({ pageX: 0, pageY: 0, locationX: 0, locationY: 0 }), null);
  assert.equal(getPreviewContainerOrigin({ pageX: NaN, pageY: 20, locationX: 10, locationY: 10 }), null);
  assert.equal(getPreviewContainerOrigin({ pageX: 10, pageY: Infinity, locationX: 10, locationY: 10 }), null);
});

test('contain sources retain the demo transition and need no crop', () => {
  const geometry = getPreviewSourceGeometry(landscape, viewport, { x: 20, y: 100, width: 200, height: 200 });
  assert.deepEqual(geometry, { transform: { x: -80, y: -200, scale: 0.5 }, clip: null });
});

test('cover uses the larger scale so a portrait screenshot fills a wide card', () => {
  const source = { x: 40, y: 500, width: 190, height: 118.75, contentFit: 'cover', borderRadius: 12 };
  const geometry = getPreviewSourceGeometry({ width: 900, height: 1600 }, viewport, source);
  assert.ok(Math.abs(geometry.transform.scale - 190 / 400) < 1e-10);
  assert.deepEqual(geometry.clip, { x: 40, y: 500, width: 190, height: 118.75, borderRadius: 12 });
  assert.equal(geometry.transform.x, -65);
});

test('the home popup retains its 250px image inside its narrower 220px clipping view', () => {
  const clip = { x: 30, y: 400, width: 220, height: 140.625 };
  const geometry = getPreviewSourceGeometry(landscape, viewport, {
    ...clip,
    width: 250,
    contentFit: 'cover',
    borderRadius: 8,
    clip,
  });
  assert.equal(geometry.transform.scale, 0.625);
  assert.equal(geometry.transform.x, -45);
  assert.deepEqual(geometry.clip, { ...clip, borderRadius: 8 });
});

test('missing, invalid or offscreen sources use the fade fallback', () => {
  for (const source of [
    null,
    { x: 0, y: 0, width: 0, height: 100 },
    { x: 0, y: 900, width: 100, height: 100 },
    { x: NaN, y: 0, width: 100, height: 100 },
  ]) {
    assert.equal(getPreviewSourceGeometry(landscape, viewport, source), null);
  }
});
