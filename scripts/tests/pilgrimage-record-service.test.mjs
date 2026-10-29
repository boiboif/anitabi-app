import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, beforeEach, test } from 'node:test';

const harness = {
  values: new Map(),
  files: new Map(),
  state: { points: [] },
  mutations: [],
  publications: [],
  deleteAttempts: [],
  failWrite: false,
  failRollback: false,
  failRemove: false,
  failDelete: false,
  failCopy: false,
  copyGate: null,
  createMMKV() {
    return {
      getAllKeys: () => [...this.values.keys()],
      getString: (key) => this.values.get(key),
      contains: (key) => this.values.has(key),
      set: (key, value) => {
        this.values.set(key, value);
        this.mutations.push(key);
        if (this.failWrite || this.failRollback) {
          this.failWrite = false;
          throw new Error('disk failed after writing');
        }
      },
      remove: (key) => {
        this.values.delete(key);
        if (this.failRemove) {
          this.failRemove = false;
          throw new Error('delete failed after mutation');
        }
      },
    };
  },
};
function storedPointCount() {
  return [...harness.values.keys()].filter((key) => key.startsWith('point-v2:')).length;
}

globalThis.__pilgrimageHarness = harness;

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-file-system') return { url: 'records-test:files', shortCircuit: true };
    if (specifier === 'react-native-mmkv') return { url: 'records-test:mmkv', shortCircuit: true };
    if (specifier === '@/store/use-pilgrimage-records') return { url: 'records-test:store', shortCircuit: true };
    if (specifier.startsWith('@/'))
      return { url: new URL(`../../src/${specifier.slice(2)}.ts`, import.meta.url).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'records-test:mmkv')
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export const createMMKV = () => globalThis.__pilgrimageHarness.createMMKV();',
      };
    if (url === 'records-test:store')
      return {
        format: 'module',
        shortCircuit: true,
        source: `export const usePilgrimageRecords = {
        getState: () => globalThis.__pilgrimageHarness.state,
        setState: (patch) => { Object.assign(globalThis.__pilgrimageHarness.state, patch); globalThis.__pilgrimageHarness.publications.push(patch); },
      };`,
      };
    if (url === 'records-test:files')
      return {
        format: 'module',
        shortCircuit: true,
        source: `
      const harness = globalThis.__pilgrimageHarness;
      const uri = (parts) => parts.map((part) => typeof part === 'string' ? part : part.uri).join('/');
      export const Paths = { document: 'file:///documents' };
      export class Directory {
        constructor(...parts) { this.uri = uri(parts); }
        create() {}
      }
      export class File {
        constructor(...parts) { this.uri = uri(parts); }
        get exists() { return harness.files.has(this.uri); }
        get name() { return this.uri.split('/').at(-1); }
        get extension() { return this.name.slice(this.name.lastIndexOf('.')); }
        get size() { return harness.files.get(this.uri)?.length ?? 0; }
        async copy(destination) {
          if (harness.copyGate) await harness.copyGate;
          if (!this.exists) throw new Error('Missing source');
          harness.files.set(destination.uri, harness.files.get(this.uri));
          if (harness.failCopy) throw new Error('Partial copy failure');
        }
        delete() {
          harness.deleteAttempts.push({ uri: this.uri, points: harness.state.points });
          if (harness.failDelete === true || harness.failDelete === this.uri) throw new Error('image cleanup failed');
          harness.files.delete(this.uri);
        }
      }
    `,
      };
    return nextLoad(url, context);
  },
});

const {
  recordPilgrimageVisit,
  savePilgrimagePhoto,
  deletePilgrimageDay,
  deletePilgrimagePhoto,
  deletePilgrimageSelection,
  deletePilgrimagePoint,
  withPilgrimageRecordsLock,
} = await import('../../src/services/pilgrimage-records.ts');
const {
  createPilgrimageRecordsRestoreWrite,
  getPilgrimageRecords,
  getPilgrimageRecordsLoadError,
  setPilgrimageRecords,
} = await import('../../src/lib/pilgrimage-record-storage.ts');
const { getPilgrimagePhotoFile, PilgrimagePhotoCleanupError } =
  await import('../../src/lib/pilgrimage-record-files.ts');
