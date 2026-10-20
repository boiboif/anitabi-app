import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, beforeEach, test } from 'node:test';

// Exercise the real restoration service and MMKV adapters without native code.
const harness = {
  stores: new Map(),
  publications: [],
  mutations: [],
  failKey: null,
  favorites: { favoritePoints: [], favoriteKeys: new Set() },
  plans: { plans: [], planListSortOrder: 'desc' },
  createMMKV({ id }) {
    const values = new Map();
    this.stores.set(id, values);
    return {
      getString: (key) => values.get(key),
      contains: (key) => values.has(key),
      set: (key, value) => {
        this.mutations.push({ id, key });
        values.set(key, value);
        if (this.failKey === key) {
          this.failKey = null;
          throw new Error('Simulated storage failure after mutation');
        }
      },
      remove: (key) => {
        this.mutations.push({ id, key });
        values.delete(key);
      },
    };
  },
  publish(target, next) {
    this.publications.push({
      target,
      persistedFavorites: this.stores.get('anitabi-favorites').get('favorite-points-v1'),
      persistedPlans: this.stores.get('anitabi-plans').get('itinerary-plans-v1'),
      persistedSort: this.stores.get('anitabi-plans').get('itinerary-plan-list-sort-order-v1'),
    });
    Object.assign(this[target], next);
  },
};
globalThis.__dataBackupRestoreHarness = harness;

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'react-native-mmkv') return { url: 'backup-test:mmkv', shortCircuit: true };
    if (specifier === '@/store/use-favorite-points') return { url: 'backup-test:favorites', shortCircuit: true };
    if (specifier === '@/store/use-plans') return { url: 'backup-test:plans', shortCircuit: true };
    if (specifier.startsWith('@/')) {
      return { url: new URL(`../../src/${specifier.slice(2)}.ts`, import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'backup-test:mmkv') {
      return {
        format: 'module',
        source: 'export const createMMKV = (options) => globalThis.__dataBackupRestoreHarness.createMMKV(options);',
        shortCircuit: true,
      };
    }
    if (url === 'backup-test:favorites' || url === 'backup-test:plans') {
      const target = url === 'backup-test:favorites' ? 'favorites' : 'plans';
      const name = target === 'favorites' ? 'useFavoritePoints' : 'usePlans';
      return {
        format: 'module',
        source: `export const ${name} = {
          getState: () => globalThis.__dataBackupRestoreHarness.${target},
          setState: (next) => globalThis.__dataBackupRestoreHarness.publish('${target}', next),
        };`,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const { getCurrentBackupData, restoreDataBackup } = await import('../../src/lib/restore-data-backup.ts');
const { getFavoritePoints } = await import('../../src/lib/favorite-storage.ts');
const { getPlans, getPlanListSortOrder, initializeDemoPlan } = await import('../../src/lib/plan-storage.ts');

const favorite = {
  key: '1:a',
  bangumiId: 1,
  pointId: 'a',
  addedAt: 100,
  snapshot: { bangumiName: '作品', pointName: '点位' },
};
const plan = {
  id: 'restored-plan',
  title: '巡礼计划',
  description: '保留描述',
  createdAt: 100,
  updatedAt: 200,
  items: [{ ...favorite, completed: true }],
};

beforeEach(() => {
  for (const values of harness.stores.values()) values.clear();
  harness.favorites = { favoritePoints: [], favoriteKeys: new Set() };
  harness.plans = { plans: [], planListSortOrder: 'desc' };
  harness.publications = [];
  harness.mutations = [];
  harness.failKey = null;
});

after(() => {
  hooks.deregister();
  delete globalThis.__dataBackupRestoreHarness;
});

test('restores persisted data before publishing both stores and rebuilding favorite membership', () => {
  const incoming = { favoritePoints: [favorite], plans: [plan], planListSortOrder: 'asc' };
  assert.deepEqual(restoreDataBackup(incoming, 'overwrite'), incoming);
  assert.deepEqual(getCurrentBackupData(), incoming);
  assert.deepEqual(getFavoritePoints(), incoming.favoritePoints);
  assert.deepEqual(getPlans(), incoming.plans);
  assert.equal(getPlanListSortOrder(), 'asc');
  assert.deepEqual([...harness.favorites.favoriteKeys], ['1:a']);
  assert.equal(harness.publications.length, 2);
  for (const publication of harness.publications) {
    assert.deepEqual(JSON.parse(publication.persistedFavorites), incoming.favoritePoints);
    assert.deepEqual(JSON.parse(publication.persistedPlans), incoming.plans);
    assert.equal(publication.persistedSort, 'asc');
  }
});

test('a partial disk failure rolls back existing raw data and publishes no success state', () => {
  const favoriteStorage = harness.stores.get('anitabi-favorites');
  const planStorage = harness.stores.get('anitabi-plans');
  favoriteStorage.set('favorite-points-v1', '[]');
  planStorage.set('itinerary-plans-v1', '[]');
  planStorage.set('itinerary-plan-list-sort-order-v1', 'desc');
  harness.failKey = 'itinerary-plan-list-sort-order-v1';
  assert.throws(
    () => restoreDataBackup({ favoritePoints: [favorite], plans: [plan], planListSortOrder: 'asc' }, 'overwrite'),
    (error) => error.code === 'writeFailed',
  );
  assert.equal(favoriteStorage.get('favorite-points-v1'), '[]');
  assert.equal(planStorage.get('itinerary-plans-v1'), '[]');
  assert.equal(planStorage.get('itinerary-plan-list-sort-order-v1'), 'desc');
  assert.deepEqual(harness.publications, []);
  assert.deepEqual(getCurrentBackupData(), { favoritePoints: [], plans: [], planListSortOrder: 'desc' });
});

test('empty backup overwrite clears persisted and in-memory collections and prevents demo reseeding', () => {
  restoreDataBackup({ favoritePoints: [favorite], plans: [plan], planListSortOrder: 'asc' }, 'overwrite');
  const empty = { favoritePoints: [], plans: [], planListSortOrder: 'desc' };
  restoreDataBackup(empty, 'overwrite');
  assert.deepEqual(getCurrentBackupData(), empty);
  assert.deepEqual(getFavoritePoints(), []);
  assert.deepEqual(getPlans(), []);
  assert.equal(harness.favorites.favoriteKeys.size, 0);
  assert.equal(initializeDemoPlan(plan), null);
  assert.deepEqual(getPlans(), []);
});

test('favorites-only overwrite writes and publishes favorites while keeping plans and their preference intact', () => {
  restoreDataBackup({ favoritePoints: [favorite], plans: [plan], planListSortOrder: 'asc' }, 'overwrite');
  const previousPlans = harness.plans;
  const planStorage = harness.stores.get('anitabi-plans');
  const previousRawPlans = new Map(planStorage);
  harness.publications = [];
  harness.mutations = [];
  harness.failKey = 'itinerary-plans-v1';

  const next = restoreDataBackup({ favoritePoints: [] }, 'overwrite');
  assert.deepEqual(next, { favoritePoints: [], plans: [plan], planListSortOrder: 'asc' });
  assert.deepEqual(getCurrentBackupData(), next);
  assert.deepEqual(getFavoritePoints(), []);
  assert.equal(harness.favorites.favoriteKeys.size, 0);
  assert.strictEqual(harness.plans, previousPlans);
  assert.deepEqual(planStorage, previousRawPlans);
  assert.deepEqual(harness.mutations, [{ id: 'anitabi-favorites', key: 'favorite-points-v1' }]);
  assert.deepEqual(
    harness.publications.map(({ target }) => target),
    ['favorites'],
  );
  assert.equal(harness.failKey, 'itinerary-plans-v1');
});

test('plans-only overwrite writes and publishes plans while preserving favorite data and membership', () => {
  restoreDataBackup({ favoritePoints: [favorite], plans: [plan], planListSortOrder: 'asc' }, 'overwrite');
  const previousFavorites = harness.favorites;
  const previousKeys = harness.favorites.favoriteKeys;
  const favoriteStorage = harness.stores.get('anitabi-favorites');
  const previousRawFavorites = new Map(favoriteStorage);
  harness.publications = [];
  harness.mutations = [];
  harness.failKey = 'favorite-points-v1';

  const next = restoreDataBackup({ plans: [], planListSortOrder: 'desc' }, 'overwrite');
  assert.deepEqual(next, { favoritePoints: [favorite], plans: [], planListSortOrder: 'desc' });
  assert.deepEqual(getCurrentBackupData(), next);
  assert.deepEqual(getPlans(), []);
  assert.equal(getPlanListSortOrder(), 'desc');
  assert.strictEqual(harness.favorites, previousFavorites);
  assert.strictEqual(harness.favorites.favoriteKeys, previousKeys);
  assert.deepEqual(favoriteStorage, previousRawFavorites);
  assert.deepEqual(harness.mutations, [
    { id: 'anitabi-plans', key: 'itinerary-plans-v1' },
    { id: 'anitabi-plans', key: 'itinerary-plan-list-sort-order-v1' },
  ]);
  assert.deepEqual(
    harness.publications.map(({ target }) => target),
    ['plans'],
  );
  assert.equal(harness.failKey, 'favorite-points-v1');
  assert.equal(initializeDemoPlan(plan), null);
});

test('partial imports leave omitted storage keys absent and favorites-only import retains first-install demo behavior', () => {
  restoreDataBackup({ favoritePoints: [favorite] }, 'overwrite');
  const planStorage = harness.stores.get('anitabi-plans');
  assert.equal(planStorage.has('itinerary-plans-v1'), false);
  assert.equal(planStorage.has('itinerary-plan-list-sort-order-v1'), false);
  assert.deepEqual(initializeDemoPlan(plan), plan);
  assert.deepEqual(getPlans(), [plan]);

  const favoriteStorage = harness.stores.get('anitabi-favorites');
  favoriteStorage.clear();
  harness.mutations = [];
  harness.publications = [];
  restoreDataBackup({ plans: [plan], planListSortOrder: 'asc' }, 'overwrite');
  assert.equal(favoriteStorage.has('favorite-points-v1'), false);
  assert.ok(harness.mutations.every(({ id }) => id === 'anitabi-plans'));
  assert.deepEqual(
    harness.publications.map(({ target }) => target),
    ['plans'],
  );
});

test('plans-only merge persists local sort order and publishes only the plans store', () => {
  restoreDataBackup({ favoritePoints: [favorite], plans: [], planListSortOrder: 'asc' }, 'overwrite');
  harness.mutations = [];
  harness.publications = [];
  const next = restoreDataBackup({ plans: [plan], planListSortOrder: 'desc' }, 'merge');
  assert.deepEqual(next, { favoritePoints: [favorite], plans: [plan], planListSortOrder: 'asc' });
  assert.equal(getPlanListSortOrder(), 'asc');
  assert.ok(harness.mutations.every(({ id }) => id === 'anitabi-plans'));
  assert.deepEqual(
    harness.publications.map(({ target }) => target),
    ['plans'],
  );
});

test('failed category-only restore rolls back selected raw values and never writes or publishes the omitted store', () => {
  for (const target of ['favorites', 'plans']) {
    const favoriteStorage = harness.stores.get('anitabi-favorites');
    const planStorage = harness.stores.get('anitabi-plans');
    favoriteStorage.clear();
    planStorage.clear();
    favoriteStorage.set('favorite-points-v1', '[]');
    if (target === 'favorites') planStorage.set('itinerary-plans-v1', '[]');
    const beforeFavorites = new Map(favoriteStorage);
    const beforePlans = new Map(planStorage);
    const beforeState = getCurrentBackupData();
    harness.publications = [];
    harness.mutations = [];
    harness.failKey = target === 'favorites' ? 'favorite-points-v1' : 'itinerary-plan-list-sort-order-v1';
    const incoming =
      target === 'favorites' ? { favoritePoints: [favorite] } : { plans: [plan], planListSortOrder: 'asc' };
    assert.throws(
      () => restoreDataBackup(incoming, 'overwrite'),
      (error) => error.code === 'writeFailed',
    );
    assert.deepEqual(favoriteStorage, beforeFavorites);
    assert.deepEqual(planStorage, beforePlans);
    assert.deepEqual(getCurrentBackupData(), beforeState);
    assert.deepEqual(harness.publications, []);
    assert.ok(harness.mutations.length > 0);
    assert.ok(harness.mutations.every(({ id }) => id === `anitabi-${target}`));
  }
});
