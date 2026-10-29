import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPilgrimageDateKey,
  getPilgrimageLatestTime,
  isPilgrimageDateKey,
  isPilgrimagePhotoFileName,
  mergePilgrimageRecords,
  upsertPilgrimageDay,
  validatePilgrimageRecords,
} from '../../src/lib/pilgrimage-records.ts';

const point = (id = 'a') => ({
  key: `1:${id}`,
  bangumiId: 1,
  pointId: id,
  snapshot: { bangumiName: '作品', pointName: '地点', geo: [35, 139] },
});
const photo = (id) => ({ id, fileName: `${id}.jpg`, width: 800, height: 600 });
const morning = new Date(2026, 9, 22, 8, 0).getTime();
const evening = new Date(2026, 9, 22, 20, 0).getTime();
const tomorrow = new Date(2026, 9, 23, 9, 0).getTime();

test('uses local calendar dates and rejects invalid days and unsafe file paths', () => {
  assert.equal(getPilgrimageDateKey(morning), '2026-10-22');
  assert.equal(isPilgrimageDateKey('2024-02-29'), true);
  for (const value of ['2026-02-29', '2026-13-01', '2026-2-01', '../2026-01-01']) {
    assert.equal(isPilgrimageDateKey(value), false);
  }
  for (const value of ['../a.jpg', 'a/b.jpg', 'a\\b.png', '%2e%2e.png', 'a.jpg?x=1', 'file:///a.jpg', 'a.exe']) {
    assert.equal(isPilgrimagePhotoFileName(value), false);
  }
  assert.equal(isPilgrimagePhotoFileName('photo-abc_123.png'), true);
  assert.throws(() => getPilgrimageDateKey(NaN));
});

test('repeated checks reuse an empty day while exports append distinct photos and preserve first time', () => {
  const first = upsertPilgrimageDay([], point(), morning);
  assert.equal(first[0].days[0].photos.length, 0);
  assert.equal(upsertPilgrimageDay(first, point(), evening), first);
  const withPhoto = upsertPilgrimageDay(first, point(), evening, photo('one'));
  const twice = upsertPilgrimageDay(withPhoto, point(), evening, photo('two'));
  assert.equal(twice[0].days.length, 1);
  assert.equal(twice[0].days[0].firstRecordedAt, morning);
  assert.equal(twice[0].days[0].lastRecordedAt, evening);
  assert.deepEqual(
    twice[0].days[0].photos.map((entry) => entry.id),
    ['one', 'two'],
  );
  const nextDay = upsertPilgrimageDay(twice, point(), tomorrow, photo('three'));
  assert.deepEqual(
    nextDay[0].days.map((day) => day.dateKey),
    ['2026-10-23', '2026-10-22'],
  );
  assert.deepEqual(first[0].days[0].photos, [], 'updates do not mutate existing state');
});

test('records sort by latest visit time and never acquire plan or completion state', () => {
  const first = upsertPilgrimageDay([], { ...point(), completed: true, planId: 'plan-a' }, morning);
  const newer = upsertPilgrimageDay(first, point('b'), tomorrow);
  assert.deepEqual(
    newer.map((entry) => entry.key),
    ['1:b', '1:a'],
  );
  assert.equal('completed' in newer[1], false);
  assert.equal('planId' in newer[1], false);
  assert.equal('visited' in newer[1], false);
});

test('a new same-day photo moves its point ahead of a later visit without changing the first visit', () => {
  const noon = morning + 4 * 60 * 60 * 1000;
  const first = upsertPilgrimageDay([], point(), morning);
  const visited = upsertPilgrimageDay(first, point('b'), noon);
  assert.deepEqual(
    visited.map((entry) => entry.key),
    ['1:b', '1:a'],
  );

  const photographed = upsertPilgrimageDay(visited, point(), evening, photo('new-photo'));
  assert.deepEqual(
    photographed.map((entry) => entry.key),
    ['1:a', '1:b'],
  );
  assert.equal(photographed[0].days[0].firstRecordedAt, morning);
  assert.equal(getPilgrimageLatestTime(photographed[0]), evening);
  assert.equal(upsertPilgrimageDay(photographed, point('b'), evening + 60000), photographed);
  assert.equal(visited[1].days[0].lastRecordedAt, morning, 'the prior state stays unchanged');

  const clockMovedBack = upsertPilgrimageDay(photographed, point(), noon, photo('earlier-clock'));
  assert.equal(getPilgrimageLatestTime(clockMovedBack[0]), evening);
});