const { queryPilgrimagePoints } = await import('../../src/lib/pilgrimage-record-query.ts');
const input = { key: '1:a', bangumiId: 1, pointId: 'a', snapshot: { bangumiName: '作品', pointName: '地点' } };
const at = new Date(2026, 9, 22, 9).getTime();
const source = 'file:///cache/export.jpg';

beforeEach(() => {
  harness.values.clear();
  harness.files.clear();
  harness.state = { points: [] };
  harness.mutations = [];
  harness.publications = [];
  harness.deleteAttempts = [];
  harness.failWrite = false;
  harness.failRollback = false;
  harness.failRemove = false;
  harness.failDelete = false;
  harness.failCopy = false;
  harness.copyGate = null;
  harness.files.set(source, new Uint8Array([1, 2, 3]));
  getPilgrimageRecords();
});
after(() => {
  hooks.deregister();
  delete globalThis.__pilgrimageHarness;
});

async function createBatchRecords() {
  await savePilgrimagePhoto(input, source, 800, 600, at);
  await savePilgrimagePhoto(input, source, 800, 600, at + 60000);
  await savePilgrimagePhoto(input, source, 800, 600, at + 86400000);
  await savePilgrimagePhoto(input, source, 800, 600, at + 86460000);
  await recordPilgrimageVisit(input, at + 172800000);
  const other = { ...input, key: '1:b', pointId: 'b' };
  await savePilgrimagePhoto(other, source, 800, 600, at);
  const point = harness.state.points.find((entry) => entry.key === input.key);
  return {
    point,
    removedDay: point.days.find((day) => day.dateKey === '2026-10-22'),
    editedDay: point.days.find((day) => day.dateKey === '2026-10-23'),
    emptyDay: point.days.find((day) => day.dateKey === '2026-10-24'),
    otherPoint: harness.state.points.find((entry) => entry.key === other.key),
  };
}

test('stores only app-owned photo copies and a same-day check shares that record', async () => {
  await recordPilgrimageVisit(input, at);
  await savePilgrimagePhoto(input, source, 800, 600, at + 60000);
  await savePilgrimagePhoto(input, source, 800, 600, at + 120000);
  const [point] = harness.state.points;
  assert.equal(point.days.length, 1);
  assert.equal(point.days[0].firstRecordedAt, at);
  assert.equal(point.days[0].photos.length, 2);
  assert.notEqual(point.days[0].photos[0].id, point.days[0].photos[1].id);
  for (const photo of point.days[0].photos) {
    assert.ok(harness.files.has(getPilgrimagePhotoFile(photo.fileName).uri));
  }
  assert.deepEqual(getPilgrimageRecords(), harness.state.points);
  assert.equal(storedPointCount(), 1, 'metadata uses a point-specific MMKV key');
});

test('failed metadata persistence rolls back raw bytes, publishes nothing and cleans new image', async () => {
  await recordPilgrimageVisit(input, at);
  const oldRaw = [...harness.values];
  const before = structuredClone(harness.state.points);
  harness.publications = [];
  harness.failWrite = true;
  await assert.rejects(savePilgrimagePhoto(input, source, 800, 600, at), /disk failed/);
  assert.deepEqual([...harness.values], oldRaw);
  assert.deepEqual(harness.state.points, before);
  assert.deepEqual(harness.publications, []);
  assert.deepEqual([...harness.files.keys()], [source]);
});

test('partial copy failure does not create metadata and cleans the partial destination', async () => {
  harness.failCopy = true;
  await assert.rejects(savePilgrimagePhoto(input, source, 800, 600, at), /Partial copy/);
  assert.deepEqual(harness.state.points, []);
  assert.equal(storedPointCount(), 0);
  assert.deepEqual([...harness.files.keys()], [source]);
});

test('uncertain metadata after a failed rollback keeps the possible referenced image and closes writes', async () => {
  await recordPilgrimageVisit(input, at);
  harness.failRollback = true;
  await assert.rejects(savePilgrimagePhoto(input, source, 800, 600, at), /write and rollback failed/);
  assert.ok(getPilgrimageRecordsLoadError());
  assert.equal(harness.files.size, 2, 'retain app image when metadata reference cannot be established safely');
  assert.equal(harness.state.loadError, 'Pilgrimage record write and rollback failed');
});

