import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function moduleUrl(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
}

const readSource = (path) => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
const constantsUrl = moduleUrl(readSource('lib/constants.ts'));
const source = readSource('utils/map-viewport-points.ts')
  .replace("'@/lib/constants'", JSON.stringify(constantsUrl))
  .replace("'./map-viewport'", JSON.stringify(moduleUrl(readSource('utils/map-viewport.ts'))))
  .replace("'./plan-point-distances'", JSON.stringify(moduleUrl(readSource('utils/plan-point-distances.ts'))));
const { findViewportImagePoints } = await import(moduleUrl(source));
const { MAP_ICON_ZOOM_THRESHOLD } = await import(constantsUrl);

const work = (id, points) => ({ id, points });
const point = (id, geo, image = `${id}.jpg`) => ({ id, geo, image, priority: 0 });
const viewport = {
  zoom: MAP_ICON_ZOOM_THRESHOLD,
  center: [139, 35],
  bounds: { sw: [138, 34], ne: [140, 36] },
};
const ids = (result) => result.map(({ point }) => point.id);

test('returns every visible image ordered by center distance without modifying map data', () => {
  const points = Array.from({ length: 12 }, (_, index) => point(`point-${index}`, [35 + index / 100, 139])).reverse();
  const bangumis = [work(1, [...points, point('outside', [37, 139])])];
  const before = structuredClone(bangumis);
  const result = findViewportImagePoints(bangumis, viewport, null, []);

  assert.deepEqual(ids(result), Array.from({ length: 12 }, (_, index) => `point-${index}`));
  assert.equal(result[0].distanceMeters, 0);
  assert.ok(result[1].distanceMeters > 1111 && result[1].distanceMeters < 1113);
  assert.equal(result[0].point, points.at(-1), 'selection retains the original point object');
  assert.equal(result[0].bangumi, bangumis[0]);
  assert.deepEqual(bangumis, before);
});

test('requires a settled viewport and the top-icon zoom threshold', () => {
  const bangumis = [work(1, [point('visible', [35, 139])])];
  for (const update of [
    { center: undefined },
    { bounds: null },
    { zoom: MAP_ICON_ZOOM_THRESHOLD - 0.001 },
    { zoom: NaN },
    { zoom: Infinity },
    { center: [139, NaN] },
    { center: [139, 91] },
    { center: [Infinity, 35] },
  ]) {
    assert.deepEqual(findViewportImagePoints(bangumis, { ...viewport, ...update }, null, []), []);
  }
  assert.deepEqual(ids(findViewportImagePoints(bangumis, viewport, null, [])), ['visible']);
});

test('the active map work filter takes precedence over multi-work selection', () => {
  const bangumis = [work(1, [point('one', [35, 139])]), work(2, [point('two', [35, 139])])];
  assert.deepEqual(ids(findViewportImagePoints(bangumis, viewport, null, [2])), ['two']);
  assert.deepEqual(ids(findViewportImagePoints(bangumis, viewport, 1, [2])), ['one']);
  assert.deepEqual(ids(findViewportImagePoints(bangumis, viewport, 3, [2])), []);
  assert.deepEqual(ids(findViewportImagePoints(bangumis, viewport, null, [1, 2])), ['one', 'two']);
});

test('excludes imageless, malformed and placeholder coordinates while allowing points on either axis', () => {
  const bangumis = [work(1, [
    point('no-image', [0, 0.001], ''),
    { id: 'missing-image', geo: [0, 0.001] },
    point('placeholder', [0, 0]),
    point('missing', undefined),
    point('wrong-shape', [0, 0.001, 1]),
    point('nan', [NaN, 0.001]),
    point('infinity', [0, Infinity]),
    point('invalid-lat', [91, 0]),
    point('invalid-lon', [0, 181]),
    point('on-equator', [0, 0.001]),
    point('on-meridian', [0.001, 0]),
  ])];
  const equatorialViewport = { ...viewport, center: [0, 0], bounds: { sw: [-1, -1], ne: [1, 1] } };
  assert.deepEqual(ids(findViewportImagePoints(bangumis, equatorialViewport, null, [])), ['on-equator', 'on-meridian']);
});

test('equal-distance ordering is stable across input reorderings and shared point ids', () => {
  const first = work(2, [point('b', [35, 139]), point('a', [35, 139])]);
  const second = work(1, [point('a', [35, 139])]);
  const keys = (result) => result.map(({ point, bangumi }) => `${bangumi.id}:${point.id}`);
  const expected = ['1:a', '2:a', '2:b'];
  assert.deepEqual(keys(findViewportImagePoints([first, second], viewport, null, [])), expected);
  assert.deepEqual(keys(findViewportImagePoints([second, { ...first, points: [...first.points].reverse() }], viewport, null, [])), expected);
});

const latitudeFromMercator = (y) => (Math.atan(Math.exp((y * Math.PI) / 180)) * 360) / Math.PI - 90;
const coordinate = (x, y) => [x, latitudeFromMercator(y)];
const pointGeo = (x, y) => [latitudeFromMercator(y), x];

test('a rotated footprint excludes off-screen bounding-box corners and includes screen edges', () => {
  const rotatedViewport = {
    ...viewport,
    center: coordinate(139, 43),
    bounds: { sw: coordinate(138, 42), ne: coordinate(140, 44) },
    footprint: [[139, 44], [140, 43], [139, 42], [138, 43]].map(([x, y]) => coordinate(x, y)),
  };
  const bangumis = [work(1, [
    point('off-screen', pointGeo(139.8, 43.8)),
    point('middle', pointGeo(139, 43)),
    point('edge', pointGeo(139.5, 43.5)),
  ])];
  assert.deepEqual(ids(findViewportImagePoints(bangumis, rotatedViewport, null, [])), ['middle', 'edge']);
});

test('crossing the date line selects and ranks both sides of the visible region', () => {
  const wrappedViewport = {
    ...viewport,
    center: [179.9, 35],
    bounds: { sw: [179, 34], ne: [-179, 36] },
  };
  const bangumis = [work(1, [
    point('farther-west', [35, 179.2]),
    point('nearby-east', [35, -179.9]),
    point('other-side-of-world', [35, 0]),
    point('off-screen', [35, -178]),
  ])];
  for (const footprint of [undefined, [[179, 36], [-179, 36], [-179, 34], [179, 34]]]) {
    const result = findViewportImagePoints(bangumis, { ...wrappedViewport, footprint }, null, []);
    assert.deepEqual(ids(result), ['nearby-east', 'farther-west']);
    assert.ok(result[0].distanceMeters > 18_000 && result[0].distanceMeters < 19_000);
  }
});

test('world-copy camera longitudes retain the same visible points and distance order', () => {
  const wrappedViewport = { ...viewport, center: [-179, 35], bounds: { sw: [170, 34], ne: [-170, 36] } };
  const bangumis = [work(1, [
    point('farther', [35, 179]),
    point('nearby', [35, -179.2]),
    point('center', [35, -179]),
  ])];
  const expected = findViewportImagePoints(bangumis, wrappedViewport, null, []);
  assert.deepEqual(ids(expected), ['center', 'nearby', 'farther']);
  for (const longitude of [181, -539, 541]) {
    const worldCopyViewport = { ...wrappedViewport, center: [longitude, 35] };
    const before = structuredClone(worldCopyViewport);
    assert.deepEqual(findViewportImagePoints(bangumis, worldCopyViewport, null, []), expected);
    assert.deepEqual(worldCopyViewport, before);
  }
});