test('merge is idempotent, combines same-day photos and keeps original first time', () => {
  const local = upsertPilgrimageDay([], point(), morning, photo('one'));
  const incoming = upsertPilgrimageDay([], point(), evening, photo('two'));
  const combined = mergePilgrimageRecords(local, incoming);
  assert.equal(combined[0].days[0].firstRecordedAt, morning);
  assert.equal(combined[0].days[0].lastRecordedAt, evening);
  assert.deepEqual(
    combined[0].days[0].photos.map((entry) => entry.id),
    ['one', 'two'],
  );
  assert.deepEqual(mergePilgrimageRecords(combined, incoming), combined);
  assert.equal(mergePilgrimageRecords(combined, upsertPilgrimageDay([], point(), tomorrow))[0].days.length, 2);
});

test('merging legacy records keeps latest times unknown until a new event is recorded', () => {
  const legacy = [{ ...point(), days: [{ dateKey: '2026-10-22', firstRecordedAt: morning, photos: [] }] }];
  assert.deepEqual(validatePilgrimageRecords(legacy), legacy);
  assert.deepEqual(mergePilgrimageRecords(legacy, legacy), legacy);
  assert.equal(getPilgrimageLatestTime(legacy[0]), morning);
  const later = [{ ...point(), days: [{ dateKey: '2026-10-22', firstRecordedAt: evening, photos: [] }] }];
  const merged = mergePilgrimageRecords(legacy, later);
  assert.equal(merged[0].days[0].firstRecordedAt, morning);
  assert.equal(Object.hasOwn(merged[0].days[0], 'lastRecordedAt'), false);
  assert.equal(getPilgrimageLatestTime(merged[0]), morning);
  assert.deepEqual(mergePilgrimageRecords(merged, later), merged);
  const photographed = upsertPilgrimageDay(merged, point(), evening, photo('new-photo'));
  assert.equal(photographed[0].days[0].lastRecordedAt, evening);
});

test('latest event times are copied and invalid times cannot enter the model', () => {
  const records = upsertPilgrimageDay([], point(), morning);
  const original = structuredClone(records);
  const copied = validatePilgrimageRecords(records);
  copied[0].days[0].lastRecordedAt = evening;
  assert.deepEqual(records, original);
  for (const lastRecordedAt of [-1, NaN, Infinity, 0.5, morning - 1, 'later']) {
    const invalid = structuredClone(records);
    invalid[0].days[0].lastRecordedAt = lastRecordedAt;
    assert.throws(() => validatePilgrimageRecords(invalid));
  }
});

test('rejects duplicate identity, shared image references, invalid dimensions and malformed point keys', () => {
  const records = upsertPilgrimageDay([], point(), morning, photo('one'));
  assert.throws(() => validatePilgrimageRecords([...records, ...records]));
  assert.throws(() => validatePilgrimageRecords([{ ...records[0], key: '2:a' }]));
  assert.throws(() => upsertPilgrimageDay([], point(), morning, { ...photo('one'), width: 0 }));
  const other = upsertPilgrimageDay([], point('b'), tomorrow, photo('one'));
  assert.throws(() => mergePilgrimageRecords(records, other));
  const sharedFile = upsertPilgrimageDay([], point('b'), tomorrow, { ...photo('two'), fileName: 'one.jpg' });
  assert.throws(() => mergePilgrimageRecords(records, sharedFile));
});