test('delete waits for in-flight append and removes committed metadata before its own files', async () => {
  let release;
  harness.copyGate = new Promise((resolve) => {
    release = resolve;
  });
  const append = savePilgrimagePhoto(input, source, 800, 600, at);
  const remove = deletePilgrimagePoint(input.key);
  release();
  await Promise.all([append, remove]);
  assert.deepEqual(harness.state.points, []);
  assert.equal(storedPointCount(), 0);
  assert.deepEqual([...harness.files.keys()], [source]);
});

test('recovery writer rolls back without publishing, and failed metadata deletion keeps photos', async () => {
  await savePilgrimagePhoto(input, source, 800, 600, at);
  const records = structuredClone(harness.state.points);
  const restore = createPilgrimageRecordsRestoreWrite([]);
  restore.write();
  assert.deepEqual(getPilgrimageRecords(), []);
  assert.deepEqual(harness.state.points, records);
  restore.rollback();
  assert.deepEqual(getPilgrimageRecords(), records);
  harness.failRemove = true;
  await assert.rejects(deletePilgrimageDay(input.key, '2026-10-22'), /delete failed/);
  assert.deepEqual(harness.state.points, records);
  assert.equal(harness.files.size, 2);
  await deletePilgrimageDay(input.key, '2026-10-22');
  assert.deepEqual(harness.state.points, []);
  assert.deepEqual([...harness.files.keys()], [source]);
});

test('ordinary writes do not validate or serialize unchanged point histories', async () => {
  await recordPilgrimageVisit(input, at);
  const unchanged = {
    ...harness.state.points[0],
    toJSON() {
      throw new Error('Untouched point must not be serialized');
    },
  };
  const added = { ...unchanged, ...input, key: '1:b', pointId: 'b', toJSON: undefined };
  setPilgrimageRecords([unchanged, added], [unchanged]);
  assert.equal(storedPointCount(), 2);
});

test('corrupt records fail closed and only an explicit successful restore clears the load error', async () => {
  await recordPilgrimageVisit(input, at);
  harness.values.set('point-v2:2%3Ab', '{bad json');
  const raw = [...harness.values];
  assert.deepEqual(getPilgrimageRecords(), []);
  assert.ok(getPilgrimageRecordsLoadError());
  harness.state.points = [];
  await assert.rejects(recordPilgrimageVisit(input, at), /Could not read/);
  assert.deepEqual([...harness.values], raw);
  const replace = createPilgrimageRecordsRestoreWrite([]);
  replace.write();
  assert.equal(getPilgrimageRecordsLoadError(), null);
  replace.rollback();
  assert.ok(getPilgrimageRecordsLoadError());
  assert.deepEqual(harness.values, new Map(raw));
});

test('photo cleanup errors report a completed metadata deletion while retaining unrelated source files', async () => {
  await savePilgrimagePhoto(input, source, 800, 600, at);
  harness.failDelete = true;
  await assert.rejects(deletePilgrimagePoint(input.key), PilgrimagePhotoCleanupError);
  assert.deepEqual(harness.state.points, []);
  assert.equal(storedPointCount(), 0);
  assert.equal(harness.files.size, 2, 'failed cleanup leaves only an unreferenced app copy plus original source');
});

test('deleting one photo preserves other photos, histories and source files', async () => {
  await savePilgrimagePhoto(input, source, 800, 600, at);
  await savePilgrimagePhoto(input, source, 800, 600, at + 60000);
  await recordPilgrimageVisit(input, at + 86400000);
  const other = { ...input, key: '1:b', pointId: 'b' };
  await savePilgrimagePhoto(other, source, 800, 600, at);
  const before = harness.state.points;
  const point = before.find((entry) => entry.key === input.key);
  const day = point.days.find((entry) => entry.dateKey === '2026-10-22');
  const [removed, retained] = day.photos;
  const retainedFile = getPilgrimagePhotoFile(retained.fileName).uri;
  const untouchedPoint = before.find((entry) => entry.key === other.key);
  const untouchedDay = point.days.find((entry) => entry.dateKey === '2026-10-23');
  const previous = structuredClone(before);
  harness.mutations = [];

  await deletePilgrimagePhoto(input.key, removed.id);

  const updated = harness.state.points.find((entry) => entry.key === input.key);
  const updatedDay = updated.days.find((entry) => entry.dateKey === day.dateKey);
  assert.deepEqual(updatedDay.photos, [retained]);
  assert.equal(updatedDay.firstRecordedAt, day.firstRecordedAt);
  assert.equal(updated.days.length, 2);
  assert.equal(
    updated.days.find((entry) => entry.dateKey === untouchedDay.dateKey),
    untouchedDay,
  );
  assert.equal(
    harness.state.points.find((entry) => entry.key === other.key),
    untouchedPoint,
  );
  assert.deepEqual(before, previous, 'deletion never mutates the prior store snapshot');
  assert.equal(harness.files.has(getPilgrimagePhotoFile(removed.fileName).uri), false);
  assert.equal(harness.files.has(retainedFile), true);
  assert.equal(harness.files.has(source), true);
  assert.equal(harness.files.size, 3, 'only the targeted app-owned copy is removed');
  assert.deepEqual(harness.mutations, ['point-v2:1%3Aa'], 'unchanged point histories are not persisted again');
  assert.deepEqual(getPilgrimageRecords(), harness.state.points);
});

