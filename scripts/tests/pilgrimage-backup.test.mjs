import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, beforeEach, test } from 'node:test';
import { strToU8, zipSync } from 'fflate';

const harness = {
  files: new Map(),
  dirs: new Set(['/cache', '/document']),
  storages: new Map(),
  favorites: { favoritePoints: [], favoriteKeys: new Set() },
  plans: { plans: [], planListSortOrder: 'desc' },
  records: { points: [], loadError: null },
  failKey: null,
  failCopy: false,
  onCopy: null,
  maxRead: 0,
};
const uri = (part) => (typeof part === 'string' ? part : part.uri);
class Directory {
  constructor(...parts) {
    this.uri = parts.map(uri).join('/');
  }
  get exists() {
    return harness.dirs.has(this.uri);
  }
  create() {
    harness.dirs.add(this.uri);
  }
  delete() {
    for (const path of harness.files.keys()) if (path.startsWith(`${this.uri}/`)) harness.files.delete(path);
    harness.dirs.delete(this.uri);
  }
}
class File {
  constructor(...parts) {
    this.uri = parts.map(uri).join('/');
  }
  get exists() {
    return harness.files.has(this.uri);
  }
  get name() {
    return this.uri.slice(this.uri.lastIndexOf('/') + 1);
  }
  get size() {
    return harness.files.get(this.uri)?.length ?? 0;
  }
  get extension() {
    return this.name.slice(this.name.lastIndexOf('.'));
  }
  create(options = {}) {
    if (this.exists && !options.overwrite) throw new Error('exists');
    harness.files.set(this.uri, new Uint8Array());
  }
  writeSync(content) {
    harness.files.set(this.uri, typeof content === 'string' ? strToU8(content) : content.slice());
  }
  async text() {
    return new TextDecoder().decode(harness.files.get(this.uri));
  }
  async copy(target) {
    harness.onCopy?.();
    if (harness.failCopy) throw new Error('copy failed');
    harness.files.set(target.uri, harness.files.get(this.uri).slice());
  }
  delete() {
    harness.files.delete(this.uri);
  }
  open() {
    const file = this;
    let offset = 0;
    let closed = false;
    return {
      get offset() {
        return closed ? null : offset;
      },
      set offset(value) {
        offset = value;
      },
      async readBytes(length) {
        assert.equal(closed, false);
        harness.maxRead = Math.max(harness.maxRead, length);
        const chunk = harness.files.get(file.uri).slice(offset, offset + length);
        offset += chunk.length;
        return chunk;
      },
      writeBytesSync(chunk) {
        assert.equal(closed, false);
        const previous = harness.files.get(file.uri);
        const next = new Uint8Array(Math.max(previous.length, offset + chunk.length));
        next.set(previous);
        next.set(chunk, offset);
        offset += chunk.length;
        harness.files.set(file.uri, next);
      },
      close() {
        closed = true;
      },
    };
  }
}
globalThis.__pilgrimageBackupHarness = { harness, File, Directory };
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'expo-file-system') return { url: 'pilgrimage-backup:fs', shortCircuit: true };
    if (specifier === 'react-native-mmkv') return { url: 'pilgrimage-backup:mmkv', shortCircuit: true };
    for (const [suffix, store] of [
      ['favorite-points', 'favorites'],
      ['plans', 'plans'],
      ['pilgrimage-records', 'records'],
    ]) {
      if (specifier === `@/store/use-${suffix}`) return { url: `pilgrimage-backup:${store}`, shortCircuit: true };
    }
    if (specifier.startsWith('@/'))
      return { url: new URL(`../../src/${specifier.slice(2)}.ts`, import.meta.url).href, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    const common = 'const {harness, File, Directory} = globalThis.__pilgrimageBackupHarness;';
    if (url === 'pilgrimage-backup:fs')
      return {
        format: 'module',
        shortCircuit: true,
        source: `${common} export {File,Directory}; export const FileMode={ReadOnly:'r',WriteOnly:'w'}; export const Paths={cache:new Directory('/cache'),document:new Directory('/document')};`,
      };
    if (url === 'pilgrimage-backup:mmkv')
      return {
        format: 'module',
        shortCircuit: true,
        source: `${common}
      export function createMMKV({id}) {
        const values = new Map(); harness.storages.set(id,values);
        return {getString:key=>values.get(key),getAllKeys:()=>[...values.keys()],contains:key=>values.has(key),remove:key=>values.delete(key),set(key,value){values.set(key,value);if(harness.failKey===key){harness.failKey=null;throw new Error('storage failed after mutation');}}};
      }`,
      };
    for (const [store, name] of [
      ['favorites', 'useFavoritePoints'],
      ['plans', 'usePlans'],
      ['records', 'usePilgrimageRecords'],
    ]) {
      if (url === `pilgrimage-backup:${store}`)
        return {
          format: 'module',
          shortCircuit: true,
          source: `${common} export const ${name}={getState:()=>harness.${store},setState:next=>Object.assign(harness.${store},next)};`,
        };
    }
    return next(url, context);
  },
});
const { createPilgrimageBackupArchive, readPilgrimageBackupArchive } =
  await import('../../src/lib/pilgrimage-backup-archive.ts');
