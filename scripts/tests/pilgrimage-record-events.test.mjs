import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/store/use-plans.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const point = (completed = false) => ({
  key: '1:station',
  bangumiId: 1,
  pointId: 'station',
  addedAt: 10,
  completed,
  snapshot: { bangumiName: 'Work', pointName: 'Station', geo: [35, 139] },
});
const plan = (id, completed = false) => ({
  id,
  title: id,
  createdAt: 1,
  updatedAt: 10,
  items: [point(completed)],
});

function loadPlans(initialPlans, recordFailure) {
  const events = [];
  const writes = [];
  const alerts = [];
  const modules = {
    '@/lib/plan-storage': {
      getPlans: () => initialPlans,
      getPlanListSortOrder: () => 'desc',
      setPlans: (plans) => writes.push(plans),
    },
    '@/lib/localized-data': { getBangumiTitle: (work) => work.title, getPointTitle: (value) => value.name },
    '@/i18n': { __esModule: true, default: { t: (_, options) => options.defaultValue } },
    '@/services/pilgrimage-records': {
      recordPilgrimageVisit: async (input, at) => {
        events.push({ input, at });
        if (recordFailure) throw recordFailure;
      },
    },
    'react-native': { Alert: { alert: (...args) => alerts.push(args) } },
    zustand: {
      create: (initialize) => {
        let state;
        const setState = (patch) => {
          state = { ...state, ...patch };
        };
        state = initialize(setState, () => state);
        return { getState: () => state, setState };
      },
    },
  };
  const context = vm.createContext({
    exports: {},
    require: (name) => {
      assert.ok(name in modules, `Unexpected module: ${name}`);
      return modules[name];
    },
    console: { ...console, error: () => {} },
  });
  vm.runInContext(compiled, context);
  return { store: context.exports.usePlans, events, writes, alerts };
}

test('existing completion and restored plan state never backfill visits', () => {
  const { store, events } = loadPlans([plan('old', true)]);
  assert.equal(events.length, 0);
  store.setState({ plans: [plan('restored', true)] });
  assert.equal(events.length, 0);
});

test('checking a point records its visit without checking another plan containing the same point', () => {
  const { store, events, writes } = loadPlans([plan('first'), plan('second')]);
  store.getState().togglePoint('first', '1:station');
  assert.equal(store.getState().plans[0].items[0].completed, true);
  assert.equal(store.getState().plans[1].items[0].completed, false);
  assert.equal(writes.length, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].input.key, '1:station');
  assert.equal(events[0].input.snapshot.pointName, 'Station');
  assert.equal('completed' in events[0].input, false);
  assert.equal('planId' in events[0].input, false);
  assert.ok(Number.isSafeInteger(events[0].at));
});

test('unchecking leaves visit history untouched; checking again emits a new user event', () => {
  const { store, events } = loadPlans([plan('first', true)]);
  store.getState().togglePoint('first', '1:station');
  assert.equal(store.getState().plans[0].items[0].completed, false);
  assert.equal(events.length, 0);
  store.getState().togglePoint('first', '1:station');
  assert.equal(events.length, 1);
});

test('importing a plan does not generate visits or copy completion', () => {
  const { store, events } = loadPlans([plan('old', true)]);
  const id = store
    .getState()
    .importPlan('Imported', [
      { bangumi: { id: 1, title: 'Work' }, point: { id: 'station', name: 'Station', geo: [35, 139] } },
    ]);
  const imported = store.getState().plans.find((value) => value.id === id);
  assert.equal(imported.items[0].completed, false);
  assert.equal(events.length, 0);
});

test('record failure preserves a successful plan check and reports that partial result', async () => {
  const { store, events, alerts } = loadPlans([plan('first')], new Error('Storage unavailable'));
  store.getState().togglePoint('first', '1:station');
  await new Promise(setImmediate);
  assert.equal(store.getState().plans[0].items[0].completed, true);
  assert.equal(events.length, 1);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0][1], /已标记当前计划点位完成/);
});

test('missing or removed targets cannot create phantom visits or write plans', () => {
  const { store, events, writes } = loadPlans([plan('first')]);
  store.getState().togglePoint('removed', '1:station');
  store.getState().togglePoint('first', '1:removed');
  assert.equal(events.length, 0);
  assert.equal(writes.length, 0);
});