test('a newly saved photo moves its point first after storage reload and deleting the photo keeps that event time', async () => {
  const other = { ...input, key: '1:b', pointId: 'b' };
  await recordPilgrimageVisit(input, at);
  await recordPilgrimageVisit(other, at + 60000);
  assert.deepEqual(
    harness.state.points.map((point) => point.key),
    ['1:b', '1:a'],
  );

  await savePilgrimagePhoto(input, source, 800, 600, at + 120000);
  const saved = getPilgrimageRecords();
  assert.deepEqual(
    saved.map((point) => point.key),
    ['1:a', '1:b'],
  );
  assert.equal(saved[0].days[0].firstRecordedAt, at);
  assert.equal(saved[0].days[0].lastRecordedAt, at + 120000);
  const range = { startDate: '', endDate: '' };
  assert.deepEqual(
    queryPilgrimagePoints(saved, range).map((point) => point.key),
    ['1:a', '1:b'],
  );

  await deletePilgrimagePhoto(input.key, saved[0].days[0].photos[0].id);
  assert.equal(harness.state.points[0].days[0].lastRecordedAt, at + 120000);
  assert.deepEqual(
    queryPilgrimagePoints(getPilgrimageRecords(), range).map((point) => point.key),
    ['1:a', '1:b'],
  );
  await deletePilgrimageDay(input.key, '2026-10-22');
  assert.deepEqual(
    queryPilgrimagePoints(getPilgrimageRecords(), range).map((point) => point.key),
    ['1:b'],
  );
});

test('deleting the last photo keeps the day, original visit time and point record', async () => {
  await savePilgrimagePhoto(input, source, 800, 600, at);
  const { id } = harness.state.points[0].days[0].photos[0];

  await deletePilgrimagePhoto(input.key, id);

  assert.equal(harness.state.points.length, 1);
  assert.deepEqual(harness.state.points[0].days, [
    { dateKey: '2026-10-22', firstRecordedAt: at, lastRecordedAt: at, photos: [] },
  ]);
  assert.equal(storedPointCount(), 1);
  assert.deepEqual([...harness.files.keys()], [source]);
  assert.deepEqual(getPilgrimageRecords(), harness.state.points);
  await recordPilgrimageVisit(input, at + 60000);
  assert.equal(harness.state.points[0].days[0].firstRecordedAt, at, 'a later check reuses the retained visit');
});

test('a failed photo metadata commit leaves the app copy and previous record intact', async () => {
  await savePilgrimagePhoto(input, source, 800, 600, at);
  const oldRaw = [...harness.values];
  const before = structuredClone(harness.state.points);
  const files = [...harness.files];
  const photo = before[0].days[0].photos[0];
  harness.publications = [];
  harness.failWrite = true;

  await assert.rejects(deletePilgrimagePhoto(input.key, photo.id), /disk failed/);

  assert.deepEqual([...harness.values], oldRaw);
  assert.deepEqual(harness.state.points, before);
  assert.deepEqual(harness.publications, []);
  assert.deepEqual([...harness.files], files, 'metadata failure must not delete any photo file');
});

