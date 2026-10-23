import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadSource(path, modules) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const context = vm.createContext({
    exports: {},
    require(name) {
      assert.ok(name in modules, `unexpected import: ${name}`);
      return modules[name];
    },
  });
  vm.runInContext(compiled, context);
  return context.exports;
}

const jsx = (type, props, key) => ({ type, props, key });
const t = (key, options) =>
  (options?.defaultValue ?? key).replace(/\{\{(\w+)\}\}/gu, (_, name) => String(options[name]));
const theme = { primary: { val: 'pink' }, color2: { val: '#eee' }, color8: { val: '#888' } };
const commonModules = {
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-i18next': { useTranslation: () => ({ t }) },
  'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { hairlineWidth: 1 } },
  tamagui: {
    Text: 'Text',
    View: 'View',
    XStack: 'XStack',
    YStack: 'YStack',
    useTheme: () => theme,
    getTokens: () => ({ radius: { 4: { val: 12 } } }),
  },
  '@tamagui/lucide-icons-2': {
    Check: 'Check',
    ListPlus: 'ListPlus',
    Square: 'Square',
    SquareCheckBig: 'SquareCheckBig',
  },
};

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

const work = { id: 1, title: 'Work' };
const point = (id) => ({ id, name: id, geo: [35, 139] });
const entry = (id, bangumi = work) => ({ point: point(id), bangumi });
const item = (id, completed = false) => ({
  key: `1:${id}`,
  pointId: id,
  bangumiId: 1,
  completed,
  addedAt: 1,
  snapshot: {},
});
const plan = (id, items, createdAt = 1) => ({ id, title: `Plan ${id}`, items, createdAt, updatedAt: 1 });

function createPlans(initialPlans) {
  let state;
  const writes = [];
  const calls = { batch: [], update: [], favorite: [], favorites: [] };
  const store = loadSource('../../src/store/use-plans.ts', {
    '@/lib/plan-storage': {
      getPlans: () => initialPlans,
      getPlanListSortOrder: () => 'desc',
      setPlans: (next) => writes.push(next),
    },
    '@/lib/localized-data': {
      getBangumiTitle: (bangumi) => bangumi.title,
      getPointTitle: (matchedPoint) => matchedPoint.name,
    },
    '@/i18n': { __esModule: true, default: { t } },
    '@/services/pilgrimage-records': { recordPilgrimageVisit: async () => {} },
    'react-native': { Alert: { alert() {} } },
    zustand: {
      create(initialize) {
        state = initialize(
          (patch) => {
            state = { ...state, ...patch };
          },
          () => state,
        );
        return { getState: () => state };
      },
    },
  }).usePlans;
  const actions = {
    addPointsToPlans(entries, ids) {
      calls.batch.push({ entries, ids });
      return state.addPointsToPlans(entries, ids);
    },
    updatePointPlans(matchedPoint, bangumi, ids) {
      calls.update.push({ point: matchedPoint, bangumi, ids });
      return state.updatePointPlans(matchedPoint, bangumi, ids);
    },
  };
  const usePlans = (select) => select({ ...state, ...actions });
  usePlans.getState = store.getState;
  return {
    usePlans,
    calls,
    writes,
    get plans() {
      return state.plans;
    },
    setPlans(plans) {
      state = { ...state, plans };
    },
  };
}

function createButtonHarness(plans) {
  const toasts = [];
  const opened = [];
  const Button = loadSource('../../src/components/plan/add-point-batch-button.tsx', {
    ...commonModules,
    '@/store/use-plans': { usePlans: plans.usePlans },
    '@/components/plan/plan-picker-provider': { usePlanPicker: () => ({ openBatch: (...args) => opened.push(args) }) },
    '@boiboif/react-native-toast': { Toast: { show: (message) => toasts.push(message) } },
  }).default;
  return { render: (props) => Button({ title: 'Group', ...props }), toasts, opened };
}

function buttonState(tree) {
  return {
    disabled: tree.props.disabled,
    accessibilityState: tree.props.accessibilityState,
    label: tree.props.accessibilityLabel,
    text: nodes(tree).find((node) => node.type === 'Text').props.children,
    icon: nodes(tree).find((node) => node.type === 'Check' || node.type === 'ListPlus').type,
  };
}

test('shared and fallback membership produce identical button state for existing, repeated, empty and missing entries', () => {
  const existing = [item('old', true), item('未完', false)];
  const plans = createPlans([plan('trip', existing)]);
  const button = createButtonHarness(plans);
  const keys = new Set(existing.map((matchedItem) => matchedItem.key));
  for (const entries of [
    [],
    [entry('old')],
    [entry('未完')],
    [entry('old'), entry('old')],
    [entry('old'), entry('new')],
  ]) {
    for (const planId of ['trip', 'missing', undefined]) {
      const props = { entries, planId, label: 'Add group' };
      assert.deepEqual(
        buttonState(button.render({ ...props, planPointKeys: keys })),
        buttonState(button.render(props)),
      );
    }
  }
  assert.equal(button.render({ planId: 'trip', entries: [entry('old')], planPointKeys: keys }).props.disabled, true);
  assert.equal(button.render({ planId: 'trip', entries: [entry('new')], planPointKeys: keys }).props.disabled, false);
  assert.equal(button.render({ planId: 'missing', entries: [entry('new')], planPointKeys: keys }).props.disabled, true);
  assert.equal(plans.writes.length, 0);
});