const { createDataBackupContent } = await import('../../src/lib/data-backup.ts');
const { restoreDataBackup } = await import('../../src/lib/restore-data-backup.ts');
const { getPilgrimagePhotoFile } = await import('../../src/lib/pilgrimage-record-files.ts');
const { getPilgrimageRecords } = await import('../../src/lib/pilgrimage-record-storage.ts');

const imageBytes = Uint8Array.from({ length: 700000 }, (_, index) => index % 251);
const photo = { id: 'photo-a', fileName: 'photo-a.jpg', width: 700, height: 1000 };
function records(photos = [photo]) {
  return [
    {
      key: '1:a',
      bangumiId: 1,
      pointId: 'a',
      snapshot: { bangumiName: '作品', pointName: '点位' },
      days: [{ dateKey: '2026-10-22', firstRecordedAt: 1792630800000, lastRecordedAt: 1792634400000, photos }],
    },
  ];
}
function archiveFile(files) {
  const file = new File('/cache/test.zip');
  file.writeSync(zipSync(files, { level: 0 }));
  return file;
}
function json(data) {
  return createDataBackupContent(data, '0.8.0');
}
function metadata() {
  return strToU8(json({ pilgrimageRecords: records() }));
}

beforeEach(() => {
  harness.files.clear();
  harness.dirs = new Set(['/cache', '/document']);
  for (const storage of harness.storages.values()) storage.clear();
  harness.records = { points: [], loadError: null };
  harness.favorites = { favoritePoints: [], favoriteKeys: new Set() };
  harness.plans = { plans: [], planListSortOrder: 'desc' };
  harness.failKey = null;
  harness.failCopy = false;
  harness.onCopy = null;
  harness.maxRead = 0;
});
after(() => {
  hooks.deregister();
  delete globalThis.__pilgrimageBackupHarness;
});

test('streaming ZIP round trip contains real bytes, preserves dates, and reads large images in chunks', async () => {
  getPilgrimagePhotoFile(photo.fileName).writeSync(imageBytes);
  const file = new File('/cache/output.zip');
  const progress = [];
  const data = { pilgrimageRecords: records() };
  await createPilgrimageBackupArchive(data, json(data), file, (value) => progress.push(value));
  const result = await readPilgrimageBackupArchive(file);
  assert.deepEqual(result.backup.data, data);
  assert.deepEqual(harness.files.get(result.archive.photos.get(photo.fileName).uri), imageBytes);
  assert.ok(harness.maxRead <= 256 * 1024);
  assert.equal(progress.at(-1).completed, 1);
  result.archive.cleanup();
  assert.equal(result.archive.photos.get(photo.fileName).exists, false);
  assert.equal(file.exists, true);
});

test('historical V3 ZIP keeps photo identity and dates without inventing last-record times', async () => {
  const data = { pilgrimageRecords: records() };
  delete data.pilgrimageRecords[0].days[0].lastRecordedAt;
  const envelope = { ...JSON.parse(json(data)), version: 3 };
  const result = await readPilgrimageBackupArchive(
    archiveFile({ 'data.json': strToU8(JSON.stringify(envelope)), 'images/photo-a.jpg': imageBytes }),
  );
  assert.equal(result.backup.version, 4);
  assert.deepEqual(result.backup.data, data);
  await restoreDataBackup(result.backup.data, 'overwrite', result.archive);
  const restored = harness.records.points[0].days[0];
  assert.equal(restored.firstRecordedAt, data.pilgrimageRecords[0].days[0].firstRecordedAt);
  assert.equal(Object.hasOwn(restored, 'lastRecordedAt'), false);
  assert.equal(restored.photos[0].id, photo.id);
});