test('uncertain metadata rollback during photo deletion keeps its possible referenced file', async () => {
  await savePilgrimagePhoto(input, source, 800, 600, at);
  const before = structuredClone(harness.state.points);
  const photo = before[0].days[0].photos[0];
  const files = [...harness.files];
  harness.failRollback = true;

  await assert.rejects(deletePilgrimagePhoto(input.key, photo.id), /write and rollback failed/);

  assert.deepEqual(harness.state.points, before);
  assert.deepEqual([...harness.files], files);
  assert.ok(harness.state.loadError, 'uncertain persistence closes further record writes');
});

test('single-photo cleanup failure reports committed removal while retaining the visit and original source', async () => {
  await savePilgrimagePhoto(input, source, 800, 600, at);
  const photo = harness.state.points[0].days[0].photos[0];
  harness.failDelete = true;

  await assert.rejects(deletePilgrimagePhoto(input.key, photo.id), PilgrimagePhotoCleanupError);

  assert.deepEqual(harness.state.points[0].days, [
    { dateKey: '2026-10-22', firstRecordedAt: at, lastRecordedAt: at, photos: [] },
  ]);
  assert.deepEqual(getPilgrimageRecords(), harness.state.points);
  assert.equal(harness.files.has(getPilgrimagePhotoFile(photo.fileName).uri), true);
  assert.equal(harness.files.has(source), true);
  assert.equal(storedPointCount(), 1);
});

test('unknown points and photo IDs do not write records or remove files', async () => {
  await savePilgrimagePhoto(input, source, 800, 600, at);
  const points = harness.state.points;
  const photo = points[0].days[0].photos[0];
  const files = [...harness.files];
  const raw = [...harness.values];
  harness.mutations = [];
  harness.publications = [];

  await deletePilgrimagePhoto('1:missing', photo.id);
  await deletePilgrimagePhoto(input.key, 'missing-photo');

  assert.equal(harness.state.points, points);
  assert.deepEqual([...harness.files], files);
  assert.deepEqual([...harness.values], raw);
  assert.deepEqual(harness.mutations, []);
  assert.deepEqual(harness.publications, []);
});

test('single-photo deletion waits for an in-flight append and preserves the newly added photo', async () => {
  await savePilgrimagePhoto(input, source, 800, 600, at);
  const removed = harness.state.points[0].days[0].photos[0];
  let release;
  harness.copyGate = new Promise((resolve) => {
    release = resolve;
  });
  const append = savePilgrimagePhoto(input, source, 800, 600, at + 60000);
  const remove = deletePilgrimagePhoto(input.key, removed.id);
  release();
  await Promise.all([append, remove]);

  const day = harness.state.points[0].days[0];
  assert.equal(day.photos.length, 1);
  assert.notEqual(day.photos[0].id, removed.id);
  assert.equal(day.firstRecordedAt, at);
  assert.equal(harness.files.has(getPilgrimagePhotoFile(removed.fileName).uri), false);
  assert.equal(harness.files.has(getPilgrimagePhotoFile(day.photos[0].fileName).uri), true);
  assert.equal(harness.files.has(source), true);
  assert.deepEqual(getPilgrimageRecords(), harness.state.points);
});

test('mixed cross-day batch deletion commits once, deduplicates selection and preserves unchanged records', async () => {
  const { point, removedDay, editedDay, emptyDay, otherPoint } = await createBatchRecords();
  const before = harness.state.points;
  const previous = structuredClone(before);
  const selection = Object.freeze({
    dateKeys: Object.freeze([removedDay.dateKey, removedDay.dateKey, 'missing-date']),
    photoIds: Object.freeze([
      removedDay.photos[0].id,
      editedDay.photos[0].id,
      editedDay.photos[0].id,
      otherPoint.days[0].photos[0].id,
      'missing-photo',
    ]),
  });
  harness.mutations = [];
  harness.publications = [];

  await deletePilgrimageSelection(input.key, selection);

  const updated = harness.state.points.find((entry) => entry.key === input.key);
  assert.deepEqual(
    updated.days.map((day) => day.dateKey),
    [emptyDay.dateKey, editedDay.dateKey],
  );
  assert.equal(updated.days[0], emptyDay, 'a day outside the selection retains its original reference');
  assert.deepEqual(updated.days[1], { ...editedDay, photos: [editedDay.photos[1]] });
  assert.equal(updated.days[1].photos[0], editedDay.photos[1]);
  assert.equal(
    harness.state.points.find((entry) => entry.key === otherPoint.key),
    otherPoint,
  );
  assert.deepEqual(before, previous, 'the transaction never mutates previous point/day/photo snapshots');
  assert.deepEqual(harness.mutations, ['point-v2:1%3Aa']);
  assert.equal(harness.publications.length, 1);
  assert.equal(harness.deleteAttempts.length, 3, 'overlapping day/photo selections delete each app copy once');
  assert.equal(new Set(harness.deleteAttempts.map((attempt) => attempt.uri)).size, 3);
  assert.ok(
    harness.deleteAttempts.every((attempt) => attempt.points === harness.state.points),
    'metadata is committed before any app file cleanup',
  );
  assert.equal(harness.files.has(source), true);
  assert.equal(harness.files.size, 3, 'retained photo, other point photo and original source survive');
  assert.deepEqual(getPilgrimageRecords(), harness.state.points);
  assert.equal(point.days.length, 3);
});

