import assert from 'node:assert/strict';
import test from 'node:test';
import { getPreviewDoubleTapTarget, getPreviewPageTarget } from '../../src/utils/image-preview-gestures.ts';

const state = {
  scale: 1,
  translateX: 0,
  translateY: 0,
  containerSize: { width: 400, height: 800 },
  childSize: { width: 400, height: 250 },
};

test('double tap resets any pinch zoom, including scales below the old 4.8 threshold', () => {
  for (const scale of [1.01, 1.5, 2, 3, 4.79, 4.8, 6, 7]) {
    assert.deepEqual(getPreviewDoubleTapTarget({ ...state, scale, translateX: 80, translateY: -35 }, 50, 200), {
      scale: 1,
      translateX: 0,
      translateY: 0,
    });
  }
});

test('double tap at the original image center zooms without translation', () => {
  const target = getPreviewDoubleTapTarget(state, 200, 400);
  assert.equal(target.scale, 6);
  assert.equal(Math.abs(target.translateX), 0);
  assert.equal(Math.abs(target.translateY), 0);
});

test('zoom preserves the tapped focal point in the image rather than using letterbox coordinates', () => {
  const x = 230;
  const y = 420;
  const target = getPreviewDoubleTapTarget(state, x, y);
  assert.equal(200 + target.translateX + (x - 200) * target.scale, x);
  assert.equal(400 + target.translateY + (y - 400) * target.scale, y);
});

test('tapping the empty margin clamps the zoom position to the image boundaries', () => {
  const target = getPreviewDoubleTapTarget(state, 0, 0);
  assert.equal(target.translateX, 1000);
  assert.equal(target.translateY, 350);
});

test('a second double tap returns to the original state', () => {
  const zoomed = { ...state, ...getPreviewDoubleTapTarget(state, 230, 420) };
  assert.deepEqual(getPreviewDoubleTapTarget(zoomed, 230, 420), { scale: 1, translateX: 0, translateY: 0 });
});

test('slow short drags rebound while slow long drags turn one page', () => {
  assert.equal(getPreviewPageTarget(1, 3, -60, 0, 400), 1);
  assert.equal(getPreviewPageTarget(1, 3, -130, 0, 400), 2);
  assert.equal(getPreviewPageTarget(1, 3, 130, 0, 400), 0);
});

test('fast swipes turn a page but finger jitter does not', () => {
  assert.equal(getPreviewPageTarget(1, 3, -30, -900, 400), 2);
  assert.equal(getPreviewPageTarget(1, 3, 30, 900, 400), 0);
  assert.equal(getPreviewPageTarget(1, 3, -5, -900, 400), 1);
});

test('the first, last and single-image pages cannot scroll past the data', () => {
  assert.equal(getPreviewPageTarget(0, 3, 150, 900, 400), 0);
  assert.equal(getPreviewPageTarget(2, 3, -150, -900, 400), 2);
  assert.equal(getPreviewPageTarget(0, 1, -150, -900, 400), 0);
  assert.equal(getPreviewPageTarget(0, 1, 150, 900, 400), 0);
});
