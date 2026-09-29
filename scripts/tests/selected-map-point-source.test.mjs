import assert from 'node:assert/strict';
import test from 'node:test';
import { getSelectedMapPointSource } from '../../src/utils/selected-map-point-source.ts';

const bangumi = {
  id: 10,
  color: '#123456',
  // Selection must never scan or serialize the work's full marker dataset.
  get points() {
    throw new Error('Selection accessed the ordinary marker dataset');
  },
};
const point = { id: 'first', geo: [35, 139] };

test('startup and deselection provide an empty source without a filter', () => {
  assert.deepEqual(getSelectedMapPointSource(null), { type: 'FeatureCollection', features: [] });
  assert.deepEqual(getSelectedMapPointSource(), { type: 'FeatureCollection', features: [] });
});

test('selection submits one point without reading the ordinary marker dataset', () => {
  const source = getSelectedMapPointSource({ point, bangumi });
  assert.deepEqual(source.features, [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [139, 35] },
      properties: { id: 'first', bangumiId: 10, color: '#123456' },
    },
  ]);
  assert.ok(JSON.stringify(source).length < 250);
});

test('repeated selection replaces the single feature and never retains previous points', () => {
  for (let index = 0; index < 1000; index++) {
    const selectedPoint = { id: String(index), geo: [35 + index / 10000, 139] };
    const source = getSelectedMapPointSource({ point: selectedPoint, bangumi });
    assert.equal(source.features.length, 1);
    assert.equal(source.features[0].properties.id, String(index));
  }
  assert.equal(getSelectedMapPointSource(null).features.length, 0);
});

test('invalid coordinates are excluded while legitimate equator and meridian points remain valid', () => {
  for (const geo of [
    [0, 0],
    [NaN, 139],
    [35, Infinity],
  ]) {
    assert.equal(getSelectedMapPointSource({ point: { ...point, geo }, bangumi }).features.length, 0);
  }
  for (const geo of [
    [0, 139],
    [35, 0],
  ]) {
    assert.equal(getSelectedMapPointSource({ point: { ...point, geo }, bangumi }).features.length, 1);
  }
});