test('rejects missing, undeclared, duplicate, traversal and unexpected archive entries before restoration', async () => {
  const examples = [
    { 'data.json': metadata() },
    { 'data.json': metadata(), 'images/photo-a.jpg': imageBytes, 'images/extra.jpg': new Uint8Array([1]) },
    { 'data.json': metadata(), '../photo-a.jpg': imageBytes },
    { 'data.json': metadata(), 'images/nested/photo-a.jpg': imageBytes },
    { 'data.json': metadata(), 'images/photo-a.jpg': imageBytes, 'other.txt': new Uint8Array([1]) },
  ];
  for (const files of examples) {
    await assert.rejects(() => readPilgrimageBackupArchive(archiveFile(files)));
    assert.equal(
      [...harness.files.keys()].some((path) => path.includes('pilgrimage-backup-')),
      false,
    );
  }
});

test('rejects truncated ZIP and modified photo CRC without changing current records', async () => {
  const file = archiveFile({ 'data.json': metadata(), 'images/photo-a.jpg': imageBytes });
  const original = harness.files.get(file.uri).slice();
  harness.files.set(file.uri, original.slice(0, -8));
  await assert.rejects(() => readPilgrimageBackupArchive(file));
  harness.files.set(file.uri, original.slice());
  harness.files.get(file.uri)[20000] ^= 1;
  await assert.rejects(() => readPilgrimageBackupArchive(file));
  assert.deepEqual(harness.records.points, []);
});

test('restore stages unique files, preserves timestamps and IDs, and repeated merge never adds duplicates', async () => {
  const result = await readPilgrimageBackupArchive(
    archiveFile({ 'data.json': metadata(), 'images/photo-a.jpg': imageBytes }),
  );
  await restoreDataBackup(result.backup.data, 'merge', result.archive);
  const restored = harness.records.points[0].days[0];
  assert.equal(restored.firstRecordedAt, records()[0].days[0].firstRecordedAt);
  assert.equal(restored.lastRecordedAt, records()[0].days[0].lastRecordedAt);
  assert.equal(restored.photos[0].id, photo.id);
  assert.notEqual(restored.photos[0].fileName, photo.fileName);
  const file = getPilgrimagePhotoFile(restored.photos[0].fileName);
  assert.deepEqual(harness.files.get(file.uri), imageBytes);
  const before = [...harness.files.keys()];
  await restoreDataBackup(result.backup.data, 'merge', result.archive);
  assert.equal(harness.records.points[0].days[0].photos.length, 1);
  assert.deepEqual([...harness.files.keys()], before);
  assert.deepEqual(getPilgrimageRecords(), harness.records.points);
  assert.deepEqual(harness.plans, { plans: [], planListSortOrder: 'desc' });
});

test('failure after a metadata mutation rolls back all categories and removes only staged image files', async () => {
  const original = getPilgrimagePhotoFile('original.jpg');
  original.writeSync(new Uint8Array([4, 5, 6]));
  const oldRecords = records([{ ...photo, id: 'original', fileName: 'original.jpg' }]);
  harness.records.points = oldRecords;
  const storage = harness.storages.get('anitabi-pilgrimage-records');
  storage.set('point-v2:1%3Aa', JSON.stringify(oldRecords[0]));
  storage.set('schema-version', '2');
  const result = await readPilgrimageBackupArchive(
    archiveFile({ 'data.json': metadata(), 'images/photo-a.jpg': imageBytes }),
  );
  const beforeFiles = [...harness.files.keys()];
  harness.failKey = 'point-v2:1%3Aa';
  await assert.rejects(
    () => restoreDataBackup(result.backup.data, 'overwrite', result.archive),
    (error) => error.code === 'writeFailed',
  );
  assert.deepEqual(harness.records.points, oldRecords);
  assert.deepEqual(getPilgrimageRecords(), oldRecords);
  assert.deepEqual([...harness.files.keys()], beforeFiles);
  assert.deepEqual(harness.files.get(original.uri), new Uint8Array([4, 5, 6]));
});

