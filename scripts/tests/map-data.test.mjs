import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, beforeEach, test } from 'node:test';

// Run the real downloader, cache adapter and Zustand actions. Only the network,
// native MMKV module and translations are replaced; no native rendering is simulated.
const harness = {
  scope: 0,
  stores: new Map(),
  source: null,
  indexes: [],
  details: [],
  indexResults: [],
  detailResult: null,
  failWriteKey: null,
  active: 0,
  maxActive: 0,
  createMMKV({ id }) {
    if (!this.stores.has(id)) this.stores.set(id, new Map());
    const values = this.stores.get(id);
    return {
      getString: (key) => values.get(key),
      contains: (key) => values.has(key),
      getAllKeys: () => [...values.keys()],
      set: (key, value) => {
        values.set(key, value);
        if (this.failWriteKey === key) {
          this.failWriteKey = null;
          throw new Error('simulated cache write failure after mutation');
        }
      },
      remove: (key) => values.delete(key),
    };
  },
  async getGJSON(config) {
    this.indexes.push(config);
    const result = this.indexResults.length ? this.indexResults.shift() : this.source.raw;
    if (result instanceof Error) throw result;
    return typeof result === 'function' ? result() : result;
  },
  async getGDetailJSON(index, config) {
    const attempt = this.details.filter((request) => request.index === index).length + 1;
    this.details.push({ index, config, attempt });
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      return this.detailResult ? await this.detailResult(index, attempt) : this.source.detail(index);
    } finally {
      this.active -= 1;
    }
  },
};
globalThis.__mapDataHarness = harness;

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react-native-mmkv') return { url: 'map-data-test:mmkv', shortCircuit: true };
    if (specifier === '@/services/api') return { url: 'map-data-test:api', shortCircuit: true };
    if (specifier === '@/i18n') return { url: 'map-data-test:i18n', shortCircuit: true };
    if (specifier.startsWith('@/')) {
      const url = new URL(`../../src/${specifier.slice(2)}.ts`, import.meta.url);
      url.searchParams.set('map-data-test', String(harness.scope));
      return { url: url.href, shortCircuit: true };
    }
    if (specifier.startsWith('.') && context.parentURL?.startsWith(new URL('../../src/', import.meta.url).href)) {
      const url = new URL(specifier, context.parentURL);
      if (!/\.[^/]+$/.test(url.pathname)) url.pathname += '.ts';
      url.searchParams.set('map-data-test', new URL(context.parentURL).searchParams.get('map-data-test'));
      return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    const common = 'const harness = globalThis.__mapDataHarness;';
    if (url === 'map-data-test:mmkv')
      return {
        format: 'module',
        shortCircuit: true,
        source: `${common} export const createMMKV = (options) => harness.createMMKV(options);`,
      };
    if (url === 'map-data-test:api')
      return {
        format: 'module',
        shortCircuit: true,
        source: `${common}
          export const getGJSON = (config) => harness.getGJSON(config);
          export const getGDetailJSON = (index, config) => harness.getGDetailJSON(index, config);`,
      };
    if (url === 'map-data-test:i18n')
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export default {t: (key, options) => options?.defaultValue ?? key};',
      };
    return next(url, context);
  },
});

function source({ count = 4, batchSize = 2, modified = 100, empty = [] } = {}) {
  const list = Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    return [
      id,
      `作品${id}`,
      '',
      `Work ${id}`,
      '',
      '',
      '',
      0,
      '',
      35,
      139,
      12,
      empty.includes(id) ? 0 : [`p${id}`, 35, 139, 1],
      0,
      0,
      1,
      '',
      0,
    ];
  });
  return {
    raw: [list, batchSize, modified],
    detail(index) {
      return list
        .slice(index * batchSize, (index + 1) * batchSize)
        .map(([id]) => [
          id,
          ['', [], modified, 0, 0],
          empty.includes(id)
            ? []
            : [[`p${id}`, `Point ${id} v${modified}`, 0, 0, 0, 0, '', 0, null, '', '', 0, 0, '', 0]],
          modified,
        ]);
    },
  };
}

function useSource(next) {
  harness.source = next;
  harness.indexes = [];
  harness.details = [];
  harness.indexResults = [];
  harness.detailResult = null;
  harness.active = 0;
  harness.maxActive = 0;
}