test('a provided membership Set avoids rebuilding from every stored item', () => {
  const plans = createPlans([
    plan('trip', [
      {
        get key() {
          assert.fail('shared membership must not read stored item keys');
        },
      },
    ]),
  ]);
  const button = createButtonHarness(plans);
  const tree = button.render({ planId: 'trip', entries: [entry('old')], planPointKeys: new Set(['1:old']) });
  assert.equal(tree.props.disabled, true);
});

for (const shared of [false, true]) {
  test(`${shared ? 'shared' : 'fallback'} button passes the original batch to the store and persists once`, () => {
    const original = item('old', true);
    const plans = createPlans([plan('trip', [original])]);
    const button = createButtonHarness(plans);
    const entries = [entry('old'), entry('new'), entry('new'), entry('巡礼:点')];
    const props = { planId: 'trip', entries, ...(shared ? { planPointKeys: new Set(['1:old']) } : {}) };
    const tree = button.render(props);
    let stopped = 0;
    tree.props.onPress({ stopPropagation: () => stopped++ });
    assert.equal(stopped, 1);
    assert.equal(plans.calls.batch.length, 1);
    assert.equal(plans.calls.batch[0].entries, entries);
    assert.deepEqual(Array.from(plans.calls.batch[0].ids), ['trip']);
    assert.equal(plans.writes.length, 1);
    assert.deepEqual(
      Array.from(plans.plans[0].items, (matchedItem) => matchedItem.key),
      ['1:old', '1:new', '1:巡礼:点'],
    );
    assert.equal(plans.plans[0].items[0], original);
    assert.equal(original.completed, true);
    assert.deepEqual(button.toasts, ['已向 1 个计划添加 2 个点位，跳过 2 个已有点位']);
    const currentKeys = new Set(plans.plans[0].items.map((matchedItem) => matchedItem.key));
    const updated = button.render({ ...props, ...(shared ? { planPointKeys: currentKeys } : {}) });
    assert.equal(updated.props.disabled, true);
    updated.props.onPress({ stopPropagation() {} });
    assert.equal(plans.calls.batch.length, 1);
    assert.equal(plans.writes.length, 1);
  });
}

test('unavailable and empty batches do not write, while a button without a plan opens the original picker payload', () => {
  const plans = createPlans([]);
  const button = createButtonHarness(plans);
  for (const props of [
    { planId: 'missing', entries: [entry('a')] },
    { planId: 'missing', entries: [] },
  ]) {
    button.render({ ...props, planPointKeys: new Set() }).props.onPress({ stopPropagation() {} });
  }
  assert.equal(plans.writes.length, 0);
  assert.equal(plans.calls.batch.length, 0);
  const entries = [entry('a'), entry('a')];
  button.render({ entries, title: 'Original title', planPointKeys: new Set() }).props.onPress({ stopPropagation() {} });
  assert.equal(button.opened[0][0], entries);
  assert.equal(button.opened[0][1], 'Original title');
  assert.equal(plans.writes.length, 0);
});

function createProviderHarness(initialPlans) {
  const plans = createPlans(initialPlans);
  const slots = [];
  const contexts = [];
  let cursor = 0;
  let tree;
  const react = {
    createContext(value) {
      const context = { value, Provider: Symbol('PlanPickerContext.Provider') };
      contexts.push(context);
      return context;
    },
    use: (context) => context.value,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next) => (slots[index] = typeof next === 'function' ? next(slots[index]) : next)];
    },
    useRef(current) {
      const index = cursor++;
      return (slots[index] ??= { current });
    },
    useCallback: (callback) => callback,
    useMemo: (factory) => factory(),
  };
  const { default: Provider, usePlanPicker } = loadSource('../../src/components/plan/plan-picker-provider.tsx', {
    ...commonModules,
    react,
    '@/components/plan/plan-sort-button': { default: 'PlanSortButton' },
    '@/components/ui/strict-button': { StrictButton: 'Button' },
    '@/components/ui/theme-input': { ThemeInput: 'ThemeInput' },
    '@/store/use-plans': { usePlans: plans.usePlans },
    '@/store/use-favorite-points': {
      useFavoritePoints: (select) =>
        select({
          addFavorite: (...args) => plans.calls.favorite.push(args),
          addFavorites: (...args) => plans.calls.favorites.push(args),
        }),
    },
    '@boiboif/react-native-toast': { Toast: { show() {} } },
    '@lodev09/react-native-true-sheet': { TrueSheet: 'TrueSheet' },
  });
  function render() {
    cursor = 0;
    tree = Provider({ children: 'Content' });
    for (const context of contexts) context.value = tree.props.value;
    return tree;
  }
  render();
  return {
    plans,
    render,
    openBatch(entries) {
      usePlanPicker().openBatch(entries, 'Batch');
      render();
    },
    openSingle(matchedPoint, bangumi) {
      usePlanPicker().open(matchedPoint, bangumi);
      render();
    },
    get rows() {
      return nodes(tree).filter((node) => typeof node.type === 'function' && node.type.name === 'PlanRow');
    },
    togglePlan(title) {
      this.rows.find((row) => row.props.title === title).props.onPress();
      render();
    },
    get submit() {
      const sheet = nodes(tree).find((node) => node.type === 'TrueSheet');
      return nodes(sheet.props.footer).find((node) => node.type === 'Button');
    },
  };
}

