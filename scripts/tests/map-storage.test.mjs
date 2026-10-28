import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/lib/map-storage.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const COMPLETE = 'assembled-data-v2';
const LEGACY = 'assembled-data';
const LEGACY_VERSION = 'g-modified';
const MANIFEST = 'map-detail-manifest-v1';
const shardKey = (index) => `map-detail-v1:${index}`;
const revision = (version = 2, ids = [1, 2]) => JSON.stringify([version, 250, ids]);
const detail = (id) => [[id, ['', [], 0, 0, 0], [], 100]];
const assembled = (id = 1) => ({
  data: {
    modified: 100,
    bangumis: [{ id, geo: [35, 139], modified: 100, points: [], theme: { src: '', ids: [] } }],
  },
});
const completeRecord = (data = assembled(), version = 1) =>
  JSON.stringify({ schemaVersion: 2, remoteModified: version, data });
const stagedRecord = (rev, id) => JSON.stringify({ schemaVersion: 1, revision: rev, data: detail(id) });
const plain = (value) => JSON.parse(JSON.stringify(value));

function createHarness(initial = [], available = true) {
  const harness = {
    values: new Map(initial),
    reads: [],
    writes: [],
    removals: [],
    failSet: null,
    failRemove: new Set(),
    failEnumeration: false,
    load() {
      const module = { exports: {} };
      const mockStorage = {
        getString: (key) => {
          this.reads.push(key);
          return this.values.get(key);
        },
        set: (key, value) => {
          this.writes.push({ key, value });
          const failure = this.failSet?.key === key ? this.failSet.mode : null;
          if (failure) this.failSet = null;
          if (failure === 'before') throw new Error('Injected write failure');
          if (failure === 'silent') return;
          this.values.set(key, value);
          if (failure === 'after') throw new Error('Injected write failure after mutation');
        },
        remove: (key) => {
          this.removals.push(key);
          if (this.failRemove.has(key)) throw new Error('Injected deletion failure');
          this.values.delete(key);
        },
        getAllKeys: () => {
          if (this.failEnumeration) throw new Error('Injected key enumeration failure');
          return [...this.values.keys()];
        },
      };
      vm.runInNewContext(compiled, {
        module,
        exports: module.exports,
        console: { warn() {} },
        require: (specifier) => {
          assert.equal(specifier, 'react-native-mmkv');
          return {
            createMMKV: ({ id }) => {
              assert.equal(id, 'anitabi-map-cache');
              if (!available) throw new Error('MMKV unavailable');
              return mockStorage;
            },
          };
        },
      });
      return module.exports;
    },
  };
  return harness;
}

test('complete cache loads lazily once and keeps data and trusted version together', () => {
  const data = assembled();
  const harness = createHarness([[COMPLETE, completeRecord(data, 20)]]);
  const cache = harness.load();
  assert.equal(harness.reads.length, 0);
  assert.equal(cache.getGModified(), 20);
  const cached = cache.getCachedData();
  assert.deepEqual(plain(cached), data);
  assert.equal(cache.getCachedData(), cached);
  assert.deepEqual(harness.reads, [COMPLETE]);
  assert.deepEqual(harness.writes, []);
});

test('legacy data remains visible but its version is never trusted or migrated during startup', () => {
  const data = assembled();
  data.data.bangumis[0].modified = 0; // Historical missing-shard output.
  const harness = createHarness([
    [LEGACY, JSON.stringify(data)],
    [LEGACY_VERSION, '20'],
  ]);
  const cache = harness.load();
  assert.deepEqual(plain(cache.getCachedData()), data);
  assert.equal(cache.getGModified(), null);
  assert.deepEqual(harness.reads, [COMPLETE, LEGACY]);
  assert.deepEqual(harness.writes, []);
  assert.equal(harness.values.get(LEGACY_VERSION), '20');
});

test('damaged new cache falls back to legacy and damaged legacy becomes a cache miss', () => {
  for (const invalid of ['{broken', JSON.stringify({ schemaVersion: 3, remoteModified: 20, data: assembled() })]) {
    const harness = createHarness([
      [COMPLETE, invalid],
      [LEGACY, JSON.stringify(assembled(2))],
    ]);
    const cache = harness.load();
    assert.equal(cache.getGModified(), null);
    assert.deepEqual(plain(cache.getCachedData()), assembled(2));
  }
  const cache = createHarness([[LEGACY, '{broken']]).load();
  assert.equal(cache.getCachedData(), null);
  assert.equal(cache.getGModified(), null);
});

