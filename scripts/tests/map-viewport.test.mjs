import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapViewportContainsPoint } from '../../src/utils/map-viewport.ts';

const latitudeFromMercator = (y) => (Math.atan(Math.exp((y * Math.PI) / 180)) * 360) / Math.PI - 90;
const coordinate = (x, y) => [x, latitudeFromMercator(y)];
const point = (x, y) => [latitudeFromMercator(y), x];

test('a rotated viewport excludes off-screen points inside its geographic bounding box', () => {
  const footprint = [
    [139, 44],
    [140, 43],
    [139, 42],
    [138, 43],
  ].map(([x, y]) => coordinate(x, y));
  const bounds = { sw: coordinate(138, 42), ne: coordinate(140, 44) };
  const contains = createMapViewportContainsPoint(bounds, footprint);

  assert.equal(createMapViewportContainsPoint(bounds)(point(139.8, 43.8)), true, 'old rectangle counted this corner');
  assert.equal(contains(point(139.8, 43.8)), false);
  assert.equal(contains(point(139, 43)), true);
  assert.equal(contains(point(139.5, 43.5)), true, 'include the screen edge');
  assert.equal(contains(point(139, 44)), true, 'include screen corners');
  assert.equal(contains(point(141, 43)), false);
});

test('both corner winding orders produce the same counts', () => {
  const footprint = [
    [139, 44],
    [140, 43],
    [139, 42],
    [138, 43],
  ].map(([x, y]) => coordinate(x, y));
  for (const corners of [footprint, [...footprint].reverse()]) {
    const contains = createMapViewportContainsPoint(null, corners);
    const planPoints = [point(139, 43), point(139.2, 43.2), point(139.8, 43.8), point(138.2, 42.2)];
    assert.equal(planPoints.filter(contains).length, 2);
  }
});

test('tilted screen edges are tested in Mercator rather than raw latitude', () => {
  const footprint = [
    [0, 100],
    [10, 100],
    [20, 0],
    [-10, 0],
  ].map(([x, y]) => coordinate(x, y));
  const contains = createMapViewportContainsPoint(null, footprint);
  assert.equal(contains(point(-4, 50)), true);
  assert.equal(contains(point(-6, 50)), false);
  assert.equal(contains(point(15, 50)), true);
});

test('a tilted viewport remains correct when native bounds differ slightly from its screen corners', () => {
  const footprint = [
    [138.98, 43.03],
    [139.02, 43.03],
    [139.01, 42.98],
    [138.99, 42.98],
  ].map(([x, y]) => coordinate(x, y));
  for (const west of [138.98 + 1e-11, 138.985]) {
    const contains = createMapViewportContainsPoint(
      { sw: coordinate(west, 42.98), ne: coordinate(139.02, 43.03) },
      footprint,
    );
    assert.equal(contains(point(139, 43)), true, 'the middle of the screen stays visible');
    assert.equal(contains(point(138.981, 42.981)), false, 'the lower-left bounding-box corner is off-screen');
    assert.equal(contains(point(138.99, 43.02)), true, 'visible points on the wider top edge remain counted');
  }
});

test('crossing the antimeridian does not exclude visible points or include the other side of the world', () => {
  const footprint = [
    [179, 44],
    [-179, 44],
    [-179, 42],
    [179, 42],
  ].map(([x, y]) => coordinate(x, y));
  const contains = createMapViewportContainsPoint(null, footprint);
  assert.equal(contains(point(179.5, 43)), true);
  assert.equal(contains(point(-179.5, 43)), true);
  assert.equal(contains(point(180.5, 43)), true);
  assert.equal(contains(point(0, 43)), false);
});

test('ordinary bounds and missing initial bounds retain their behavior', () => {
  const contains = createMapViewportContainsPoint({ sw: [138, 34], ne: [140, 36] });
  assert.equal(contains([35, 139]), true);
  assert.equal(contains([35, 141]), false);
  assert.equal(contains([37, 139]), false);
  assert.equal(createMapViewportContainsPoint(null)([35, 139]), false);
  const wrapped = createMapViewportContainsPoint({ sw: [179, 34], ne: [-179, 36] });
  assert.equal(wrapped([35, -179.5]), true);
  assert.equal(wrapped([35, 0]), false);
});

test('a viewport wider than half the world uses the camera longitude interval', () => {
  const footprint = [
    [-100, 44],
    [100, 44],
    [100, 42],
    [-100, 42],
  ].map(([x, y]) => coordinate(x, y));
  const contains = createMapViewportContainsPoint({ sw: coordinate(-100, 42), ne: coordinate(100, 44) }, footprint);
  assert.equal(contains(point(0, 43)), true);
  assert.equal(contains(point(120, 43)), false);
});

test('degenerate native corners cannot make every point visible', () => {
  const contains = createMapViewportContainsPoint(null, [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ]);
  assert.equal(contains([35, 139]), false);
});

test('non-finite point coordinates are not visible', () => {
  const footprint = [
    [139, 44],
    [140, 43],
    [139, 42],
    [138, 43],
  ].map(([x, y]) => coordinate(x, y));
  const contains = createMapViewportContainsPoint(null, footprint);
  assert.equal(contains([NaN, 139]), false);
  assert.equal(contains([35, NaN]), false);
  assert.equal(contains([Infinity, 139]), false);
});
