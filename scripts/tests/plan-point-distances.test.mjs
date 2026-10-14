import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function asModuleUrl(source) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
}

const { sortPlanPointsByDistance } = await import(
  asModuleUrl(readFileSync(new URL('../../src/utils/plan-point-distances.ts', import.meta.url), 'utf8'))
);

function entry(id, sequenceNumber, geo, snapshotGeo) {
  return {
    id,
    sequenceNumber,
    point: geo ? { geo } : undefined,
    item: { completed: false, snapshot: { geo: snapshotGeo } },
  };
}

test('distance order is a copy, retains original numbers and includes distant points', () => {
  const entries = [entry('far', 1, [36, 139]), entry('near', 2, [35.001, 139]), entry('same', 3, [35, 139])];
  const before = structuredClone(entries);
  const sorted = sortPlanPointsByDistance(entries, { latitude: 35, longitude: 139 });
  assert.deepEqual(
    sorted.map((item) => item.id),
    ['same', 'near', 'far'],
  );
  assert.deepEqual(
    sorted.map((item) => item.sequenceNumber),
    [3, 2, 1],
  );
  assert.equal(sorted[0].distanceMeters, 0);
  assert.ok(sorted[1].distanceMeters > 110 && sorted[1].distanceMeters < 112);
  assert.ok(sorted[2].distanceMeters > 100_000);
  assert.deepEqual(entries, before);
  assert.notEqual(sorted[0], entries[2]);
});

test('live coordinates take precedence and only missing live points fall back to saved coordinates', () => {
  const entries = [
    entry('live', 1, [35.01, 139], [35, 139]),
    entry('missing-live', 2, undefined, [35, 139]),
    entry('placeholder', 3, [0, 0], [35.001, 139]),
    entry('invalid-live', 4, [91, 139], [35.002, 139]),
  ];
  const sorted = sortPlanPointsByDistance(entries, { latitude: 35, longitude: 139 });
  assert.deepEqual(
    sorted.map((item) => item.id),
    ['missing-live', 'live', 'placeholder', 'invalid-live'],
  );
  assert.equal(sorted[0].point, undefined, 'snapshot coordinates do not fabricate a live point or enable card actions');
  assert.equal(
    sorted[2].distanceMeters,
    null,
    'current placeholder coordinates must not display an obsolete snapshot distance',
  );
  assert.equal(sorted[3].distanceMeters, null);
});

test('unknown coordinates stay at the end in saved order, including malformed data and 0,0 placeholders', () => {
  const entries = [
    entry('missing', 1),
    entry('invalid', 2, [NaN, 139], [0, 0]),
    entry('known', 3, [35, 139]),
    entry('wrong-length', 4, [35, 139, 0]),
    entry('outside-world', 5, [35, 181]),
  ];
  const sorted = sortPlanPointsByDistance(entries, { latitude: 35, longitude: 139 });
  assert.deepEqual(
    sorted.map((item) => item.id),
    ['known', 'missing', 'invalid', 'wrong-length', 'outside-world'],
  );
  assert.ok(sorted.slice(1).every((item) => item.distanceMeters === null));
});

test('equal distances remain stable across different works and missing user location keeps saved order', () => {
  const entries = [entry('work2:same', 7, [35, 139]), entry('work1:same', 9, [35, 139])];
  assert.deepEqual(
    sortPlanPointsByDistance(entries, { latitude: 35, longitude: 139 }).map((item) => item.id),
    ['work2:same', 'work1:same'],
  );
  for (const location of [null, { latitude: 91, longitude: 139 }, { latitude: 35, longitude: NaN }]) {
    const sorted = sortPlanPointsByDistance(entries, location);
    assert.deepEqual(
      sorted.map((item) => item.id),
      entries.map((item) => item.id),
    );
    assert.ok(sorted.every((item) => item.distanceMeters === null));
  }
});

test('distance display composes with incomplete filtering and preserves original sequence numbers', () => {
  const entries = [entry('completed', 1, [35, 139]), entry('far', 2, [36, 139]), entry('near', 3, [35.001, 139])];
  entries[0].item.completed = true;
  const filtered = entries.filter((item) => !item.item.completed);
  const sorted = sortPlanPointsByDistance(filtered, { latitude: 35, longitude: 139 });
  assert.deepEqual(
    sorted.map((item) => item.id),
    ['near', 'far'],
  );
  assert.deepEqual(
    sorted.map((item) => item.sequenceNumber),
    [3, 2],
  );
  assert.deepEqual(
    entries.map((item) => item.id),
    ['completed', 'far', 'near'],
  );
});

test('spherical distance handles the date line and valid equator or prime-meridian coordinates', () => {
  const sorted = sortPlanPointsByDistance(
    [entry('far', 1, [0, 179]), entry('date-line', 2, [0, -179.999]), entry('prime-meridian', 3, [1, 0])],
    { latitude: 0, longitude: 179.999 },
  );
  assert.equal(sorted[0].id, 'date-line');
  assert.ok(sorted[0].distanceMeters > 220 && sorted[0].distanceMeters < 225);
  assert.ok(sorted.every((item) => Number.isFinite(item.distanceMeters)));
});