test('complete commit uses one record and removes staging and obsolete legacy keys', () => {
  const harness = createHarness([
    [LEGACY, JSON.stringify(assembled())],
    [LEGACY_VERSION, '1'],
  ]);
  const cache = harness.load();
  const gen = cache.getMapCacheGeneration();
  const rev = revision();
  cache.prepareMapDownload(rev, gen);
  cache.setStagedMapDetail(rev, 0, detail(1), gen);
  const data = assembled(2);
  assert.equal(cache.commitCachedMapData(data, 20, gen), true);
  assert.equal(cache.getCachedData(), data);
  assert.equal(cache.getGModified(), 20);
  assert.deepEqual(JSON.parse(harness.values.get(COMPLETE)), { schemaVersion: 2, remoteModified: 20, data });
  assert.deepEqual([...harness.values.keys()], [COMPLETE]);
  assert.equal(harness.writes.filter(({ key }) => key === COMPLETE).length, 1);
  assert.equal(
    harness.writes.some(({ key }) => key === LEGACY_VERSION),
    false,
  );
  const restarted = harness.load();
  assert.equal(restarted.getGModified(), 20);
  assert.deepEqual(plain(restarted.getCachedData()), data);
});

for (const mode of ['before', 'after', 'silent']) {
  test(`failed complete commit (${mode}) preserves old cache/version and resumable shards`, () => {
    const previous = completeRecord(assembled(), 1);
    const harness = createHarness([[COMPLETE, previous]]);
    const cache = harness.load();
    const oldSnapshot = cache.getCachedData();
    const gen = cache.getMapCacheGeneration();
    const rev = revision();
    cache.prepareMapDownload(rev, gen);
    cache.setStagedMapDetail(rev, 0, detail(1), gen);
    harness.failSet = { key: COMPLETE, mode };
    assert.equal(cache.commitCachedMapData(assembled(2), 2, gen), false);
    assert.equal(harness.values.get(COMPLETE), previous);
    assert.equal(cache.getCachedData(), oldSnapshot);
    assert.equal(cache.getGModified(), 1);
    assert.deepEqual(plain(cache.getStagedMapDetail(rev, 0)), detail(1));
    assert.ok(harness.values.has(shardKey(0)));
    assert.equal(harness.load().getGModified(), 1);
  });
}

test('failed first commit removes its changed record and retains the legacy fallback', () => {
  const harness = createHarness([
    [LEGACY, JSON.stringify(assembled())],
    [LEGACY_VERSION, '1'],
  ]);
  const cache = harness.load();
  harness.failSet = { key: COMPLETE, mode: 'after' };
  assert.equal(cache.commitCachedMapData(assembled(2), 2, cache.getMapCacheGeneration()), false);
  assert.equal(harness.values.has(COMPLETE), false);
  assert.equal(cache.getGModified(), null);
  assert.deepEqual(plain(cache.getCachedData()), assembled());
  assert.deepEqual(plain(harness.load().getCachedData()), assembled());
});

test('same revision reuses persisted shards after restarting without rewriting them', () => {
  const harness = createHarness();
  const cache = harness.load();
  const rev = revision();
  const gen = cache.getMapCacheGeneration();
  cache.prepareMapDownload(rev, gen);
  cache.setStagedMapDetail(rev, 0, detail(1), gen);
  cache.setStagedMapDetail(rev, 1, detail(2), gen);
  const writeCount = harness.writes.length;
  const restarted = harness.load();
  restarted.prepareMapDownload(rev, restarted.getMapCacheGeneration());
  assert.deepEqual(plain(restarted.getStagedMapDetail(rev, 0)), detail(1));
  assert.deepEqual(plain(restarted.getStagedMapDetail(rev, 1)), detail(2));
  assert.equal(harness.writes.length, writeCount);
  assert.equal(harness.writes.filter(({ key }) => key === shardKey(0)).length, 1);
  assert.equal(harness.writes.filter(({ key }) => key === shardKey(1)).length, 1);
});

