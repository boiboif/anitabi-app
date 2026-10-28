import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as cardListLayout from '../../src/lib/card-list-layout.ts';
import { resolveFavoritePoints } from '../../src/utils/resolve-favorite-points.ts';

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
    require(name) {
      if (name in modules) return modules[name];
      if (name.startsWith('@/components/')) return { default: name.split('/').at(-1) };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  vm.runInContext(compiled, context);
  return context.exports.default;
}

function createHarness(initial = {}, path = '../../src/app/plans/import.tsx') {
  let state = { data, isPartial: false, isRefreshing: false, progress: null, status: 'ready', ...initial };
  const sharedPlan = {
    v: 1,
    t: 'Pending trip',
    i: [
      [1, 'a'],
      [2, 'b'],
    ],
  };
  let pending = sharedPlan;
  const imports = [];
  const favorites = [];
  const routes = [];
  let clears = 0;
  let resolutions = 0;
  const useMapData = Object.assign((select) => select(state), { getState: () => state });
  const savedFavorites = [
    { key: '1:a', bangumiId: 1, pointId: 'a', addedAt: 1, snapshot: { pointName: 'A', bangumiName: 'Work' } },
    { key: '2:b', bangumiId: 2, pointId: 'b', addedAt: 2, snapshot: { pointName: 'B', bangumiName: 'Other work' } },
  ];
  const modules = {
    '@/components/ui/strict-button': { StrictButton: 'Button' },
    '@/components/point/point-list-card': { default: 'PointListCard' },
    '@/store/use-map-data': { useMapData },
    '@/store/use-plan-import': {
      usePlanImport: (select) =>
        select({
          pending,
          source: 'file',
          clear: () => {
            pending = null;
            clears++;
          },
        }),
    },
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
      decodeSharedPlan: () => sharedPlan,
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
      useEffect() {},
      useRef: (current) => ({ current }),
      useState: (initialValue) => [initialValue === 'bangumi' ? 'history' : initialValue, () => {}],
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-i18next': { useTranslation: () => ({ t, i18n: { language: 'en' } }) },
    'expo-router': {
      Stack: { Screen: 'Screen' },
      useLocalSearchParams: () => ({ bangumiId: '2' }),
      useRouter: () => ({ replace: (route) => routes.push(route), navigate() {}, dismissTo() {} }),
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
    render: () => Component(),
    setState: (patch) => {
      state = { ...state, ...patch };
    },
    imports,
    favorites,
    routes,
    get pending() {
      return pending;
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
  assert.equal(harness.clears, 1);
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
