import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import dayjs from 'dayjs';

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
    require: (name) => {
      assert.ok(name in modules, `unexpected import: ${name}`);
      return modules[name];
    },
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(compiled, context);
  return context.exports;
}

const jsx = (type, props, key) => ({ type, props, key });
const theme = { primary: { val: 'blue' }, background: { val: 'white' }, color9: { val: 'gray' } };
const tokens = { radius: { 4: { val: 12 } }, space: { 3: { val: 12 } } };
const t = (key, options) => options?.defaultValue ?? key;
const translation = { t, i18n: { resolvedLanguage: 'en', language: 'en' } };
const commonModules = {
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-i18next': { useTranslation: () => translation },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
  tamagui: {
    Spinner: 'Spinner',
    Text: 'Text',
    View: 'View',
    XStack: 'XStack',
    YStack: 'YStack',
    useTheme: () => theme,
    getTokens: () => tokens,
  },
  '@/lib/localized-data': { getBangumiTitle: (bangumi) => bangumi.en || bangumi.title },
};
const cardModules = {
  ...commonModules,
  '@/components/image-preview/previewable-image': { default: 'PreviewableImage' },
  '@/i18n/messages': { getCategoryMessage: () => null, translateMessage: (translate, value) => translate(value.key) },
  '@/services/handlers': { buildImageUrl: (image) => image },
  dayjs: { default: dayjs },
  'react-native': { Pressable: 'Pressable' },
};
const BangumiListCard = loadSource('../../src/components/bangumi/bangumi-list-card.tsx', cardModules).default;
const groups = loadSource('../../src/utils/plan-point-batches.ts', {});
const works = [
  {
    id: 1,
    title: 'Original A',
    en: 'Work A',
    cover: 'https://example.com/cover.jpg',
    city: 'Tokyo',
    cat: 'TV',
    modified: 1,
    points: [
      { id: 'a', folder: 'Station' },
      { id: 'b', folder: 'Park' },
    ],
  },
  { id: 2, title: 'Work B', points: [{ id: 'c', folder: 'Station' }], modified: 2 },
];

function nodes(tree, path = 'root') {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap((child, index) => nodes(child, `${path}.${index}`));
  return [{ ...tree, path }, ...nodes(tree.props?.children, `${path}.children`)];
}