function oldDetail(plan, entries) {
  const keys = new Set(entries.map(({ point, bangumi }) => `${bangumi.id}:${point.id}`));
  return t('batchPlanPointCounts', {
    defaultValue: '将新增 {{added}} 个，已包含 {{existing}} 个',
    added: entries.length - plan.items.filter((matchedItem) => keys.has(matchedItem.key)).length,
    existing: plan.items.filter((matchedItem) => keys.has(matchedItem.key)).length,
  });
}

test('provider batch details match the old filters including duplicate keys, Unicode and empty plans', () => {
  const initialPlans = [
    plan('one', [item('old', true), item('old'), item('巡礼:点'), item('outside')], 2),
    plan('two', [], 1),
  ];
  const provider = createProviderHarness(initialPlans);
  const entries = [entry('old'), entry('old'), entry('巡礼:点'), entry('new')];
  provider.openBatch(entries);
  for (const row of provider.rows) {
    const original = initialPlans.find((matchedPlan) => matchedPlan.title === row.props.title);
    assert.equal(row.props.detail, oldDetail(original, entries));
    assert.equal(row.props.count, original.items.length);
    const rendered = row.type(row.props);
    assert.equal(rendered.props.accessibilityState.checked, false);
    assert.ok(nodes(rendered).some((node) => node.type === 'Text' && node.props.children === row.props.detail));
  }
  assert.equal(provider.submit.props.disabled, true);
  provider.togglePlan('Plan one');
  assert.equal(provider.submit.props.disabled, false);
  assert.equal(provider.rows[0].type(provider.rows[0].props).props.accessibilityState.checked, true);
  assert.equal(provider.plans.writes.length, 0);
});

test('provider batch counting reads each stored key once and uses the latest plan data after target switches', () => {
  let reads = 0;
  const countedItems = ['1:old', '1:old', '1:巡礼:点', '1:outside'].map((key) => ({
    get key() {
      reads += 1;
      return key;
    },
  }));
  const provider = createProviderHarness([plan('one', countedItems)]);
  assert.equal(reads, 0, 'a closed picker does not count batch matches');
  const entries = [entry('old'), entry('巡礼:点'), entry('new')];
  provider.openBatch(entries);
  assert.equal(reads, countedItems.length);
  assert.equal(provider.rows[0].props.detail, '将新增 0 个，已包含 3 个');

  const latest = plan('one', [item('new', true), item('outside')]);
  provider.plans.setPlans([latest]);
  provider.render();
  assert.equal(provider.rows[0].props.detail, oldDetail(latest, entries));
  assert.equal(reads, countedItems.length, 'replaced items do not reuse an old membership count');
  provider.openSingle(point('new'), work);
  assert.equal(provider.rows[0].props.detail, undefined);
  assert.equal(provider.rows[0].props.selected, true);
  provider.openBatch([entry('outside')]);
  assert.equal(provider.rows[0].props.detail, oldDetail(latest, [entry('outside')]));
  assert.equal(provider.rows[0].props.selected, false);
  assert.equal(provider.plans.writes.length, 0);
});

test('provider selection passes the original batch once and leaves existing completion and snapshots intact', () => {
  const original = item('old', true);
  const provider = createProviderHarness([plan('one', [original])]);
  const entries = [entry('old'), entry('new'), entry('new')];
  provider.openBatch(entries);
  provider.togglePlan('Plan one');
  const submit = provider.submit.props.onPress;
  submit();
  submit();
  assert.equal(provider.plans.calls.batch.length, 1);
  assert.equal(provider.plans.calls.batch[0].entries, entries);
  assert.deepEqual(Array.from(provider.plans.calls.batch[0].ids), ['one']);
  assert.equal(provider.plans.writes.length, 1);
  assert.equal(provider.plans.plans[0].items[0], original);
  assert.equal(original.completed, true);
  assert.equal(provider.plans.calls.favorites.length, 0);
});