test('photo-only batch deletion retains empty visit days and their original times', async () => {
  const { point, removedDay, editedDay, emptyDay } = await createBatchRecords();
  const photoIds = point.days.flatMap((day) => day.photos.map((photo) => photo.id));
  await deletePilgrimageSelection(input.key, { dateKeys: [], photoIds });

  const updated = harness.state.points.find((entry) => entry.key === input.key);
  assert.equal(updated.days.length, 3);
  assert.deepEqual(
    updated.days.map((day) => day.photos),
    [[], [], []],
  );
  assert.equal(
    updated.days.find((day) => day.dateKey === emptyDay.dateKey),
    emptyDay,
  );
  assert.equal(
    updated.days.find((day) => day.dateKey === editedDay.dateKey).firstRecordedAt,
    editedDay.firstRecordedAt,
  );
  assert.equal(
    updated.days.find((day) => day.dateKey === removedDay.dateKey).firstRecordedAt,
    removedDay.firstRecordedAt,
  );
  assert.equal(harness.files.size, 2, 'the other point photo and original source remain');
  assert.deepEqual(getPilgrimageRecords(), harness.state.points);
});

test('missing or empty batch selections preserve store references and perform no writes or cleanup', async () => {
  const { otherPoint } = await createBatchRecords();
  const before = harness.state.points;
  const raw = [...harness.values];
  const files = [...harness.files];
  harness.mutations = [];
  harness.publications = [];

  await deletePilgrimageSelection(input.key, { dateKeys: [], photoIds: [] });
  await deletePilgrimageSelection('missing-point', { dateKeys: ['2026-10-22'], photoIds: [] });
  await deletePilgrimageSelection(input.key, {
    dateKeys: ['missing-date', 'missing-date'],
    photoIds: ['missing-photo', otherPoint.days[0].photos[0].id],
  });

  assert.equal(harness.state.points, before);
  assert.deepEqual([...harness.values], raw);
  assert.deepEqual([...harness.files], files);
  assert.deepEqual(harness.mutations, []);
  assert.deepEqual(harness.publications, []);
  assert.deepEqual(harness.deleteAttempts, []);
});

for (const rollbackFails of [false, true]) {
  test(`batch metadata failure ${rollbackFails ? 'with uncertain rollback' : 'rolls back atomically'} never deletes app files`, async () => {
    const { removedDay, editedDay } = await createBatchRecords();
    const before = structuredClone(harness.state.points);
    const raw = [...harness.values];
    const files = [...harness.files];
    harness.publications = [];
    if (rollbackFails) harness.failRollback = true;
    else harness.failWrite = true;

    await assert.rejects(
      deletePilgrimageSelection(input.key, { dateKeys: [removedDay.dateKey], photoIds: [editedDay.photos[0].id] }),
      rollbackFails ? /write and rollback failed/ : /disk failed/,
    );

    assert.deepEqual(harness.state.points, before);
    assert.deepEqual([...harness.files], files);
    assert.deepEqual(harness.deleteAttempts, []);
    assert.equal(
      harness.publications.some((patch) => 'points' in patch),
      false,
    );
    if (rollbackFails) assert.ok(harness.state.loadError);
    else assert.deepEqual([...harness.values], raw);
  });
}

