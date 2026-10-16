import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const helperSource = readFileSync(new URL('../../src/utils/plan-point-batches.ts', import.meta.url), 'utf8');
const compiledHelper = ts.transpileModule(helperSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { groupPointsForDetails } = await import(
  `data:text/javascript;base64,${Buffer.from(compiledHelper).toString('base64')}`
);

const storeSource = readFileSync(new URL('../../src/store/use-plans.ts', import.meta.url), 'utf8');
const compiledStore = ts.transpileModule(storeSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function createStore(initialPlans) {
  const writes = [];
  const modules = {
    '@/lib/plan-storage': {
      getPlans: () => initialPlans,
      getPlanListSortOrder: () => 'desc',
      setPlans: (plans) => writes.push(plans),
    },
    '@/lib/localized-data': { getBangumiTitle: (bangumi) => bangumi.title, getPointTitle: (point) => point.name },
    '@/i18n': { default: { t: (_, options) => options.defaultValue } },
    zustand: {
      create: (initialize) => {
        let state;
        state = initialize(
          (patch) => {
            state = { ...state, ...patch };
          },
          () => state,
        );
        return { getState: () => state };
      },
    },
  };
  const context = vm.createContext({ exports: {}, require: (name) => modules[name], console });
  vm.runInContext(compiledStore, context);
  return { store: context.exports.usePlans, writes };
}

const bangumi = (id) => ({ id, title: `Work ${id}` });
const point = (id, extra = {}) => ({ id, name: id, geo: [35, 139], ...extra });
const entry = (id, workId = 1) => ({ point: point(id), bangumi: bangumi(workId) });
const item = (id, extra = {}) => ({
  key: `1:${id}`,
  bangumiId: 1,
  pointId: id,
  addedAt: 10,
  completed: false,
  snapshot: { pointName: id },
  ...extra,
});
const plan = (id, items) => ({ id, title: id, items, createdAt: 1, updatedAt: 10 });

test('batch writes skip existing work-point keys while preserving completion, order and other plans', () => {
  const completed = item('old', { completed: true, snapshot: { pointName: 'Saved name', geo: [1, 2] } });
  const later = item('later');
  const untouched = plan('untouched', [item('old')]);
  const { store, writes } = createStore([plan('a', [completed, later]), plan('b', []), untouched]);
  const result = store
    .getState()
    .addPointsToPlans([entry('old'), entry('new'), entry('new'), entry('old', 2)], ['a', 'a', 'b']);

  assert.equal(result.addedCount, 5);
  assert.equal(result.existingCount, 3);
  assert.equal(result.planCount, 2);
  assert.equal(writes.length, 1, 'all selected plans are persisted in one write');
  const [a, b, other] = store.getState().plans;
  assert.equal(a.items[0], completed);
  assert.equal(a.items[1], later);
  assert.equal(a.items.map((value) => value.key).join(','), '1:old,1:later,1:new,2:old');
  assert.equal(b.items.map((value) => value.key).join(','), '1:old,1:new,2:old');
  assert.equal(
    b.items.every((value) => value.completed === false),
    true,
  );
  assert.equal(other, untouched, 'batch addition never removes entries from unselected plans');
  assert.equal(a.items[2].addedAt, b.items[0].addedAt);
});

test('repeating a batch is a no-op and preserves plan timestamps and state references', () => {
  const { store, writes } = createStore([plan('a', [item('old', { completed: true })])]);
  store.getState().addPointsToPlans([entry('old'), entry('new')], ['a']);
  const previousPlans = store.getState().plans;
  const result = store.getState().addPointsToPlans([entry('new'), entry('old'), entry('new')], ['a']);
  assert.equal(result.addedCount, 0);
  assert.equal(result.existingCount, 3);
  assert.equal(store.getState().plans, previousPlans);
  assert.equal(writes.length, 1);
});

test('empty selections and disappeared plans cannot write or create plans', () => {
  const initialPlans = [plan('a', [])];
  const { store, writes } = createStore(initialPlans);
  for (const [entries, ids] of [
    [[], ['a']],
    [[entry('new')], []],
    [[entry('new')], ['missing']],
  ]) {
    const result = store.getState().addPointsToPlans(entries, ids);
    assert.equal(result.addedCount, 0);
    assert.equal(result.planCount, 0);
  }
  assert.equal(writes.length, 0);
  assert.equal(store.getState().plans, initialPlans);
});

test('single-point plan management still removes deselected memberships while keeping selected completion', () => {
  const completed = item('old', { completed: true });
  const { store, writes } = createStore([plan('a', [completed]), plan('b', [item('old')])]);
  const target = entry('old');
  store.getState().updatePointPlans(target.point, target.bangumi, ['a']);
  assert.equal(store.getState().plans[0].items[0], completed);
  assert.equal(store.getState().plans[1].items.length, 0);
  assert.equal(writes.length, 1);
});

test('batch removal saves once and preserves the remaining order, snapshots, completion and other plans', () => {
  const completed = item('keep', { completed: true, snapshot: { pointName: 'Saved name' } });
  const first = item('first');
  const second = item('second');
  const last = item('last');
  const untouched = plan('other', [item('first')]);
  const { store, writes } = createStore([plan('a', [first, completed, second, last]), untouched]);
  const removed = store.getState().removePoints('a', [second, first, second]);
  assert.equal(removed, 2);
  assert.equal(writes.length, 1);
  assert.equal(store.getState().plans[0].items.length, 2);
  assert.equal(store.getState().plans[0].items[0], completed);
  assert.equal(store.getState().plans[0].items[1], last);
  assert.equal(store.getState().plans[1], untouched);
});

test('batch removal applies to the latest plan and leaves a removed-then-readded point intact', () => {
  const selected = item('selected');
  const kept = item('kept');
  const { store, writes } = createStore([plan('a', [selected, kept])]);
  store.getState().togglePoint('a', '1:kept');
  const latestKept = store.getState().plans[0].items[1];
  store.getState().addPointsToPlans([entry('new')], ['a']);
  store.getState().removePoint('a', selected.key);
  store.getState().addPoint('a', point('selected'), bangumi(1));
  const before = store.getState().plans;
  const previousWrites = writes.length;
  assert.equal(store.getState().removePoints('a', [selected]), 0);
  assert.equal(writes.length, previousWrites);
  assert.equal(store.getState().plans, before);
  assert.equal(store.getState().plans[0].items[0], latestKept);
  assert.equal(latestKept.completed, true);
  assert.equal(store.getState().plans[0].items.length, 3);
});

test('empty, missing and already-removed batch targets do not persist or change timestamps', () => {
  const existing = item('keep');
  const plans = [plan('a', [existing])];
  const { store, writes } = createStore(plans);
  assert.equal(store.getState().removePoints('a', []), 0);
  assert.equal(store.getState().removePoints('missing', [existing]), 0);
  assert.equal(store.getState().removePoints('a', [item('missing')]), 0);
  assert.equal(store.getState().plans, plans);
  assert.equal(writes.length, 0);
});

test('detail groups preserve collection heads and fid precedence, with folder and ungrouped fallbacks', () => {
  const head = point('head', { isFolder: true, name: 'Collection', folder: 'Tokyo' });
  const child = point('child', { fid: 'head', folder: 'Kyoto' });
  const tokyo = point('tokyo', { folder: 'Tokyo' });
  const orphan = point('orphan', { fid: 'missing', folder: 'Kyoto' });
  const loose = point('loose');
  const input = [head, child, tokyo, orphan, loose];
  const groups = groupPointsForDetails(input, 'Ungrouped', 'Unnamed');
  assert.deepEqual(
    groups.map((group) => [group.key, group.data.map((value) => value.id)]),
    [
      ['folder-bangumi', ['loose']],
      ['pilgrimage-head', ['head', 'child']],
      ['folder-Kyoto', ['orphan']],
      ['folder-Tokyo', ['tokyo']],
    ],
  );
  assert.equal(groups[1].data[0], head, 'a collection head remains an addable point as in work details');
  assert.deepEqual(
    groups
      .flatMap((group) => group.data)
      .map((value) => value.id)
      .sort(),
    input.map((value) => value.id).sort(),
  );
});

test('numeric collection names use the established folder/name fallback and empty works stay empty', () => {
  const groups = groupPointsForDetails(
    [point('numeric', { isFolder: true, name: 42, folder: 'Area' }), point('unnamed', { isFolder: true, name: 0 })],
    'Ungrouped',
    'Unnamed',
  );
  assert.deepEqual(
    groups.map((group) => group.title),
    ['Area', 'Unnamed'],
  );
  assert.deepEqual(groupPointsForDetails([], 'Ungrouped', 'Unnamed'), []);
});

test('collections sharing a folder remain separate, matching the existing detail groups for Bocchi the Rock', () => {
  // Grouping fields from work 328609 in assets/data/bangumis-map-data.json.
  const points = [
    point('uqdj3kh28', { isFolder: true, name: '下北沢SHELTER', folder: '下北沢' }),
    point('4yd2vzb5s', { isFolder: true, name: '下北沢駅前', folder: '下北沢' }),
    point('uqdjzo0si', { name: '下北沢SHELTER', fid: 'uqdj3kh28', folder: '下北沢' }),
    point('cpkaq7', { name: '下北沢駅前', fid: '4yd2vzb5s', folder: '下北沢' }),
    point('4yd2vzbuq', { name: 'RAINBOW cafe, dining & bar 下北沢', folder: '下北沢' }),
    point('couqrq', { name: '日本武道館' }),
  ];
  const groups = groupPointsForDetails(points, '孤独摇滚！', '未命名合辑');
  const shelter = groups.find((group) => group.key === 'pilgrimage-uqdj3kh28');
  assert.equal(shelter.title, '下北沢SHELTER');
  assert.deepEqual(
    shelter.data.map((value) => value.id),
    ['uqdj3kh28', 'uqdjzo0si'],
  );
  const station = groups.find((group) => group.key === 'pilgrimage-4yd2vzb5s');
  assert.equal(station.title, '下北沢駅前');
  assert.deepEqual(
    station.data.map((value) => value.id),
    ['4yd2vzb5s', 'cpkaq7'],
  );
  assert.deepEqual(
    groups.find((group) => group.key === 'folder-下北沢').data.map((value) => value.id),
    ['4yd2vzbuq'],
  );
  assert.equal(groups[0].title, '孤独摇滚！', 'ungrouped points use the same work title as the detail view');
  assert.deepEqual(
    groups[0].data.map((value) => value.id),
    ['couqrq'],
  );
  assert.deepEqual(
    groups
      .flatMap((group) => group.data)
      .map((value) => value.id)
      .sort(),
    points.map((value) => value.id).sort(),
  );

  const { store, writes } = createStore([plan('a', [])]);
  const result = store.getState().addPointsToPlans(
    shelter.data.map((value) => ({ point: value, bangumi: bangumi(328609) })),
    ['a'],
  );
  assert.equal(result.addedCount, 2);
  assert.equal(writes.length, 1);
  assert.equal(
    store
      .getState()
      .plans[0].items.map((value) => value.pointId)
      .join(','),
    'uqdj3kh28,uqdjzo0si',
  );
});
