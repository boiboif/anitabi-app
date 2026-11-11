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

const distanceUrl = moduleUrl(readFileSync(new URL('../../src/utils/plan-point-distances.ts', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../../src/utils/nearby-points.ts', import.meta.url), 'utf8').replace(
  "'./plan-point-distances'",
  JSON.stringify(distanceUrl),
);
const { findNearbyPoints, formatNearbyDistance } = await import(moduleUrl(source));

const work = (id, points) => ({ id, points });
const point = (id, geo, image) => ({ id, geo, image });

test('excludes imageless points before taking the closest three and still includes distant screenshots', () => {
  const bangumis = [
    work(1, [point('far', [36, 139], 'far.jpg'), point('near-no-image', [35.001, 139])]),
    work(2, [point('same', [35, 139], 'same.jpg'), point('next', [35.002, 139], 'next.jpg')]),
  ];
  const before = structuredClone(bangumis);
  const result = findNearbyPoints(bangumis, [35, 139], null, []);
  assert.deepEqual(result.map(({ point }) => point.id), ['same', 'next', 'far']);
  assert.ok(result[1].distanceMeters > 222 && result[1].distanceMeters < 223);
  assert.deepEqual(bangumis, before);
  assert.equal(findNearbyPoints([bangumis[0]], [0, 0], null, []).length, 1, 'no distance radius is imposed');
});

test('missing or blank screenshot paths never use covers to fill the nearby list', () => {
  const missing = [point('missing', [35, 139]), point('empty', [35, 139], ''), point('blank', [35, 139], '  ')];
  const bangumi = { ...work(1, missing), cover: 'cover.jpg' };
  assert.deepEqual(findNearbyPoints([bangumi], [35, 139], null, []), []);
  const partial = { ...bangumi, points: [...missing, point('only', [35.003, 139], 'only.jpg')] };
  assert.deepEqual(findNearbyPoints([partial], [35, 139], null, []).map(({ point }) => point.id), ['only']);
});

test('uses detail filter before selected works and preserves stable order at equal distance', () => {
  const bangumis = [
    work(1, [point('first', [35, 139], 'first.jpg'), point('second', [35, 139], 'second.jpg')]),
    work(2, [point('third', [35, 139], 'third.jpg')]),
  ];
  assert.deepEqual(findNearbyPoints(bangumis, [35, 139], null, []).map(({ point }) => point.id), [
    'first', 'second', 'third',
  ]);
  assert.deepEqual(findNearbyPoints(bangumis, [35, 139], 2, [1]).map(({ point }) => point.id), ['third']);
  assert.deepEqual(findNearbyPoints(bangumis, [35, 139], null, [1]).map(({ point }) => point.id), ['first', 'second']);
});

test('excludes missing and invalid point coordinates but allows clicking the geographic origin', () => {
  const bangumis = [work(1, [
    point('placeholder', [0, 0]), point('bad', [91, 0]), point('nan', [NaN, 5]),
    point('missing', undefined), point('wrong-shape', [1, 2, 3]), point('valid', [0, 0.001]),
  ].map((entry) => ({ ...entry, image: 'screenshot.jpg' })))];
  assert.deepEqual(findNearbyPoints(bangumis, [0, 0], null, []).map(({ point }) => point.id), ['valid']);
  assert.deepEqual(findNearbyPoints(bangumis, [91, 0], null, []), []);
});

test('formats distances at the meter-to-kilometer boundary', () => {
  assert.equal(formatNearbyDistance(145.9), '145m');
  assert.equal(formatNearbyDistance(999.9), '999m');
  assert.equal(formatNearbyDistance(1000), '1.0km');
  assert.equal(formatNearbyDistance(25_860), '25.9km');
});
