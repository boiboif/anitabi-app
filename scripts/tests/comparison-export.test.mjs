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

test('existing settings keep original ratios, vertical ordering and both border placements', () => {
  const settings = normalizeComparisonExportSettings({ borderWidth: 12, showScene: false });
  assert.equal(settings.matchPhotoRatio, false);
  assert.equal(settings.referenceFit, 'cover');
  assert.equal(settings.layout, 'vertical');
  assert.equal(settings.showOuterBorder, true);
  assert.equal(settings.showInnerBorder, true);
  assert.equal(settings.showScene, false);
});

test('new export choices survive persistence and invalid choices fall back to defaults', () => {
  const settings = normalizeComparisonExportSettings({
    layout: 'horizontal',
    matchPhotoRatio: true,
    referenceFit: 'contain',
    showOuterBorder: false,
    showInnerBorder: false,
  });
  assert.equal(settings.layout, 'horizontal');
  assert.equal(settings.matchPhotoRatio, true);
  assert.equal(settings.referenceFit, 'contain');
  assert.equal(settings.showOuterBorder, false);
  assert.equal(settings.showInnerBorder, false);
  assert.deepEqual(normalizeComparisonExportSettings(JSON.parse(JSON.stringify(settings))), settings);
  assert.deepEqual(
    normalizeComparisonExportSettings({
      layout: 'diagonal',
      matchPhotoRatio: 'true',
      referenceFit: 'stretch',
      showOuterBorder: 'false',
      showInnerBorder: 0,
    }),
    DEFAULT_COMPARISON_EXPORT_SETTINGS,
  );
});

test('default layout preserves existing image ratios, borders and metadata spacing', () => {
  for (const border of [0, 12, 64]) {
    for (const footerHeight of [0, 400, 1200]) {
      for (const [referenceRatio, photoRatio] of [
        [16 / 9, 3 / 4],
        [4 / 3, 4 / 3],
        [9 / 16, 16 / 9],
      ]) {
        const layout = getComparisonExportLayout(
          referenceRatio,
          photoRatio,
          { ...DEFAULT_COMPARISON_EXPORT_SETTINGS, borderWidth: border },
          footerHeight,
        );
        assert.equal(layout.width, 2160);
        assert.equal(border + layout.contentWidth + border, layout.width);
        assert.ok(Math.abs(layout.contentWidth / referenceRatio - layout.reference.height) <= 0.5);
        assert.ok(Math.abs(layout.contentWidth / photoRatio - layout.photo.height) <= 0.5);
        assert.equal(layout.photo.y - (border + layout.reference.height), border);
        assert.equal(layout.footerY - (layout.photo.y + layout.photo.height), footerHeight ? border : 0);
        assert.equal(layout.footerY + footerHeight + border, layout.height);
      }
    }
  }
});

test('both layouts honor independent borders, matched ratios and footer bounds', () => {
  for (const direction of ['vertical', 'horizontal']) {
    for (const showOuterBorder of [false, true]) {
      for (const showInnerBorder of [false, true]) {
        for (const matchPhotoRatio of [false, true]) {
          for (const borderWidth of [0, 12, 32]) {
            for (const footerHeight of [0, 400]) {
              for (const [referenceRatio, photoRatio] of [
                [16 / 9, 3 / 4],
                [9 / 16, 16 / 9],
                [1, 1],
              ]) {
                const settings = {
                  ...DEFAULT_COMPARISON_EXPORT_SETTINGS,
                  layout: direction,
                  showOuterBorder,
                  showInnerBorder,
                  matchPhotoRatio,
                  borderWidth,
                };
                const layout = getComparisonExportLayout(referenceRatio, photoRatio, settings, footerHeight);
                const outer = showOuterBorder ? borderWidth : 0;
                const gap = showInnerBorder ? borderWidth : 0;
                assert.equal(layout.width, 2160);
                assert.equal(layout.contentWidth, 2160 - 2 * outer);
                assert.equal(layout.reference.x, outer);
                assert.equal(layout.reference.y, outer);
                assert.equal(layout.footerY + footerHeight + outer, layout.height);
                assert.equal(layout.footerY, outer + layout.imagesHeight + (footerHeight ? outer : 0));
                for (const panel of [layout.reference, layout.photo]) {
                  assert.ok(panel.width > 0 && panel.height > 0);
                  assert.ok(panel.x + panel.width <= layout.width - outer);
                  assert.ok(panel.y + panel.height <= layout.footerY);
                }
                if (direction === 'horizontal') {
                  assert.equal(layout.reference.height, layout.photo.height);
                  assert.equal(layout.photo.y, outer);
                  assert.equal(layout.photo.x - layout.reference.x - layout.reference.width, gap);
                  assert.equal(layout.photo.x + layout.photo.width + outer, layout.width);
                  const ratio = matchPhotoRatio ? photoRatio : referenceRatio;
                  assert.ok(Math.abs(layout.reference.width - layout.reference.height * ratio) <= 2);
                  assert.ok(Math.abs(layout.photo.width - layout.photo.height * photoRatio) <= 2);
                  if (matchPhotoRatio) assert.ok(Math.abs(layout.reference.width - layout.photo.width) <= 1);
                } else {
                  assert.equal(layout.photo.x, outer);
                  assert.equal(layout.photo.y - layout.reference.y - layout.reference.height, gap);
                  if (matchPhotoRatio) assert.equal(layout.reference.height, layout.photo.height);
                }
              }
            }
          }
        }
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