test('explicitly deleting every day removes the point with one commit and preserves other points', async () => {
  const { point, otherPoint } = await createBatchRecords();
  harness.publications = [];

  await deletePilgrimageSelection(input.key, {
    dateKeys: point.days.map((day) => day.dateKey),
    photoIds: point.days.flatMap((day) => day.photos.map((photo) => photo.id)),
  });

  assert.deepEqual(harness.state.points, [otherPoint]);
  assert.equal(harness.state.points[0], otherPoint);
  assert.equal(harness.publications.length, 1);
  assert.equal(storedPointCount(), 1);
  assert.equal(harness.deleteAttempts.length, 4);
  assert.equal(harness.files.size, 2);
  assert.deepEqual(getPilgrimageRecords(), harness.state.points);
});

test('batch cleanup failure preserves the committed change and still attempts every other selected app file', async () => {
  const { removedDay, editedDay } = await createBatchRecords();
  const failedUri = getPilgrimagePhotoFile(removedDay.photos[0].fileName).uri;
  harness.failDelete = failedUri;
  harness.publications = [];
  harness.mutations = [];

  await assert.rejects(
    deletePilgrimageSelection(input.key, { dateKeys: [removedDay.dateKey], photoIds: [editedDay.photos[0].id] }),
    (error) => error instanceof PilgrimagePhotoCleanupError && error.errors.length === 1,
  );

  const point = harness.state.points.find((entry) => entry.key === input.key);
  assert.equal(
    point.days.some((day) => day.dateKey === removedDay.dateKey),
    false,
  );
  assert.deepEqual(point.days.find((day) => day.dateKey === editedDay.dateKey).photos, [editedDay.photos[1]]);
  assert.equal(harness.publications.length, 1);
  assert.deepEqual(harness.mutations, ['point-v2:1%3Aa']);
  assert.equal(harness.deleteAttempts.length, 3);
  assert.ok(harness.deleteAttempts.every((attempt) => attempt.points === harness.state.points));
  assert.equal(harness.files.has(failedUri), true);
  assert.equal(harness.files.has(getPilgrimagePhotoFile(removedDay.photos[1].fileName).uri), false);
  assert.equal(harness.files.has(getPilgrimagePhotoFile(editedDay.photos[0].fileName).uri), false);
  assert.equal(harness.files.has(source), true);
  assert.deepEqual(getPilgrimageRecords(), harness.state.points);
});

test('batch deletion waits for append and deletes newly appended photos when their entire day is selected', async () => {
  const { removedDay, editedDay } = await createBatchRecords();
  let release;
  harness.copyGate = new Promise((resolve) => {
    release = resolve;
  });
  harness.mutations = [];
  harness.publications = [];
  const append = savePilgrimagePhoto(input, source, 800, 600, at + 120000);
  const remove = deletePilgrimageSelection(input.key, {
    dateKeys: [removedDay.dateKey],
    photoIds: [editedDay.photos[0].id],
  });
  await new Promise(setImmediate);
  assert.equal(harness.deleteAttempts.length, 0, 'queued deletion cannot overtake a photo still being copied');
  release();
  await Promise.all([append, remove]);

  const point = harness.state.points.find((entry) => entry.key === input.key);
  assert.equal(
    point.days.some((day) => day.dateKey === removedDay.dateKey),
    false,
  );
  assert.deepEqual(point.days.find((day) => day.dateKey === editedDay.dateKey).photos, [editedDay.photos[1]]);
  assert.equal(harness.deleteAttempts.length, 4, 'day selection includes the photo committed immediately before it');
  assert.equal(harness.publications.length, 2, 'append and the entire batch each publish once');
  assert.deepEqual(harness.mutations, ['point-v2:1%3Aa', 'point-v2:1%3Aa']);
  assert.equal(harness.files.size, 3);
  assert.equal(harness.files.has(source), true);
  assert.deepEqual(getPilgrimageRecords(), harness.state.points);
});

test('queue continues after errors and file helpers refuse paths outside record images', async () => {
  await assert.rejects(
    withPilgrimageRecordsLock(() => {
      throw new Error('failed');
    }),
  );
  await recordPilgrimageVisit(input, at);
  assert.equal(harness.state.points.length, 1);
  assert.throws(() => getPilgrimagePhotoFile('../outside.jpg'));
  assert.throws(() => getPilgrimagePhotoFile('file:///outside.jpg'));
});