function createHarness(screen = 'browser') {
  let cursor = 0;
  const slots = [];
  const callbacks = [];
  const backListeners = new Set();
  let focused = true;
  let focusEffect;
  let lastFocusEffect;
  let lastFocused;
  let cleanup;
  let removal;
  let tree;
  let dismisses = 0;
  let searchBacks = 0;
  let repeatedRemovals = 0;
  const openedWorks = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[index],
        (next) => {
          slots[index] = typeof next === 'function' ? next(slots[index]) : next;
        },
      ];
    },
    useRef(value) {
      const index = cursor++;
      return (slots[index] ??= { current: value });
    },
    useCallback(callback, dependencies) {
      const index = cursor++;
      const previous = callbacks[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        callbacks[index] = { dependencies, callback };
      }
      return callbacks[index].callback;
    },
    useMemo: (factory) => factory(),
    useEffect: () => {},
  };
  const modules = {
    ...commonModules,
    react,
    '@/components/bangumi/bangumi-list-card': { default: BangumiListCard },
    '@/components/plan/add-point-batch-button': { default: 'AddPointBatchButton' },
    '@/components/ui/strict-button': { StrictButton: 'Button' },
    '@/components/ui/theme-input': { ThemeInput: 'ThemeInput' },
    '@/components/point/point-list-card': { default: 'PointListCard' },
    '@/components/ui/search-box': { default: 'SearchBox' },
    '@/i18n/messages': cardModules['@/i18n/messages'],
    '@/store/use-map-data': {
      useMapData: (select) => select({ data: { data: { bangumis: works } }, status: 'ready' }),
    },
    '@/store/use-map-browse': {
      useMapBrowse: (select) =>
        select({ openBangumiDetails: (id) => openedWorks.push(id), focusPointFromList: () => {} }),
    },
    '@/utils/plan-point-batches': groups,
    '@shopify/flash-list': { FlashList: 'FlashList' },
    '@tamagui/lucide-icons-2': { ChevronLeft: 'ChevronLeft' },
    'expo-router': {
      useIsFocused: () => focused,
      useFocusEffect: (effect) => {
        focusEffect = effect;
      },
      useRouter: () => ({ back: () => searchBacks++ }),
      usePreventRemove: (enabled, callback) => {
        removal = { enabled, callback };
      },
    },
    'react-native': {
      Pressable: 'Pressable',
      Keyboard: { dismiss: () => dismisses++, isVisible: () => false },
      BackHandler: {
        addEventListener(event, listener) {
          assert.equal(event, 'hardwareBackPress');
          backListeners.add(listener);
          return { remove: () => backListeners.delete(listener) };
        },
      },
    },
  };
  const Component = loadSource(
    screen === 'browser' ? '../../src/components/plan/plan-point-batch-browser.tsx' : '../../src/app/search.tsx',
    modules,
  ).default;
  function render() {
    cursor = 0;
    tree = Component({ planId: 'trip' });
    if (focusEffect !== lastFocusEffect || focused !== lastFocused) {
      cleanup?.();
      cleanup = focused ? focusEffect?.() : undefined;
      lastFocusEffect = focusEffect;
      lastFocused = focused;
    }
  }
  render();
  const find = (type) => nodes(tree).find((node) => node.type === type);
  const lists = () => nodes(tree).filter((node) => node.type === 'FlashList');
  return {
    find,
    lists,
    render,
    openedWorks,
    get tree() {
      return tree;
    },
    get dismisses() {
      return dismisses;
    },
    get searchBacks() {
      return searchBacks;
    },
    get repeatedRemovals() {
      return repeatedRemovals;
    },
    get listenerCount() {
      return backListeners.size;
    },
    get preventsRemoval() {
      return removal.enabled;
    },
    search(value) {
      find('ThemeInput').props.onChangeText(value);
      render();
    },
    selectWork(work) {
      const card = nodes(lists()[0].props.renderItem({ item: work })).find((node) => node.type === BangumiListCard);
      card.props.onPress();
      render();
    },
    hardwareBack() {
      const handled = [...backListeners].reverse().some((listener) => listener());
      render();
      return handled;
    },
    removeRoute() {
      const prevented = removal.enabled;
      if (prevented) removal.callback({ repeat: () => repeatedRemovals++ });
      render();
      return prevented;
    },
    setFocused(value) {
      focused = value;
      render();
    },
    unmount() {
      cleanup?.();
    },
  };
}

test('search and the plan browser render the same work card while retaining their own selection action', () => {
  const search = createHarness('search');
  const searchCard = search.lists()[0].props.renderItem({ item: { type: 'bangumi', data: works[0] } });
  assert.equal(searchCard.type, BangumiListCard);
  searchCard.props.onPress();
  assert.deepEqual(search.openedWorks, [1]);
  assert.equal(search.searchBacks, 1);

  const browser = createHarness();
  const browserCard = nodes(browser.lists()[0].props.renderItem({ item: works[0] })).find(
    (node) => node.type === BangumiListCard,
  );
  assert.ok(browserCard);
  browserCard.props.onPress();
  browser.render();
  assert.equal(browser.lists().length, 2);
  assert.equal(browser.dismisses, 1, 'choosing a work dismisses the search keyboard');
});