async function runtime(t) {
  harness.scope += 1;
  // The downloader's retry backoff runs immediately while its asynchronous order
  // is preserved. Network races below are controlled with explicit promises.
  t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
    queueMicrotask(() => callback(...args));
    return 0;
  });
  const load = (path) => import(new URL(`../../src/${path}.ts?map-data-test=${harness.scope}`, import.meta.url));
  const storage = await load('lib/map-storage');
  const service = await load('services/map-data');
  const { useMapData } = await load('store/use-map-data');
  return { storage, service, store: useMapData };
}

function deferred() {
  let resolve;
  const promise = new Promise((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

async function until(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('expected asynchronous downloader state was not reached');
}

function ids(data) {
  return data.data.bangumis.map(({ id }) => id).sort((left, right) => left - right);
}

function requestsFor(index) {
  return harness.details.filter((request) => request.index === index);
}

function assertComplete(data, count = 4) {
  assert.deepEqual(
    ids(data),
    Array.from({ length: count }, (_, index) => index + 1),
  );
  for (const bangumi of data.data.bangumis) assert.equal(bangumi.points.length, 1);
}

beforeEach(() => {
  harness.stores.clear();
  harness.failWriteKey = null;
  useSource(source());
});

after(() => {
  hooks.deregister();
  delete globalThis.__mapDataHarness;
});

test('retries only the failed shard and commits complete data with quiet, bounded requests', async (t) => {
  const { storage, service } = await runtime(t);
  const progress = [];
  harness.detailResult = (index, attempt) => {
    if (index === 1 && attempt === 1) throw new Error('temporary disconnect');
    return harness.source.detail(index);
  };
  const result = await service.refreshMapData(null, (next) => progress.push(next));
  assertComplete(result.data);
  assert.equal(result.cachePersisted, true);
  assert.deepEqual(storage.getCachedData(), result.data);
  assert.equal(storage.getGModified(), 100);
  assert.equal(requestsFor(0).length, 1);
  assert.equal(requestsFor(1).length, 2);
  assert.equal(harness.indexes.length, 2, 'recheck the index before committing');
  for (const config of [...harness.indexes, ...harness.details.map(({ config }) => config)]) {
    assert.equal(config.suppressErrorToast, true);
    assert.ok(Number.isFinite(config.timeout) && config.timeout > 0);
  }
  assert.equal(harness.indexes[0].bypassCache, true);
  assert.equal(harness.indexes[1].bypassCache, true);
  assert.equal(requestsFor(1)[1].config.bypassCache, true);
  assert.ok(harness.details.every(({ config }) => config.revision === 100));
  const downloading = progress.filter(({ phase }) => phase === 'downloading');
  assert.ok(downloading.every(({ total }) => total === 2));
  assert.deepEqual(
    downloading.map(({ batch }) => batch),
    downloading.map(({ batch }) => batch).sort((a, b) => a - b),
  );
  assert.equal(downloading.at(-1).batch, 2);
  assert.equal(progress.at(-1).phase, 'done');
});

test('exhausted shard retries do not commit incomplete data and a restart downloads only the missing shard', async (t) => {
  const first = await runtime(t);
  const progress = [];
  harness.detailResult = (index) => {
    if (index === 1) throw new Error('offline shard');
    return harness.source.detail(index);
  };
  await assert.rejects(first.service.refreshMapData(null, (next) => progress.push(next)));
  assert.equal(requestsFor(0).length, 1);
  assert.equal(requestsFor(1).length, 3);
  assert.equal(first.storage.getCachedData(), null);
  assert.equal(first.storage.getGModified(), null);
  assert.ok(progress.every(({ phase }) => phase !== 'done'));

  useSource(source());
  const restarted = await runtime(t);
  const result = await restarted.service.refreshMapData(null);
  assertComplete(result.data);
  assert.deepEqual(
    harness.details.map(({ index }) => index),
    [1],
  );
  assert.equal(restarted.storage.getGModified(), 100);
});

test('a failed refresh preserves the previous complete cache without committing unfinished replacement data', async (t) => {
  const { storage, service } = await runtime(t);
  const previous = (await service.refreshMapData(null)).data;
  useSource(source({ modified: 101 }));
  harness.detailResult = (index) => {
    if (index === 1) throw new Error('update shard unavailable');
    return harness.source.detail(index);
  };
  await assert.rejects(service.refreshMapData(previous));
  assert.strictEqual(storage.getCachedData(), previous);
  assert.equal(storage.getGModified(), 100);
});

test('an index revision change during download rejects the mixed snapshot and replaces its staging on retry', async (t) => {
  const { storage, service } = await runtime(t);
  const updated = source({ modified: 101 });
  harness.indexResults = [harness.source.raw, updated.raw];
  await assert.rejects(service.refreshMapData(null));
  assert.equal(storage.getCachedData(), null);
  assert.equal(storage.getGModified(), null);
  useSource(updated);
  const result = await service.refreshMapData(null);
  assertComplete(result.data);
  assert.deepEqual(harness.details.map(({ index }) => index).sort(), [0, 1]);
  for (const bangumi of result.data.data.bangumis) assert.match(bangumi.points[0].name, /v101$/);
});

test('a newer remote revision discards old successful staging instead of mixing versions', async (t) => {
  const { service } = await runtime(t);
  harness.detailResult = (index) => {
    if (index === 1) throw new Error('missing old shard');
    return harness.source.detail(index);
  };
  await assert.rejects(service.refreshMapData(null));
  useSource(source({ modified: 102 }));
  const result = await service.refreshMapData(null);
  assertComplete(result.data);
  assert.deepEqual(harness.details.map(({ index }) => index).sort(), [0, 1]);
  for (const bangumi of result.data.data.bangumis) assert.match(bangumi.points[0].name, /v102$/);
});

test('legacy cache is repaired even at the same revision without treating legitimate empty works as missing shards', async (t) => {
  const { storage, service } = await runtime(t);
  const legacy = { data: { bangumis: [], modified: 100 } };
  const values = harness.stores.get('anitabi-map-cache');
  values.set('assembled-data', JSON.stringify(legacy));
  values.set('g-modified', '100');
  assert.deepEqual(storage.getCachedData(), legacy);
  useSource(source({ empty: [2] }));
  const result = await service.refreshMapData(legacy);
  assert.deepEqual(ids(result.data), [1, 2, 3, 4]);
  assert.deepEqual(result.data.data.bangumis.find(({ id }) => id === 2).points, []);
  assert.deepEqual(harness.details.map(({ index }) => index).sort(), [0, 1]);

  useSource(source({ empty: [2] }));
  const verified = await service.refreshMapData(result.data);
  assert.strictEqual(verified.data, result.data);
  assert.deepEqual(harness.details, [], 'a verified cache with a legitimate empty work remains valid');
});

test('out-of-order shard completion reports completed counts and keeps at most three requests active', async (t) => {
  useSource(source({ count: 7, batchSize: 1 }));
  const { service } = await runtime(t);
  const gates = Array.from({ length: 7 }, () => deferred());
  const progress = [];
  harness.detailResult = async (index) => {
    await gates[index].promise;
    return harness.source.detail(index);
  };
  const pending = service.refreshMapData(null, (next) => progress.push(next));
  await until(() => harness.active === 3);
  assert.ok(harness.active <= 3);
  gates[2].resolve();
  await until(() => progress.some(({ phase, batch }) => phase === 'downloading' && batch === 1));
  for (const gate of gates) gate.resolve();
  const result = await pending;
  assertComplete(result.data, 7);
  assert.ok(harness.maxActive <= 3);
  const completed = progress.filter(({ phase }) => phase === 'downloading').map(({ batch }) => batch);
  assert.deepEqual(
    completed,
    [...completed].sort((a, b) => a - b),
  );
  assert.equal(completed.at(-1), 7);
});

test('clearing the cache invalidates in-flight responses and a later load starts from empty staging', async (t) => {
  const { storage, service } = await runtime(t);
  const gate = deferred();
  harness.detailResult = async (index) => {
    await gate.promise;
    return harness.source.detail(index);
  };
  const pending = service.refreshMapData(null);
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await until(() => harness.active > 0);
  const signals = harness.details.map(({ config }) => config.signal);
  assert.ok(signals.every((signal) => signal instanceof AbortSignal && !signal.aborted));
  storage.clearMapCache();
  assert.ok(
    signals.every((signal) => signal.aborted),
    'clearing the cache actively aborts old HTTP requests',
  );
  gate.resolve();
  await rejected;
  assert.equal(storage.getCachedData(), null);
  assert.equal(storage.getGModified(), null);
  useSource(source());
  const result = await service.refreshMapData(null);
  assertComplete(result.data);
  assert.deepEqual(harness.details.map(({ index }) => index).sort(), [0, 1]);
});

test('late responses from a cleared download cannot overwrite a newer completed generation', async (t) => {
  const { storage, service } = await runtime(t);
  const original = harness.source;
  const gate = deferred();
  harness.detailResult = async (index) => {
    await gate.promise;
    return original.detail(index);
  };
  const previous = service.refreshMapData(null);
  const rejected = assert.rejects(previous, { name: 'AbortError' });
  await until(() => harness.active > 0);
  storage.clearMapCache();
  harness.source = source({ modified: 104 });
  harness.detailResult = null;
  const current = await service.refreshMapData(null);
  assertComplete(current.data);
  gate.resolve();
  await rejected;
  assert.strictEqual(storage.getCachedData(), current.data);
  assert.equal(storage.getGModified(), 104);
  for (const bangumi of storage.getCachedData().data.bangumis) assert.match(bangumi.points[0].name, /v104$/);
});

test('store initialization deduplicates concurrent loads and allows another check after completion', async (t) => {
  const { store } = await runtime(t);
  const gate = deferred();
  harness.detailResult = async (index) => {
    await gate.promise;
    return harness.source.detail(index);
  };
  const first = store.getState().initialize();
  const second = store.getState().initialize();
  await until(() => harness.active > 0);
  assert.equal(harness.indexes.length, 1);
  gate.resolve();
  await Promise.all([first, second]);
  assert.equal(harness.details.length, 2);
  assert.equal(store.getState().status, 'ready');
  assert.equal(store.getState().isPartial, false);
  assert.equal(store.getState().error, null);
  const indexesBefore = harness.indexes.length;
  await store.getState().initialize();
  assert.equal(harness.indexes.length, indexesBefore + 1);
  assert.equal(harness.details.length, 2);
});

test('a first-load failure publishes no data while retry fills only the failed shard from persistent staging', async (t) => {
  const { storage, store } = await runtime(t);
  const states = [];
  const unsubscribe = store.subscribe((state) => states.push(state));
  harness.detailResult = (index) => {
    if (index === 1) throw new Error('first-load shard offline');
    return harness.source.detail(index);
  };
  await store.getState().initialize();
  const failed = store.getState();
  assert.equal(failed.status, 'error');
  assert.equal(failed.isPartial, false);
  assert.equal(failed.isRefreshing, false);
  assert.ok(failed.error instanceof Error);
  assert.equal(failed.progress.phase, 'error');
  assert.equal(failed.data, null);
  assert.ok(states.length > 0 && states.every((state) => state.data === null));
  assert.equal(storage.getCachedData(), null);
  useSource(source());
  await store.getState().initialize();
  unsubscribe();
  assertComplete(store.getState().data);
  assert.equal(store.getState().isPartial, false);
  assert.equal(store.getState().error, null);
  assert.equal(store.getState().progress, null);
  assert.deepEqual(
    harness.details.map(({ index }) => index),
    [1],
  );
  assert.equal(
    states.filter((state, index) => state.data !== null && state.data !== states[index - 1]?.data).length,
    1,
  );
});

test('completed shards update progress without publishing data until the complete map is ready', async (t) => {
  const { store } = await runtime(t);
  const gates = [deferred(), deferred()];
  const dataUpdates = [];
  const unsubscribe = store.subscribe((state, previous) => {
    if (state.data !== previous.data) dataUpdates.push(state.data);
  });
  harness.detailResult = async (index) => {
    await gates[index].promise;
    return harness.source.detail(index);
  };
  const pending = store.getState().initialize();
  await until(() => harness.active === 2);
  gates[0].resolve();
  await until(() => store.getState().progress?.batch === 1);
  assert.equal(store.getState().data, null);
  assert.equal(store.getState().status, 'loading');
  assert.equal(store.getState().isPartial, false);
  assert.equal(store.getState().isRefreshing, true);
  assert.deepEqual(dataUpdates, []);
  gates[1].resolve();
  await pending;
  unsubscribe();
  assertComplete(store.getState().data);
  assert.equal(store.getState().status, 'ready');
  assert.equal(dataUpdates.length, 1, 'GeoJSON consumers receive only one complete data update');
  assert.strictEqual(dataUpdates[0], store.getState().data);
});

for (const completedFirst of [false, true]) {
  test(`clearing during the first load ${completedFirst ? 'after one shard' : 'before the first shard'} leaves a recoverable retry state`, async (t) => {
    const { storage, store } = await runtime(t);
    const gates = [deferred(), deferred()];
    harness.detailResult = async (index) => {
      await gates[index].promise;
      return harness.source.detail(index);
    };
    const pending = store.getState().initialize();
    await until(() => harness.active === 2);
    if (completedFirst) {
      gates[0].resolve();
      await until(() => store.getState().progress?.batch === 1);
    }
    assert.equal(store.getState().data, null);
    storage.clearMapCache();
    for (const gate of gates) gate.resolve();
    await pending;
    const cancelled = store.getState();
    assert.equal(cancelled.data, null);
    assert.equal(cancelled.status, 'error');
    assert.equal(cancelled.isRefreshing, false);
    assert.equal(cancelled.isPartial, false);
    assert.equal(cancelled.progress?.phase, 'error', 'the loading badge and inline notice can offer retry');
    assert.ok(cancelled.progress.message);
    assert.ok(cancelled.error instanceof Error);
    assert.equal(storage.getCachedData(), null);

    useSource(source());
    await store.getState().initialize();
    assertComplete(store.getState().data);
    assert.equal(store.getState().isRefreshing, false);
    assert.equal(store.getState().error, null);
    assert.equal(store.getState().progress, null);
    assert.deepEqual(
      harness.details.map(({ index }) => index).sort(),
      [0, 1],
      'explicit cache clear removes staging too',
    );
  });
}

test('a store refresh failure keeps the previous complete map available and exposes the error', async (t) => {
  const { storage, service, store } = await runtime(t);
  const previous = (await service.refreshMapData(null)).data;
  useSource(source({ modified: 103 }));
  harness.detailResult = (index) => {
    if (index === 1) throw new Error('new revision shard offline');
    return harness.source.detail(index);
  };
  await store.getState().initialize();
  const state = store.getState();
  assert.strictEqual(state.data, previous);
  assert.strictEqual(storage.getCachedData(), previous);
  assert.equal(state.status, 'ready');
  assert.equal(state.isPartial, false);
  assert.equal(state.isRefreshing, false);
  assert.ok(state.error instanceof Error);
});

test('a first load with no successful shard reports an error instead of a completed empty map', async (t) => {
  const { store, storage } = await runtime(t);
  harness.detailResult = () => {
    throw new Error('network unavailable');
  };
  await store.getState().initialize();
  const state = store.getState();
  assert.equal(state.data, null);
  assert.equal(state.status, 'error');
  assert.equal(state.isPartial, false);
  assert.equal(state.isRefreshing, false);
  assert.equal(state.progress.phase, 'error');
  assert.ok(state.error instanceof Error);
  assert.equal(storage.getCachedData(), null);
});

test('an old initialize finishing after cache clear cannot publish over a newer successful initialize', async (t) => {
  const { storage, store } = await runtime(t);
  const original = harness.source;
  const gate = deferred();
  harness.detailResult = async (index) => {
    await gate.promise;
    return original.detail(index);
  };
  const previous = store.getState().initialize();
  await until(() => harness.active > 0);
  storage.clearMapCache();
  harness.source = source({ modified: 105 });
  harness.detailResult = null;
  const current = store.getState().initialize();
  assert.notStrictEqual(current, previous, 'a new generation starts its own initialization');
  await current;
  const completed = store.getState();
  assertComplete(completed.data);
  assert.equal(completed.isRefreshing, false);
  assert.equal(completed.isPartial, false);
  assert.equal(completed.error, null);
  assert.equal(completed.progress, null);
  assert.equal(storage.getGModified(), 105);
  for (const bangumi of completed.data.data.bangumis) assert.match(bangumi.points[0].name, /v105$/);

  gate.resolve();
  await previous;
  assert.strictEqual(
    store.getState(),
    completed,
    'the old catch/finally must not publish any state after the new task',
  );
  assert.strictEqual(storage.getCachedData(), completed.data);
  assert.equal(storage.getGModified(), 105);
});

test('a failed complete-cache commit keeps the full network map usable and retries the save from staged shards', async (t) => {
  const { storage, service, store } = await runtime(t);
  const previous = (await service.refreshMapData(null)).data;
  useSource(source({ modified: 106 }));
  harness.failWriteKey = 'assembled-data-v2';
  t.mock.method(console, 'warn', () => {});
  await store.getState().initialize();
  const loaded = store.getState();
  assertComplete(loaded.data);
  for (const bangumi of loaded.data.data.bangumis) assert.match(bangumi.points[0].name, /v106$/);
  assert.equal(loaded.status, 'ready');
  assert.equal(loaded.isPartial, false);
  assert.equal(loaded.isRefreshing, false);
  assert.ok(loaded.error instanceof Error);
  assert.equal(loaded.error.message, 'mapDataCacheSaveFailed');
  assert.deepEqual(loaded.progress, { phase: 'error', message: loaded.error.message });
  assert.strictEqual(storage.getCachedData(), previous);
  assert.equal(storage.getGModified(), 100);
  assert.equal(JSON.parse(harness.stores.get('anitabi-map-cache').get('assembled-data-v2')).remoteModified, 100);

  useSource(source({ modified: 106 }));
  await store.getState().initialize();
  const saved = store.getState();
  assertComplete(saved.data);
  assert.equal(saved.isPartial, false);
  assert.equal(saved.isRefreshing, false);
  assert.equal(saved.error, null);
  assert.equal(saved.progress, null);
  assert.deepEqual(harness.details, [], 'retry reuses every validated shard instead of downloading them again');
  assert.strictEqual(storage.getCachedData(), saved.data);
  assert.equal(storage.getGModified(), 106);
});

test('legacy data remains browsable but unverified after refresh failure until a complete retry succeeds', async (t) => {
  const initial = await runtime(t);
  const legacy = JSON.parse(JSON.stringify((await initial.service.refreshMapData(null)).data));
  for (const bangumi of legacy.data.bangumis) {
    if (bangumi.id >= 3) {
      bangumi.points = [];
      bangumi.modified = 0;
    }
  }
  const values = harness.stores.get('anitabi-map-cache');
  values.clear();
  values.set('assembled-data', JSON.stringify(legacy));
  values.set('g-modified', '100');
  useSource(source());
  const { storage, service, store } = await runtime(t);
  const cached = storage.getCachedData();
  assert.deepEqual(cached, legacy);
  assert.equal(service.isCachedMapDataVerified(), false);
  const states = [];
  const unsubscribe = store.subscribe((state) => states.push(state));
  harness.detailResult = (index) => {
    if (index === 1) throw new Error('legacy repair shard unavailable');
    return harness.source.detail(index);
  };
  await store.getState().initialize();
  unsubscribe();
  const failed = store.getState();
  assert.equal(failed.status, 'ready');
  assert.equal(failed.isPartial, true, 'legacy completeness remains unknown even when its version key matches');
  assert.equal(failed.isRefreshing, false);
  assert.ok(failed.error instanceof Error);
  assert.equal(failed.progress.phase, 'error');
  assert.strictEqual(failed.data, cached);
  assert.deepEqual(ids(failed.data), [1, 2, 3, 4]);
  assert.ok(states.length > 0 && states.every((state) => state.data === cached && state.isPartial));
  assert.equal(service.isCachedMapDataVerified(), false);
  assert.equal(storage.getGModified(), null);

  useSource(source());
  await store.getState().initialize();
  assertComplete(store.getState().data);
  assert.equal(store.getState().isPartial, false);
  assert.equal(store.getState().error, null);
  assert.equal(service.isCachedMapDataVerified(), true);
  assert.deepEqual(
    harness.details.map(({ index }) => index),
    [1],
  );
});

test('a visible legacy map survives cache clear and rejects a later empty index instead of committing an empty map', async (t) => {
  const { storage, service, store } = await runtime(t);
  const legacy = {
    data: {
      modified: 100,
      bangumis: [{ id: 1, geo: [35, 139], modified: 0, points: [], theme: { src: '', ids: [] } }],
    },
  };
  const values = harness.stores.get('anitabi-map-cache');
  values.set('assembled-data', JSON.stringify(legacy));
  values.set('g-modified', '100');
  harness.detailResult = () => {
    throw new Error('legacy verification unavailable');
  };
  await store.getState().initialize();
  const visible = store.getState().data;
  assert.deepEqual(visible, legacy);
  assert.equal(store.getState().isPartial, true);
  storage.clearMapCache();
  assert.strictEqual(store.getState().data, visible);
  assert.equal(storage.getCachedData(), null);

  useSource(source({ count: 0, modified: 107 }));
  await store.getState().initialize();
  const state = store.getState();
  assert.strictEqual(state.data, visible, 'the in-memory legacy map remains the baseline after disk cache clear');
  assert.equal(state.status, 'ready');
  assert.equal(state.isPartial, true);
  assert.equal(state.isRefreshing, false);
  assert.ok(state.error instanceof Error);
  assert.equal(state.progress?.phase, 'error', 'an empty upstream index must leave an actionable retry state');
  assert.equal(storage.getCachedData(), null);
  assert.equal(storage.getGModified(), null);
  assert.equal(service.isCachedMapDataVerified(), false);
  assert.deepEqual(harness.details, []);
});
