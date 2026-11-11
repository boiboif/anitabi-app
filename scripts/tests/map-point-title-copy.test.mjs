import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function compile(path, modules) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: (name) => {
    if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
    return modules[name];
  } });
  return module.exports;
}

const jsx = (type, props, key) => ({ type, props, key });
const component = (name) => ({ __esModule: true, default: name });
const title = '很长很长的完整本地化巡礼地点名称，不应只复制屏幕截断的部分';

function findAll(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [ ...(predicate(node) ? [node] : []),
    ...[node.props?.children].flat(Infinity).flatMap((child) => findAll(child, predicate)) ];
}

function renderCard(kind, copy, toast) {
  const helper = compile('../../src/lib/copy-to-clipboard.ts', {
    'expo-clipboard': { setStringAsync: copy },
    '@boiboif/react-native-toast': { Toast: { show: toast } },
  });
  const useTranslation = () => ({ t: (key, opts) => opts?.defaultValue ?? key, i18n: { resolvedLanguage: 'zh-CN' } });
  const react = { memo: (value) => value, useState: (value) => [value, () => {}], useCallback: (value) => value, useRef: () => ({ current: null }) };
  const token = { radius: { 2: { val: 2 }, 3: { val: 3 } } };
  const theme = { color9: { val: '#999' }, primary: { val: '#f00' }, color10: { val: '#aaa' } };
  const modules = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react,
    'react-i18next': { useTranslation },
    'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', Linking: { openURL() {} } },
    tamagui: { Text: 'Text', View: 'View', XStack: 'XStack', YStack: 'YStack', getTokens: () => token, useTheme: () => theme, useThemeName: () => 'light' },
    '@tamagui/lucide-icons-2': { CheckCircle2: 'CheckCircle2', ChevronLeft: 'ChevronLeft', ChevronRight: 'ChevronRight', Flag: 'Flag' },
    '@/lib/copy-to-clipboard': helper,
    '@/lib/localized-data': { getPointTitle: (point) => point.localizedName, getBangumiTitle: () => '作品名称' },
    '@/lib/formatDuration': { formatDuration: () => '' },
    '@/services/handlers': { buildImageUrl: (path) => path },
    '@/store/use-map-browse': { useMapBrowse: (selector) => selector({ openBangumiDetails() {}, openedBangumiDetailsId: null }) },
    '@/components/point/favorite-point-button': component('FavoritePointButton'),
    '@/components/point/point-card-actions': component('PointCardActions'),
    '@/components/point/point-image': component('PointImage'),
    '@/components/point/point-navigation-button': component('PointNavigationButton'),
    '@/components/point/point-sequence-badge': component('PointSequenceBadge'),
    '@/components/comparison-camera/comparison-camera-button': component('ComparisonCameraButton'),
    '@/components/ui/swipeable-card-carousel': component('SwipeableCardCarousel'),
  };
  const point = { id: 'point', localizedName: title };
  const bangumi = { id: 1 };
  if (kind === 'popup') {
    const { default: Card } = compile('../../src/components/map/point-popup-card.tsx', modules);
    return Card({ point, bangumi });
  }
  const { default: Card } = compile('../../src/components/plan/plan-map-point-card.tsx', modules);
  const resolved = { point, bangumi, planIndex: 0, item: { key: '1:point', completed: false } };
  const outer = Card({ resolved, previous: null, next: null, total: 1, bottomInset: 0 });
  const carousel = findAll(outer, (node) => node.type === 'SwipeableCardCarousel')[0];
  assert.ok(carousel);
  return carousel.props.current.type(carousel.props.current.props);
}

function pressTitle(tree) {
  const node = findAll(tree, (item) => item.type === 'Text' && item.props.children === title)[0];
  assert.ok(node, 'localized point title is visible');
  assert.equal(node.props.numberOfLines, 1, 'visual truncation remains unchanged');
  assert.equal(typeof node.props.onPress, 'function', 'the title itself can be tapped');
  let stopped = false;
  node.props.onPress({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true, 'tap does not propagate into the map or carousel');
  return node;
}

for (const kind of ['popup', 'plan']) {
  test(`${kind}: point title copies its complete localized value and reports confirmed success`, async () => {
    const copied = [];
    const notices = [];
    let complete;
    const tree = renderCard(kind, (value) => { copied.push(value); return new Promise((resolve) => { complete = resolve; }); }, (value) => notices.push(value));
    const node = pressTitle(tree);
    if (kind === 'plan') assert.equal(node.props.selectable, true, 'the plan title remains selectable');
    assert.deepEqual(copied, [title]);
    assert.deepEqual(notices, [], 'success is not announced before the clipboard confirms it');
    complete(true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(notices, ['copiedToClipboard']);
  });

  test(`${kind}: clipboard failure does not show a success toast`, async () => {
    for (const copy of [async () => false, async () => { throw new Error('clipboard unavailable'); }]) {
      const notices = [];
      pressTitle(renderCard(kind, copy, (value) => notices.push(value)));
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(notices, []);
    }
  });
}
