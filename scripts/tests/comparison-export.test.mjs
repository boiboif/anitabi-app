import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildComparisonMetadata,
  DEFAULT_COMPARISON_EXPORT_SETTINGS,
  getComparisonExportLayout,
  hexToImageColor,
  normalizeComparisonExportSettings,
  readPhotoCaptureTime,
  resolveComparisonBorderColor,
} from '../../src/lib/comparison-export.ts';

test('new or damaged settings enable a white border and all five metadata fields', () => {
  for (const source of [undefined, null, 'bad data', [], {}]) {
    const settings = normalizeComparisonExportSettings(source);
    assert.deepEqual(settings, DEFAULT_COMPARISON_EXPORT_SETTINGS);
    assert.ok(settings.borderWidth > 0);
    assert.equal(settings.showName, false);
    assert.deepEqual(
      buildComparisonMetadata(settings, {}).rows.map((row) => row.field),
      ['work', 'location', 'scene', 'capturedAt', 'coordinates'],
    );
  }
});

test('persisted settings round and clamp widths, reject invalid values, and retain valid choices', () => {
  const settings = normalizeComparisonExportSettings({
    borderWidth: 100,
    borderColor: 'theme',
    showName: true,
    name: 'A'.repeat(80),
    showScene: true,
    showCoordinates: 'true',
    showLocation: 1,
    showCapturedAt: false,
    showWork: false,
  });
  assert.equal(settings.borderWidth, 32);
  assert.equal(settings.borderColor, 'theme');
  assert.equal(settings.name.length, 40);
  assert.equal(settings.showName, true);
  assert.equal(settings.showScene, true);
  assert.equal(settings.showCoordinates, true);
  assert.equal(settings.showLocation, true);
  assert.equal(settings.showCapturedAt, false);
  assert.equal(settings.showWork, false);
  const deselected = normalizeComparisonExportSettings({
    showCapturedAt: false,
    showLocation: false,
    showWork: false,
    showScene: false,
    showCoordinates: false,
  });
  assert.deepEqual(buildComparisonMetadata(deselected, {}), { name: undefined, rows: [] });
  assert.equal(normalizeComparisonExportSettings({ borderWidth: -10 }).borderWidth, 0);
  assert.equal(normalizeComparisonExportSettings({ borderWidth: 13.8 }).borderWidth, 14);
  assert.equal(
    normalizeComparisonExportSettings({ borderWidth: NaN, borderColor: 'red' }).borderWidth,
    DEFAULT_COMPARISON_EXPORT_SETTINGS.borderWidth,
  );
  assert.equal(normalizeComparisonExportSettings({ borderColor: 'red' }).borderColor, 'white');
  assert.deepEqual(normalizeComparisonExportSettings(JSON.parse(JSON.stringify(settings))), settings);
});

test('metadata includes only selected fields and prioritizes title and location', () => {
  const values = {
    work: '作品',
    location: '地点',
    scene: 'EP1 · 01:30',
    capturedAt: '2026/10/8 12:30',
    coordinates: '35.00000, 139.00000',
  };
  const settings = {
    ...DEFAULT_COMPARISON_EXPORT_SETTINGS,
    showName: true,
    name: '  巡礼者  ',
    showLocation: false,
    showCapturedAt: false,
    showWork: true,
    showScene: true,
    showCoordinates: true,
  };
  const metadata = buildComparisonMetadata(settings, values);
  assert.equal(metadata.name, '巡礼者');
  assert.deepEqual(
    metadata.rows.map((row) => row.field),
    ['work', 'scene', 'coordinates'],
  );
  assert.equal(metadata.rows[1].value, values.scene);
  assert.equal(metadata.rows[2].value, values.coordinates);
  assert.equal(buildComparisonMetadata({ ...settings, showName: false }, values).name, undefined);
  assert.equal(buildComparisonMetadata({ ...settings, name: ' ' }, values).name, undefined);
});

test('a selected but empty pilgrim name produces the same metadata as an unselected name', () => {
  const values = {
    work: '作品',
    location: '地点',
    scene: 'EP1 · 01:30',
    capturedAt: '2026/10/8 12:30',
    coordinates: '35.00000, 139.00000',
  };
  for (const name of ['', '   ', '\n\t']) {
    const settings = { ...DEFAULT_COMPARISON_EXPORT_SETTINGS, showName: true, name };
    assert.deepEqual(
      buildComparisonMetadata(settings, values),
      buildComparisonMetadata({ ...settings, showName: false }, values),
    );
    const withTime = { ...settings, showCapturedAt: true };
    assert.deepEqual(
      buildComparisonMetadata(withTime, values),
      buildComparisonMetadata({ ...withTime, showName: false }, values),
    );
  }
});

test('border, mixed image ratios and metadata all fit within the export canvas', () => {
  for (const border of [0, 12, 64]) {
    for (const footerHeight of [0, 400, 1200]) {
      for (const [referenceRatio, photoRatio] of [
        [16 / 9, 3 / 4],
        [4 / 3, 4 / 3],
        [9 / 16, 16 / 9],
      ]) {
        const layout = getComparisonExportLayout(referenceRatio, photoRatio, border, footerHeight);
        assert.equal(layout.width, 2160);
        assert.equal(border + layout.contentWidth + border, layout.width);
        assert.ok(Math.abs(layout.contentWidth / referenceRatio - layout.referenceHeight) <= 0.5);
        assert.ok(Math.abs(layout.contentWidth / photoRatio - layout.photoHeight) <= 0.5);
        assert.equal(layout.photoY - (border + layout.referenceHeight), border);
        assert.equal(layout.footerY - (layout.photoY + layout.photoHeight), footerHeight ? border : 0);
        assert.equal(layout.footerY + footerHeight + border, layout.height);
      }
    }
  }
});

test('white, black and the current theme produce the correct compositor colors', () => {
  assert.equal(resolveComparisonBorderColor('theme', '#123456'), '#123456');
  assert.equal(resolveComparisonBorderColor('theme', 'invalid'), '#FB7299');
  assert.deepEqual(hexToImageColor(resolveComparisonBorderColor('white', '#123456')), { r: 1, g: 1, b: 1 });
  assert.deepEqual(hexToImageColor(resolveComparisonBorderColor('black', '#123456')), { r: 0, g: 0, b: 0 });
});

test('gallery timestamps honor EXIF offsets and omit missing or invalid dates', () => {
  assert.equal(
    readPhotoCaptureTime({ DateTimeOriginal: '2026:10:08 12:30:00', OffsetTimeOriginal: '+08:00' }),
    '2026-10-08T04:30:00.000Z',
  );
  assert.equal(
    readPhotoCaptureTime({ DateTimeOriginal: '2026:10:08 12:30:00', OffsetTimeOriginal: '-04:00' }),
    '2026-10-08T16:30:00.000Z',
  );
  const fallback = readPhotoCaptureTime({ DateTime: '2026:10:08 12:30:00' });
  assert.equal(new Date(fallback).getHours(), 12);
  for (const exif of [
    undefined,
    {},
    { DateTimeOriginal: 12 },
    { DateTimeOriginal: 'bad' },
    { DateTimeOriginal: '2026:02:30 12:30:00' },
    { DateTimeOriginal: '2026:10:08 25:00:00' },
  ]) {
    assert.equal(readPhotoCaptureTime(exif), undefined);
  }
});