test('changed index membership invalidates shards even when the remote timestamp is unchanged', () => {
  const previous = revision(2, [1, 2]);
  const next = revision(2, [1, 3]);
  const harness = createHarness([
    [MANIFEST, JSON.stringify({ schemaVersion: 1, revision: previous })],
    [shardKey(0), stagedRecord(previous, 1)],
  ]);
  const cache = harness.load();
  cache.prepareMapDownload(next, cache.getMapCacheGeneration());
  assert.equal(cache.getStagedMapDetail(next, 0), null);
  assert.equal(cache.getStagedMapDetail(previous, 0), null);
  assert.equal(harness.values.has(shardKey(0)), false);
  assert.equal(JSON.parse(harness.values.get(MANIFEST)).revision, next);
});

test('failed old-shard cleanup cannot allow a mismatched revision to be reused', () => {
  const previous = revision(1);
  const next = revision(2);
  const harness = createHarness([
    [MANIFEST, JSON.stringify({ schemaVersion: 1, revision: previous })],
    [shardKey(0), stagedRecord(previous, 1)],
  ]);
  harness.failRemove.add(shardKey(0));
  const cache = harness.load();
  cache.prepareMapDownload(next, cache.getMapCacheGeneration());
  assert.equal(cache.getStagedMapDetail(next, 0), null);
  assert.equal(harness.load().getStagedMapDetail(next, 0), null);
});

test('damaged staging treats only the damaged shard as missing', () => {
  const rev = revision();
  const harness = createHarness([
    [MANIFEST, JSON.stringify({ schemaVersion: 1, revision: rev })],
    [shardKey(0), '{broken'],
    [shardKey(1), stagedRecord(rev, 2)],
    [shardKey(2), JSON.stringify({ schemaVersion: 1, revision: rev, data: [null] })],
  ]);
  const cache = harness.load();
  assert.equal(cache.getStagedMapDetail(rev, 0), null);
  assert.deepEqual(plain(cache.getStagedMapDetail(rev, 1)), detail(2));
  assert.equal(cache.getStagedMapDetail(rev, 2), null);
  assert.equal(cache.getStagedMapDetail(rev, -1), null);
});

test('failed shard persistence retains the downloaded shard in this session', () => {
  const harness = createHarness();
  const cache = harness.load();
  const gen = cache.getMapCacheGeneration();
  const rev = revision();
  cache.prepareMapDownload(rev, gen);
  harness.failSet = { key: shardKey(0), mode: 'before' };
  const data = detail(1);
  assert.equal(cache.setStagedMapDetail(rev, 0, data, gen), false);
  assert.equal(cache.getStagedMapDetail(rev, 0), data);
  assert.equal(harness.load().getStagedMapDetail(rev, 0), null);
});

test('unavailable MMKV preserves only in-memory staging and still invalidates pending work on clear', () => {
  const cache = createHarness([], false).load();
  const gen = cache.getMapCacheGeneration();
  const rev = revision();
  cache.prepareMapDownload(rev, gen);
  const data = detail(1);
  assert.equal(cache.setStagedMapDetail(rev, 0, data, gen), false);
  assert.equal(cache.getStagedMapDetail(rev, 0), data);
  assert.equal(cache.commitCachedMapData(assembled(), 2, gen), false);
  cache.clearMapCache();
  assert.equal(cache.isMapCacheGenerationCurrent(gen), false);
  assert.equal(cache.getStagedMapDetail(rev, 0), null);
});

test('clear removes every cache format and shard and rejects all stale writes', () => {
  const rev = revision();
  const harness = createHarness([
    [COMPLETE, completeRecord()],
    [LEGACY, JSON.stringify(assembled())],
    [LEGACY_VERSION, '1'],
    [MANIFEST, JSON.stringify({ schemaVersion: 1, revision: rev })],
    [shardKey(0), stagedRecord(rev, 1)],
    ['unrelated-key', 'keep'],
  ]);
  const cache = harness.load();
  const gen = cache.getMapCacheGeneration();
  cache.getCachedData();
  cache.getStagedMapDetail(rev, 0);
  cache.clearMapCache();
  assert.deepEqual([...harness.values], [['unrelated-key', 'keep']]);
  assert.equal(cache.getCachedData(), null);
  assert.equal(cache.getGModified(), null);
  assert.equal(cache.getStagedMapDetail(rev, 0), null);
  cache.prepareMapDownload(rev, gen);
  assert.equal(cache.setStagedMapDetail(rev, 0, detail(1), gen), false);
  assert.equal(cache.commitCachedMapData(assembled(), 3, gen), false);
  assert.deepEqual([...harness.values], [['unrelated-key', 'keep']]);
});