test('records overwrite deletes old application photos after success and leaves other categories untouched', async () => {
  const result = await readPilgrimageBackupArchive(
    archiveFile({ 'data.json': metadata(), 'images/photo-a.jpg': imageBytes }),
  );
  await restoreDataBackup(result.backup.data, 'overwrite', result.archive);
  const previousFile = getPilgrimagePhotoFile(harness.records.points[0].days[0].photos[0].fileName);
  harness.plans = { plans: [{ id: 'existing', items: [{ completed: true }] }], planListSortOrder: 'asc' };
  await restoreDataBackup({ pilgrimageRecords: [] }, 'overwrite');
  assert.equal(previousFile.exists, false);
  assert.equal(harness.plans.plans[0].items[0].completed, true);
  assert.deepEqual(harness.records.points, []);
});

test('damaged local record storage blocks merging but explicit overwrite restores it', async () => {
  harness.records.loadError = 'corrupted';
  await assert.rejects(
    () => restoreDataBackup({ pilgrimageRecords: records([]) }, 'merge'),
    (error) => error.code === 'recordsUnavailable',
  );
  await restoreDataBackup({ pilgrimageRecords: records([]) }, 'overwrite');
  assert.equal(harness.records.loadError, null);
  assert.deepEqual(harness.records.points, records([]));
});

test('merge repairs both missing and empty local photos without changing their stable IDs', async () => {
  const result = await readPilgrimageBackupArchive(
    archiveFile({ 'data.json': metadata(), 'images/photo-a.jpg': imageBytes }),
  );
  await restoreDataBackup(result.backup.data, 'merge', result.archive);
  for (const empty of [false, true]) {
    const local = getPilgrimagePhotoFile(harness.records.points[0].days[0].photos[0].fileName);
    if (empty) local.writeSync(new Uint8Array());
    else local.delete();
    await restoreDataBackup(result.backup.data, 'merge', result.archive);
    const restored = harness.records.points[0].days[0].photos;
    assert.equal(restored.length, 1);
    assert.equal(restored[0].id, photo.id);
    assert.notEqual(restored[0].fileName, local.name);
    assert.deepEqual(harness.files.get(getPilgrimagePhotoFile(restored[0].fileName).uri), imageBytes);
  }
});

test('copy failure preserves original bytes and metadata without publishing partial records', async () => {
  const result = await readPilgrimageBackupArchive(
    archiveFile({ 'data.json': metadata(), 'images/photo-a.jpg': imageBytes }),
  );
  const before = [...harness.files.keys()];
  harness.failCopy = true;
  await assert.rejects(() => restoreDataBackup(result.backup.data, 'overwrite', result.archive));
  assert.deepEqual(harness.records.points, []);
  assert.deepEqual(getPilgrimageRecords(), []);
  assert.deepEqual([...harness.files.keys()], before);
});

test('merge incorporates favorite changes made while photo files are being copied', async () => {
  const result = await readPilgrimageBackupArchive(
    archiveFile({ 'data.json': metadata(), 'images/photo-a.jpg': imageBytes }),
  );
  const makeFavorite = (id) => ({
    key: `1:${id}`,
    bangumiId: 1,
    pointId: id,
    addedAt: 100,
    snapshot: { bangumiName: '作品', pointName: id },
  });
  harness.onCopy = () => {
    harness.favorites.favoritePoints = [makeFavorite('concurrent')];
  };
  await restoreDataBackup(
    { ...result.backup.data, favoritePoints: [makeFavorite('imported')] },
    'merge',
    result.archive,
  );
  assert.deepEqual(
    harness.favorites.favoritePoints.map((favorite) => favorite.key),
    ['1:concurrent', '1:imported'],
  );
});

test('records with no photos still produce a valid single-entry ZIP', async () => {
  const data = { pilgrimageRecords: records([]) };
  const output = new File('/cache/empty-photos.zip');
  await createPilgrimageBackupArchive(data, json(data), output);
  const result = await readPilgrimageBackupArchive(output);
  assert.deepEqual(result.backup.data, data);
  assert.equal(result.archive.photos.size, 0);
});

test('rejects repacked DEFLATE archives to keep extraction memory bounded', async () => {
  const file = new File('/cache/deflated.zip');
  file.writeSync(zipSync({ 'data.json': metadata(), 'images/photo-a.jpg': imageBytes }, { level: 6 }));
  await assert.rejects(() => readPilgrimageBackupArchive(file));
});
