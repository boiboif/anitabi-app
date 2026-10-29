import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/lib/pilgrimage-records')
      return { url: new URL('../../src/lib/pilgrimage-records.ts', import.meta.url).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { filterPilgrimageDays, isPilgrimageDateInputValid, isPilgrimageDateRangeValid, queryPilgrimagePoints } =
  await import('../../src/lib/pilgrimage-record-query.ts');
hooks.deregister();

const range = (startDate = '', endDate = '') => ({ startDate, endDate });
const day = (dateKey, firstRecordedAt, photos = []) => ({ dateKey, firstRecordedAt, photos });
const point = (key, bangumiId, days) => ({ key, bangumiId, days, snapshot: { pointName: key, bangumiName: 'Work' } });

test('date inputs allow open boundaries and reject malformed, impossible and reversed dates', () => {
  for (const value of ['', '2024-02-29', '2026-10-22', '2000-02-29']) {
    assert.equal(isPilgrimageDateInputValid(value), true, value);
  }
  for (const value of [
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-00-01',
    '2026-13-01',
    '2026-01-00',
    '2026-1-1',
    '0000-01-01',
  ]) {
    assert.equal(isPilgrimageDateInputValid(value), false, value);
  }
  assert.equal(isPilgrimageDateRangeValid(range('', '2026-10-22')), true);
  assert.equal(isPilgrimageDateRangeValid(range('2026-10-22')), true);
  assert.equal(isPilgrimageDateRangeValid(range('2026-10-22', '2026-10-22')), true);
  assert.equal(isPilgrimageDateRangeValid(range('2026-10-23', '2026-10-22')), false);
});

test('date filtering includes both boundary days, preserves empty-photo visits and does not mutate history', () => {
  const days = [day('2026-10-01', 1), day('2026-10-03', 3), day('2026-10-02', 2)];
  const original = structuredClone(days);
  assert.deepEqual(filterPilgrimageDays(days, range('2026-10-01', '2026-10-02')), [days[2], days[0]]);
  assert.deepEqual(filterPilgrimageDays(days, range('', '2026-10-01')), [days[0]]);
  assert.deepEqual(filterPilgrimageDays(days, range('2026-10-03')), [days[1]]);
  assert.deepEqual(days, original);
});

test('combined filters use matching-day timestamps for ordering, counts, and thumbnail data', () => {
  const firstPhoto = { id: 'a', fileName: 'a.jpg', width: 100, height: 100 };
  const points = [
    point('1:a', 1, [day('2026-09-01', 10, [firstPhoto]), day('2026-10-22', 100)]),
    point('1:b', 1, [day('2026-09-02', 20)]),
    point('2:c', 2, [day('2026-09-02', 30)]),
    point('1:empty', 1, []),
  ];
  const original = structuredClone(points);
  const results = queryPilgrimagePoints(points, range('2026-09-01', '2026-09-30'), ['1']);
  assert.deepEqual(
    results.map((entry) => entry.key),
    ['1:b', '1:a'],
  );
  assert.deepEqual(results[1].days, [points[0].days[0]]);
  assert.deepEqual(
    results[1].days.flatMap((entry) => entry.photos),
    [firstPhoto],
  );
  assert.deepEqual(
    queryPilgrimagePoints(points, range(), ['1']).map((entry) => entry.key),
    ['1:a', '1:b'],
  );
  assert.deepEqual(queryPilgrimagePoints(points, range('2027-01-01')), []);
  assert.deepEqual(points, original);
});

test('multiple bangumi IDs match either work and still require a day in the selected range', () => {
  const points = [
    point('1:a', 1, [day('2026-09-01', 10), day('2026-10-22', 100)]),
    point('2:b', 2, [day('2026-09-02', 20)]),
    point('2:c', 2, [day('2026-08-31', 30)]),
    point('3:d', 3, [day('2026-09-02', 40)]),
    point('1:empty', 1, []),
  ];
  const selectedIds = ['2', '1', '2'];
  const originalPoints = structuredClone(points);
  const originalIds = [...selectedIds];
  const results = queryPilgrimagePoints(points, range('2026-09-01', '2026-09-02'), selectedIds);

  assert.deepEqual(
    results.map((entry) => entry.key),
    ['2:b', '1:a'],
  );
  assert.deepEqual(results[1].days, [points[0].days[0]]);
  assert.deepEqual(points, originalPoints);
  assert.deepEqual(selectedIds, originalIds);
});

test('empty bangumi selection shows all works while unknown IDs match no points', () => {
  const points = [
    point('2:b', 2, [day('2026-10-22', 20)]),
    point('1:a', 1, [day('2026-10-22', 20)]),
    point('3:empty', 3, []),
  ];
  const expectedKeys = ['1:a', '2:b'];

  for (const results of [queryPilgrimagePoints(points, range()), queryPilgrimagePoints(points, range(), [])]) {
    assert.deepEqual(
      results.map((entry) => entry.key),
      expectedKeys,
    );
  }
  assert.deepEqual(queryPilgrimagePoints(points, range(), ['missing']), []);
});

test('stored local date decides matches even when its timestamp belongs to a different UTC date', () => {
  const visit = day('2026-10-22', Date.parse('2026-10-21T16:01:00Z'));
  assert.deepEqual(filterPilgrimageDays([visit], range('2026-10-22', '2026-10-22')), [visit]);
  assert.deepEqual(filterPilgrimageDays([visit], range('2026-10-21', '2026-10-21')), []);
});

test('latest photo activity sorts points descending using only days inside the filter', () => {
  const points = [
    point('1:a', 1, [
      { ...day('2026-10-22', 10), lastRecordedAt: 30 },
      { ...day('2026-10-23', 40), lastRecordedAt: 100 },
    ]),
    point('1:b', 1, [{ ...day('2026-10-22', 20), lastRecordedAt: 25 }]),
    point('1:c', 1, [day('2026-10-22', 35)]),
  ];
  const original = structuredClone(points);
  assert.deepEqual(
    queryPilgrimagePoints(points, range()).map((entry) => entry.key),
    ['1:a', '1:c', '1:b'],
  );
  assert.deepEqual(
    queryPilgrimagePoints(points, range('2026-10-22', '2026-10-22')).map((entry) => entry.key),
    ['1:c', '1:a', '1:b'],
  );
  assert.deepEqual(points, original);
});