test('shared work card preserves separate cover preview and work-selection targets', () => {
  let selections = 0;
  const card = BangumiListCard({ bangumi: works[0], onPress: () => selections++ });
  const preview = nodes(card).find((node) => node.type === 'PreviewableImage');
  assert.equal(preview.props.previewUri, works[0].cover);
  assert.equal(preview.props.recyclingKey, '1');
  assert.equal(preview.props.onPress, undefined, 'cover interaction stays with the preview component');
  const selection = nodes(card).find((node) => node.type === 'Pressable');
  assert.equal(selection.props.accessibilityLabel, 'Work A');
  selection.props.onPress();
  assert.equal(selections, 1);
  const texts = nodes(card)
    .filter((node) => node.type === 'Text')
    .map((node) => node.props.children);
  assert.ok(texts.includes('Work A'));
  assert.ok(texts.includes('Original A'));
  assert.ok(texts.includes(2));
});

test('Android back returns to the retained work list and query before allowing a route exit', () => {
  const browser = createHarness();
  assert.equal(browser.hardwareBack(), false);
  browser.search('Work A');
  const originalList = browser.lists()[0];
  browser.selectWork(works[0]);
  const retainedList = browser.lists()[0];
  assert.equal(retainedList.path, originalList.path, 'the work list keeps its React position, rather than remounting');
  assert.equal(retainedList.key, originalList.key);
  assert.equal(browser.find('ThemeInput').props.value, 'Work A');
  const hiddenWorks = nodes(browser.tree).find((node) => node.props?.accessibilityElementsHidden);
  assert.equal(hiddenWorks.props.pointerEvents, 'none');
  assert.equal(hiddenWorks.props.importantForAccessibility, 'no-hide-descendants');
  assert.equal(hiddenWorks.props.display, undefined, 'the hidden list retains its layout size and scroll view');
  const groupList = browser.lists()[1];
  assert.equal(groupList.props.data[0].data, works[0].points, 'all-work addition retains its original entries');
  assert.deepEqual(
    Array.from(groupList.props.data.slice(1), (group) => group.title),
    ['Park', 'Station'],
  );

  assert.equal(browser.hardwareBack(), true);
  assert.equal(browser.lists().length, 1);
  assert.equal(browser.lists()[0].path, originalList.path);
  assert.equal(browser.find('ThemeInput').props.value, 'Work A');
  assert.deepEqual(
    Array.from(browser.lists()[0].props.data, (work) => work.id),
    [1],
  );
  assert.equal(browser.preventsRemoval, false);
  assert.equal(browser.listenerCount, 0);
  assert.equal(browser.hardwareBack(), false);
});

test('native-stack removal returns to work selection once, then allows normal route back', () => {
  const browser = createHarness();
  browser.search('Work');
  browser.selectWork(works[1]);
  assert.equal(browser.preventsRemoval, true);
  assert.equal(browser.removeRoute(), true);
  assert.equal(browser.find('ThemeInput').props.value, 'Work');
  assert.equal(browser.lists().length, 1);
  assert.equal(browser.repeatedRemovals, 0, 'returning to works must not repeat the blocked route exit');
  assert.equal(browser.removeRoute(), false);
});

test('group back handling is limited to the focused screen and cleaned up on unmount', () => {
  const browser = createHarness();
  browser.selectWork(works[0]);
  assert.equal(browser.listenerCount, 1);
  browser.setFocused(false);
  assert.equal(browser.listenerCount, 0);
  assert.equal(browser.preventsRemoval, false);
  browser.setFocused(true);
  assert.equal(browser.listenerCount, 1);
  assert.equal(browser.preventsRemoval, true);
  browser.unmount();
  assert.equal(browser.listenerCount, 0);
});

test('the existing choose-another-work action also retains the query and work list', () => {
  const browser = createHarness();
  browser.search('Work B');
  browser.selectWork(works[1]);
  const header = browser.lists()[1].props.ListHeaderComponent;
  nodes(header)
    .find((node) => node.type === 'Pressable')
    .props.onPress();
  browser.render();
  assert.equal(browser.find('ThemeInput').props.value, 'Work B');
  assert.equal(browser.lists().length, 1);
  assert.equal(browser.listenerCount, 0);
  assert.equal(browser.preventsRemoval, false);
});
