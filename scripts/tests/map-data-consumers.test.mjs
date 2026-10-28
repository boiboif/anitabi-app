import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as cardListLayout from '../../src/lib/card-list-layout.ts';
import { resolveFavoritePoints } from '../../src/utils/resolve-favorite-points.ts';
import { usePlanImport as planImportStore } from '../../src/store/use-plan-import.ts';

const jsx = (type, props) => ({ type, props });
const t = (key, options) => options?.defaultValue ?? key;
const work = { id: 1, title: 'Work', points: [{ id: 'a', name: 'A', geo: [35, 139] }] };
const data = { data: { bangumis: [work] } };

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

function assertNoExtraStatusNotice(tree) {
  assert.equal(
    nodes(tree).some((node) => /map-data-status-notice|MapDataStatusNotice/.test(String(node.type))),
    false,
    'map-data status banners are restricted to the home screen',
  );
}

function loadSource(path, modules) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: false,
    },
  }).outputText;
  const context = vm.createContext({
    exports: {},
    queueMicrotask,
    require(name) {
      if (name in modules) return modules[name];
      if (name.startsWith('@/components/')) return { default: name.split('/').at(-1) };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  vm.runInContext(compiled, context);
  return context.exports.default;
}

function createHarness(initial = {}, path = '../../src/app/plans/import.tsx', options = {}) {
  let state = { data, isPartial: false, isRefreshing: false, progress: null, status: 'ready', ...initial };
  const sharedPlan = {
    v: 1,
    t: 'Pending trip',
    i: [
      [1, 'a'],
      [2, 'b'],
    ],
  };
  const pending = options.pending === undefined ? sharedPlan : options.pending;
  planImportStore.setState({ pending, source: options.source ?? (pending ? 'file' : null) });
  const imports = [];
  const favorites = [];
  const routes = [];
  const navigationCalls = [];
  const listeners = new Map();
  const effects = [];
  let pendingEffects = [];
  let effectCursor = 0;
  let clears = 0;
  let resolutions = 0;
  const useMapData = Object.assign((select) => select(state), { getState: () => state });
  const clearImport = () => {
    clears++;
    planImportStore.getState().clear();
  };
  const getImportState = () => ({ ...planImportStore.getState(), clear: clearImport });
  const usePlanImport = Object.assign((select) => select(getImportState()), { getState: getImportState });
  const navigate = (method, route) => {
    const { pending: currentPending, source } = planImportStore.getState();
    navigationCalls.push({ method, route, pending: currentPending, source });
    routes.push(route);
  };
  const router = {
    replace: (route) => navigate('replace', route),
    dismissTo: (route) => navigate('dismissTo', route),
    navigate: (route) => navigate('navigate', route),
    back: () => navigate('back'),
  };
  const navigation = {
    addListener(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
      return () => listeners.get(event).delete(listener);
    },
  };
  const savedFavorites = [
    { key: '1:a', bangumiId: 1, pointId: 'a', addedAt: 1, snapshot: { pointName: 'A', bangumiName: 'Work' } },
    { key: '2:b', bangumiId: 2, pointId: 'b', addedAt: 2, snapshot: { pointName: 'B', bangumiName: 'Other work' } },
  ];
  const modules = {
    '@/components/ui/strict-button': { StrictButton: 'Button' },
    '@/components/point/point-list-card': { default: 'PointListCard' },
    '@/store/use-map-data': { useMapData },
    '@/store/use-plan-import': { usePlanImport },
    '@/store/use-plans': {
      usePlans: (select) =>
        select({
          importPlan: (...args) => {
            imports.push(args);
            return 'new-plan';
          },
        }),
    },
    '@/store/use-favorite-points': {
      useFavoritePoints: (select) =>
        select({
          favoritePoints: savedFavorites,
          addFavorites: (points) => favorites.push(points),
          removeFavorite() {},
        }),
    },
    '@/store/use-map-browse': { useMapBrowse: (select) => select({ focusPointFromList() {} }) },
    '@/lib/plan-sharing': {
      decodeSharedPlan: () => {
        if (options.decodeError) throw new Error(options.decodeError);
        return sharedPlan;
      },
      resolveSharedPlan: (_, current) => {
        resolutions++;
        const points = current.data.bangumis.flatMap((bangumi) => bangumi.points.map((point) => ({ bangumi, point })));
        return {
          points,
          missingCount: sharedPlan.i.length - points.length,
          bangumiCount: current.data.bangumis.length,
        };
      },
    },
    '@/utils/resolve-favorite-points': { resolveFavoritePoints },
    '@/lib/card-list-layout': cardListLayout,
    '@/lib/localized-data': { getBangumiTitle: (bangumi) => bangumi.title, getPointTitle: (point) => point.name },
    '@/lib/ui-sizes': { BLOCK_BUTTON_ICON_SIZE: 20 },
    '@/services/handlers': { buildImageUrl: (value) => value },
    '@/tamagui.config': { PageHorizontalInset: 12, BottomTabInset: 0, MaxContentWidth: 800 },
    '@/i18n': { default: { t } },
    '@/i18n/messages': { translateMessage: (translate, message) => translate(message.key, message) },
    react: {
      useMemo: (factory) => factory(),
      useCallback: (callback) => callback,
      useEffect(create, dependencies) {
        const index = effectCursor++;
        const previous = effects[index];
        if (
          previous &&
          dependencies &&
          previous.dependencies &&
          dependencies.length === previous.dependencies.length &&
          dependencies.every((value, offset) => Object.is(value, previous.dependencies[offset]))
        )
          return;
        pendingEffects.push(() => {
          previous?.cleanup?.();
          effects[index] = { create, dependencies, cleanup: create() };
        });
      },
      useRef: (current) => ({ current }),
      useState: (initialValue) => [initialValue === 'bangumi' ? 'history' : initialValue, () => {}],
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-i18next': { useTranslation: () => ({ t, i18n: { language: 'en' } }) },
    'expo-router': {
      Stack: { Screen: 'Screen' },
      useLocalSearchParams: () => options.params ?? { bangumiId: '2' },
      useRouter: () => router,
      useNavigation: () => navigation,
    },
    'expo-image': { Image: 'Image' },
    '@shopify/flash-list': { FlashList: 'FlashList' },
    '@tamagui/lucide-icons-2': {
      AlertCircle: 'AlertCircle',
      Check: 'Check',
      FileDown: 'FileDown',
      MapPinned: 'MapPinned',
      Square: 'Square',
      SquareCheckBig: 'SquareCheckBig',
      MapPin: 'MapPin',
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    'react-native': {
      Pressable: 'Pressable',
      StatusBar: 'StatusBar',
      Platform: { select: (values) => values.android },
      Keyboard: { isVisible: () => false, dismiss() {} },
    },
    tamagui: {
      Spinner: 'Spinner',
      Text: 'Text',
      View: 'View',
      XStack: 'XStack',
      YStack: 'YStack',
      useTheme: () => ({ primary: { val: 'blue' }, pageBackground: { val: 'white' } }),
      getTokens: () => ({ space: { 2: { val: 8 }, 3: { val: 12 } } }),
    },
  };
  const Component = loadSource(path, modules);
  return {
    render() {
      effectCursor = 0;
      pendingEffects = [];
      const tree = Component();
      for (const commit of pendingEffects) commit();
      return tree;
    },
    replayEffects() {
      for (const effect of effects) effect.cleanup?.();
      for (const effect of effects) effect.cleanup = effect.create();
    },
    unmount() {
      for (const effect of effects) effect.cleanup?.();
    },
    emitNavigation(event) {
      for (const listener of [...(listeners.get(event) ?? [])]) listener({ type: event });
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0;
    },
    setPending(next, source) {
      planImportStore.getState().setPending(next, source);
    },
    setState: (patch) => {
      state = { ...state, ...patch };
    },
    imports,
    favorites,
    routes,
    navigationCalls,
    get pending() {
      return planImportStore.getState().pending;
    },
    get source() {
      return planImportStore.getState().source;
    },
    get clears() {
      return clears;
    },
    get resolutions() {
      return resolutions;
    },
  };
}

test('legacy cache awaiting verification keeps the pending plan and does not treat unknown details as missing points', () => {
  const harness = createHarness({ isPartial: true, progress: { phase: 'error', message: 'Retry later' } });
  const tree = harness.render();
  assert.equal(harness.resolutions, 0);
  assertNoExtraStatusNotice(tree);
  assert.ok(
    nodes(tree).some((node) => node.type === 'Spinner'),
    'the existing import loading area remains visible',
  );
  assert.equal(
    nodes(tree).some((node) => node.type === 'Button' && node.props.children === '导入计划'),
    false,
  );
  assert.equal(harness.pending.t, 'Pending trip');
  assert.equal(harness.clears, 0);
  assert.equal(harness.imports.length, 0);
});

test('a complete retry enables import, and a stale confirmation cannot save with unverified legacy data', () => {
  const harness = createHarness({ isPartial: true });
  harness.render();
  const complete = { data: { bangumis: [work, { id: 2, points: [{ id: 'b' }] }] } };
  harness.setState({ data: complete, isPartial: false });
  const tree = harness.render();
  const button = nodes(tree).find((node) => node.type === 'Button' && node.props.children === '导入计划');
  assert.ok(button);
  harness.setState({ isPartial: true });
  button.props.onPress();
  assert.equal(harness.imports.length, 0);
  assert.equal(harness.clears, 0);
  harness.setState({ isPartial: false });
  button.props.onPress();
  assert.equal(harness.imports[0][1].length, 2);
  assert.equal(harness.favorites[0].length, 2);
  assert.equal(harness.pending, null);
  assert.equal(harness.source, null);
  assert.equal(harness.clears, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.navigationCalls)), [
    {
      method: 'replace',
      route: { pathname: '/plans/[planId]', params: { planId: 'new-plan' } },
      pending: null,
      source: null,
    },
  ]);
});

test('cancel clears pending data and its source before dismissing to the plan list', async () => {
  const harness = createHarness();
  const tree = harness.render();
  const cancel = nodes(tree).find((node) => node.type === 'Button' && node.props.children === '取消');
  assert.ok(cancel);
  cancel.props.onPress();
  assert.deepEqual(harness.navigationCalls, [{ method: 'dismissTo', route: '/plan', pending: null, source: null }]);
  assert.equal(harness.pending, null);
  assert.equal(harness.source, null);
  assert.deepEqual(harness.imports, []);
  harness.unmount();
  await Promise.resolve();
});

test('the invalid-link return action clears stale import data and dismisses to the plan list', async () => {
  const harness = createHarness({}, undefined, { params: { data: 'invalid' }, decodeError: 'Invalid plan link' });
  const tree = harness.render();
  const back = nodes(tree).find((node) => node.type === 'Button' && node.props.children === '返回巡礼计划');
  assert.ok(back);
  back.props.onPress();
  assert.deepEqual(harness.navigationCalls, [{ method: 'dismissTo', route: '/plan', pending: null, source: null }]);
  assert.equal(harness.pending, null);
  assert.equal(harness.source, null);
  assert.deepEqual(harness.imports, []);
  harness.unmount();
  await Promise.resolve();
});

test('a cold-start link delegates close to dismissTo with an existing plan-list route', () => {
  const harness = createHarness({}, undefined, { pending: null, params: { data: 'packed-plan' } });
  const tree = harness.render();
  assert.equal(
    harness.listenerCount('removed'),
    0,
    'a link without pending store data needs no pending cleanup listener',
  );
  nodes(tree)
    .find((node) => node.type === 'Button' && node.props.children === '取消')
    .props.onPress();
  assert.deepEqual(harness.navigationCalls, [{ method: 'dismissTo', route: '/plan', pending: null, source: null }]);
  assert.ok(existsSync(new URL('../../src/app/(tabs)/plan/index.tsx', import.meta.url)));
  // Dismiss-to's history lookup and replace fallback belong to Expo Router; this
  // test checks the screen delegates to that API with its real list destination.
});

test('committed native removal clears the import without extra navigation while prevented removal leaves it intact', async () => {
  const harness = createHarness({}, undefined, { source: 'qr' });
  harness.render();
  const pending = harness.pending;
  assert.equal(harness.listenerCount('removed'), 1);
  harness.emitNavigation('removePrevented');
  assert.strictEqual(harness.pending, pending);
  assert.equal(harness.source, 'qr');
  harness.emitNavigation('removed');
  assert.equal(harness.pending, null);
  assert.equal(harness.source, null);
  assert.deepEqual(harness.navigationCalls, [], 'system back and completed gestures own their navigation');
  harness.unmount();
  await Promise.resolve();
});

test('StrictMode effect cleanup and re-setup only detach listeners and never clear an active import', async () => {
  const harness = createHarness();
  harness.render();
  const pending = harness.pending;
  harness.replayEffects();
  await Promise.resolve();
  assert.strictEqual(harness.pending, pending);
  assert.equal(harness.source, 'file');
  assert.equal(harness.clears, 0);
  assert.equal(harness.listenerCount('removed'), 1);
  harness.unmount();
  await Promise.resolve();
  assert.equal(harness.listenerCount('removed'), 0);
  assert.strictEqual(harness.pending, pending);
  assert.equal(harness.clears, 0);
});

test('a removal committed after unmount can clear pending before the deferred unsubscribe runs', async () => {
  const harness = createHarness();
  harness.render();
  harness.unmount();
  assert.equal(harness.listenerCount('removed'), 1);
  harness.emitNavigation('removed');
  assert.equal(harness.pending, null);
  assert.equal(harness.source, null);
  assert.deepEqual(harness.navigationCalls, []);
  await Promise.resolve();
  assert.equal(harness.listenerCount('removed'), 0);
});

test('an old screen removal cannot clear a newer pending import', async () => {
  const harness = createHarness();
  harness.render();
  const newer = { v: 1, t: 'Newer import', i: [[2, 'b']] };
  harness.setPending(newer, 'link');
  harness.emitNavigation('removed');
  assert.strictEqual(harness.pending, newer);
  assert.equal(harness.source, 'link');
  assert.equal(harness.clears, 0);
  assert.deepEqual(harness.navigationCalls, []);
  harness.unmount();
  await Promise.resolve();
});

for (const path of ['../../src/app/search.tsx', '../../src/app/comparison-camera.tsx']) {
  test(`${path}: loading and unverified legacy data do not add a map-data status banner`, () => {
    const harness = createHarness(
      { data: null, status: 'error', progress: { phase: 'error', message: 'Retry at home' } },
      path,
    );
    assertNoExtraStatusNotice(harness.render());
    harness.setState({ data, isPartial: true, status: 'ready' });
    assertNoExtraStatusNotice(harness.render());
  });
}

for (const path of [
  '../../src/app/(tabs)/favorites.tsx',
  '../../src/app/favorites/[bangumiId].tsx',
  '../../src/app/(tabs)/[bangumiId].tsx',
]) {
  test(`${path}: missing legacy details await verification while available cached points remain usable`, () => {
    const harness = createHarness({ isPartial: true }, path);
    const tree = harness.render();
    assertNoExtraStatusNotice(tree);
    const list = nodes(tree).find((node) => node.type === 'FlashList');
    const row = list.props.data.find((item) =>
      path.endsWith('/favorites.tsx')
        ? item.type === 'favorite' && item.item.favorite.bangumiId === 2
        : item.favorite.bangumiId === 2,
    );
    const wrapper = list.props.renderItem({ item: row });
    const card = nodes(wrapper).find((node) => typeof node.type === 'function');
    assert.equal(card.type(card.props).props.meta, 'locationDetailsNotLoaded');
    harness.setState({ isPartial: false });
    assert.equal(card.type(card.props).props.meta, '点位已不可用');
    if (path.endsWith('/favorites.tsx')) {
      const availableRow = list.props.data.find(
        (item) => item.type === 'favorite' && item.item.favorite.bangumiId === 1,
      );
      const availableWrapper = list.props.renderItem({ item: availableRow });
      const availableCard = nodes(availableWrapper).find((node) => typeof node.type === 'function');
      harness.setState({ isPartial: true });
      assert.equal(availableCard.type(availableCard.props).props.disabled, false);
    }
  });
}
