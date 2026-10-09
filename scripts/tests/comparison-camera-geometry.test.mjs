import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectCameraRatio,
  selectPhotoResolution,
  fitComparisonPanels,
  fitImageSize,
  getCaptureCrop,
  getCameraPreviewLayout,
  getSharedSensorRatio,
} from '../../src/lib/comparison-camera-geometry.ts';

const sizes = [
  { width: 4000, height: 3000 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
];

test('automatic ratio uses an available unusual ratio and falls back to a supported common ratio', () => {
  assert.equal(selectCameraRatio('auto', 2.4, [...sizes, { width: 6000, height: 2500 }]), 2.4);
  assert.equal(selectCameraRatio('auto', 2.4, sizes), 16 / 9);
  assert.equal(selectCameraRatio('auto', 1 / 2.4, sizes), 9 / 16);
  assert.equal(selectCameraRatio('auto', 1, sizes), 4 / 3);
  assert.equal(selectCameraRatio('auto', 2.4, [sizes[0]]), 4 / 3);
});

test('manual ratios remain fixed for either reference orientation and select the largest matching resolution', () => {
  for (const reference of [16 / 9, 9 / 16]) {
    assert.equal(selectCameraRatio('3:4', reference, sizes), 3 / 4);
    assert.equal(selectCameraRatio('16:9', reference, sizes), 16 / 9);
  }
  assert.deepEqual(selectPhotoResolution(sizes, 9 / 16), sizes[1]);
  assert.deepEqual(selectPhotoResolution(sizes, 1), sizes[0]);
  assert.equal(selectPhotoResolution([{ width: 0, height: 0 }], 1), undefined);
});

test('mixed portrait and landscape panels keep both images whole at a common width', () => {
  const available = { width: 400, height: 600 };
  const panels = fitComparisonPanels(available, 16 / 9, 3 / 4);
  assert.ok(panels.width <= available.width);
  assert.ok(Math.abs(panels.referenceHeight + panels.photoHeight + 2 - available.height) < 0.001);
  assert.ok(Math.abs(panels.width / panels.referenceHeight - 16 / 9) < 0.001);
  assert.ok(Math.abs(panels.width / panels.photoHeight - 3 / 4) < 0.001);
  assert.deepEqual(fitImageSize({ width: 400, height: 600 }, 16 / 9), { width: 400, height: 225 });
});

test('preview and high-resolution photo crops use the same centered sensor region', () => {
  const photo = { width: 3000, height: 4000 };
  const preview = { width: 1080, height: 1920 };
  const shared = getSharedSensorRatio(photo, preview);
  assert.equal(shared, 16 / 9);
  for (const ratio of [4 / 3, 16 / 9, 3 / 4, 9 / 16, 1]) {
    const photoCrop = getCaptureCrop(photo, ratio, shared);
    const previewCrop = getCaptureCrop(preview, ratio, shared);
    // Both streams are modeled as centered crops of the same 4:3 sensor.
    const photoSensorWidth = 1;
    const previewSensorWidth = 0.75;
    assert.ok(
      Math.abs(
        (photoCrop.width / photo.width) * photoSensorWidth - (previewCrop.width / preview.width) * previewSensorWidth,
      ) < 0.001,
    );
    assert.ok(Math.abs(photoCrop.height / photo.height - previewCrop.height / preview.height) < 0.001);
    assert.ok(Math.abs(photoCrop.width / photoCrop.height - ratio) < 0.002);
  }
});

test('preview is enlarged only enough to expose the selected crop inside its frame', () => {
  const frame = { width: 300, height: 225 };
  const preview = { width: 1080, height: 1920 };
  const crop = getCaptureCrop(preview, 4 / 3, 16 / 9);
  const layout = getCameraPreviewLayout(frame, preview, 16 / 9);
  assert.ok(Math.abs(layout.width / layout.height - preview.width / preview.height) < 0.001);
  assert.ok(Math.abs((layout.width * crop.width) / preview.width - frame.width) < 0.001);
  assert.ok(Math.abs((layout.height * crop.height) / preview.height - frame.height) < 0.001);
});

test('a native square photo intersects the preview in both sensor axes', () => {
  const sensor = { width: 4000, height: 3000 };
  const photo = { width: 3000, height: 3000 };
  assert.equal(getSharedSensorRatio(photo, { width: 1440, height: 1080 }, sensor), 1);
  const shared = getSharedSensorRatio(photo, { width: 1920, height: 1080 }, sensor);
  assert.equal(shared, 4 / 3);
  assert.deepEqual(getCaptureCrop(photo, 1, shared, false), { originX: 375, originY: 375, width: 2250, height: 2250 });
  assert.deepEqual(getCaptureCrop(photo, 1, shared, true), { originX: 375, originY: 375, width: 2250, height: 2250 });
});

test('rotating the phone keeps the upright output ratio, while inverting only the on-screen frame ratio', () => {
  const portraitSource = { width: 3000, height: 4000 };
  const landscapeSource = { width: 4000, height: 3000 };
  const ratio = 16 / 9;
  const upright = getCaptureCrop(portraitSource, ratio, 16 / 9);
  const rotated = getCaptureCrop(landscapeSource, ratio, 16 / 9);
  assert.ok(Math.abs(upright.width / upright.height - ratio) < 0.002);
  assert.ok(Math.abs(rotated.width / rotated.height - ratio) < 0.002);
});