test('clear failure is reported after invalidating memory and still attempts remaining deletions', () => {
  const rev = revision();
  const harness = createHarness([
    [COMPLETE, completeRecord()],
    [LEGACY, JSON.stringify(assembled())],
    [LEGACY_VERSION, '1'],
    [MANIFEST, JSON.stringify({ schemaVersion: 1, revision: rev })],
    [shardKey(0), stagedRecord(rev, 1)],
  ]);
  harness.failRemove.add(COMPLETE);
  const cache = harness.load();
  const gen = cache.getMapCacheGeneration();
  cache.getCachedData();
  assert.throws(() => cache.clearMapCache(), /Injected deletion failure/);
  assert.equal(cache.isMapCacheGenerationCurrent(gen), false);
  assert.equal(cache.getCachedData(), null);
  assert.equal(cache.getGModified(), null);
  assert.deepEqual([...harness.values.keys()], [COMPLETE]);
  assert.equal(cache.commitCachedMapData(assembled(2), 2, gen), false);
});

test('key enumeration failure still clears known complete keys and invalidates the generation', () => {
  const harness = createHarness([
    [COMPLETE, completeRecord()],
    [LEGACY_VERSION, '1'],
  ]);
  harness.failEnumeration = true;
  const cache = harness.load();
  const gen = cache.getMapCacheGeneration();
  assert.throws(() => cache.clearMapCache(), /Injected key enumeration failure/);
  assert.equal(cache.isMapCacheGenerationCurrent(gen), false);
  assert.equal(harness.values.has(COMPLETE), false);
  assert.equal(harness.values.has(LEGACY_VERSION), false);
});

test('stale revision results cannot overwrite a newer staged download', () => {
  const harness = createHarness();
  const cache = harness.load();
  const gen = cache.getMapCacheGeneration();
  cache.prepareMapDownload(revision(1), gen);
  cache.prepareMapDownload(revision(2), gen);
  assert.equal(cache.setStagedMapDetail(revision(1), 0, detail(1), gen), false);
  assert.equal(harness.values.has(shardKey(0)), false);
  assert.equal(cache.setStagedMapDetail(revision(2), 0, detail(2), gen), true);
});

test('cleanup failure after a complete commit does not turn a valid committed record into failure', () => {
  const harness = createHarness([[LEGACY, JSON.stringify(assembled())]]);
  const cache = harness.load();
  harness.failRemove.add(LEGACY);
  assert.equal(cache.commitCachedMapData(assembled(2), 2, cache.getMapCacheGeneration()), true);
  assert.equal(cache.getGModified(), 2);
  assert.equal(harness.load().getGModified(), 2);
});

test('cache invalidation notifies subscribers synchronously after advancing the generation', () => {
  const harness = createHarness([[COMPLETE, completeRecord()]]);
  const cache = harness.load();
  const before = cache.getMapCacheGeneration();
  const notifications = [];
  const unsubscribe = cache.subscribeMapCacheInvalidation(() => {
    notifications.push(cache.getMapCacheGeneration());
    assert.equal(harness.removals.length, 0, 'subscribers can abort requests before disk cleanup starts');
  });
  cache.clearMapCache();
  assert.deepEqual(notifications, [before + 1]);
  unsubscribe();
  unsubscribe();
  cache.clearMapCache();
  assert.deepEqual(notifications, [before + 1], 'unsubscribed listeners receive no later notifications');
});

test('one failing invalidation listener does not block other subscribers or cache deletion', () => {
  const harness = createHarness([[COMPLETE, completeRecord()]]);
  const cache = harness.load();
  const notifications = [];
  cache.subscribeMapCacheInvalidation(() => {
    notifications.push('failed');
    throw new Error('Injected listener failure');
  });
  cache.subscribeMapCacheInvalidation(() => notifications.push('continued'));
  assert.doesNotThrow(() => cache.clearMapCache());
  assert.deepEqual(notifications, ['failed', 'continued']);
  assert.equal(harness.values.has(COMPLETE), false);
  assert.equal(cache.getCachedData(), null);
});
