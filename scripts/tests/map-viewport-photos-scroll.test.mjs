import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/components/map/map-viewport-photos.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function makeItem(id, color = '#abcdef') {
  return { bangumi: { id: 10, color }, point: { id, image: id, geo: [35, 139] } };
}

// Evaluate the actual component and PhotoTile props; native layout and image
// rendering are not modelled by this harness.
function renderPhotos(items, { selected = null, inset = 0, opened = null } = {}) {
  const effects = [];
  const layouts = [];
  const selections = [];
  const lookups = [];
  const viewport = { items };
  const bangumis = [{ id: 10 }];
  const browseState = { openedBangumiDetailsId: opened, filteredBangumiId: 10, selectedMapPoint: selected };
  const filterState = { selectedBangumiIds: [10, 20] };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const modules = {
    react: {
      use: () => inset,
      useEffect: (effect) => effects.push(effect),
      useLayoutEffect: (effect) => effects.push(effect),
      useRef: (current) => ({ current }),
      useMemo: (calculate) => calculate(),
      useCallback: (callback) => callback,
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-i18next': { useTranslation: () => ({ i18n: { resolvedLanguage: 'zh-CN' } }) },
    'react-native': {},
    '@shopify/flash-list': { FlashList: 'FlashList' },
    tamagui: { View: 'View', XStack: 'XStack', styled: () => 'Photo' },
    'expo-image': { Image: 'Image' },
    '@/components/app-tab-bar-inset': { AppTabBarInsetContext: {} },
    '@/lib/constants': { MAP_CONTROL_SIZE: 40 },
    '@/lib/localized-data': {
      getBangumiTitle: (bangumi) => String(bangumi.id),
      getPointTitle: (point) => point.id,
    },
    '@/services/handlers': { buildImageUrl: (image) => image },
    '@/store/use-map-browse': {
      useMapBrowse: Object.assign((selector) => selector(browseState), { getState: () => browseState }),
    },
    '@/store/use-map-bangumi-filter': { useMapBangumiFilter: (selector) => selector(filterState) },
    '@/utils/map-viewport-points': {
      findViewportImagePoints: (...args) => { lookups.push(args); return viewport.items; },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
      return modules[name];
    },
  });
  const tree = module.exports.default({
    bangumis,
    viewport,
    onSelect: (item) => selections.push(item),
    onLayoutChange: (layout) => layouts.push(layout),
  });
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'function') {
      visit(node.type(node.props));
      return;
    }
    nodes.push(node);
    visit(node.props?.children);
  }
  visit(tree);
  effects.forEach((effect) => effect());
  const photos = nodes.filter((node) => String(node.props.testID ?? '').startsWith('viewport-photo-'));
  return { tree, nodes, photos, layouts, selections, lookups, bangumis, viewport, filterState };
}

test('the closest five available points are displayed in order without a scroll container', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => makeItem(id));
  const result = renderPhotos(items);
  assert.deepEqual(result.photos.map((node) => node.props.testID), [
    'viewport-photo-10-a', 'viewport-photo-10-b', 'viewport-photo-10-c',
    'viewport-photo-10-d', 'viewport-photo-10-e',
  ]);
  assert.equal(result.nodes.some((node) => ['FlashList', 'FlatList', 'ScrollView'].includes(node.type)), false);
  assert.equal(result.lookups.length, 1);
  assert.equal(result.lookups[0][0], result.bangumis);
  assert.equal(result.lookups[0][1], result.viewport);
  assert.equal(result.lookups[0][2], 10);
  assert.equal(result.lookups[0][3], result.filterState.selectedBangumiIds);

  result.photos[4].props.onPress();
  assert.equal(result.selections.length, 1);
  assert.equal(result.selections[0], items[4]);
});

test('fewer than five images retain five equal-width slots without exposing placeholder controls', () => {
  const result = renderPhotos([makeItem('a'), makeItem('b')]);
  assert.equal(result.photos.length, 2);
  const placeholders = result.nodes.filter((node) => node.type === 'View' && node.props.pointerEvents === 'none');
  assert.equal(placeholders.length, 3);
  for (const slot of [...result.photos, ...placeholders]) {
    assert.equal(slot.props.flex, result.photos[0].props.flex);
    assert.equal(slot.props.aspectRatio, result.photos[0].props.aspectRatio);
  }
  for (const placeholder of placeholders) {
    assert.equal(placeholder.props.accessibilityRole, undefined);
    assert.equal(placeholder.props.onPress, undefined);
  }
});

test('selection does not change the photo border or advertise a selected state', () => {
  const item = makeItem('a', '#123456');
  const before = renderPhotos([item]).photos[0];
  const after = renderPhotos([item], { selected: { bangumiId: 10, pointId: 'a' } }).photos[0];
  assert.equal(before.props.borderColor, '#123456');
  assert.equal(after.props.borderColor, before.props.borderColor);
  assert.equal(after.props.accessibilityState?.selected, undefined);
  assert.equal(after.props.accessibilityRole, 'button');
  assert.equal(after.props.accessibilityLabel, 'a · 10');
});

test('the visible row reports its layout to the card-visibility calculation', () => {
  const result = renderPhotos([makeItem('a')]);
  const layout = { x: 0, y: 42, width: 300, height: 54 };
  assert.equal(typeof result.tree.props.onLayout, 'function');
  result.tree.props.onLayout({ nativeEvent: { layout } });
  assert.equal(result.layouts.at(-1), layout);
});

test('an empty or hidden row reports no obstruction', () => {
  for (const result of [
    renderPhotos([]),
    renderPhotos([makeItem('a')], { inset: null }),
    renderPhotos([makeItem('a')], { opened: 10 }),
  ]) {
    assert.equal(result.tree, null);
    assert.equal(result.layouts.at(-1), null);
  }
});
