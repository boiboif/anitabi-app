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
const jsxRuntime = { jsx, jsxs: jsx };
const colors = compile('../../src/utils/map-text-contrast.ts', {});

function findAll(root, predicate) {
  if (root == null || typeof root !== 'object') return [];
  const children = [root.props?.children].flat(Infinity);
  return [...(predicate(root) ? [root] : []), ...children.flatMap((child) => findAll(child, predicate))];
}

function renderCard(place, scheme = 'light', options = {}) {
  const { default: Card } = compile('../../src/components/map/nearby-point-popup-card.tsx', {
    'react/jsx-runtime': jsxRuntime,
    'react-native': { Pressable: 'Pressable' },
    'react-i18next': { useTranslation: () => ({ t: (key) => key, i18n: { resolvedLanguage: 'zh-CN' } }) },
    'expo-clipboard': { setStringAsync: options.copy ?? (async () => true) },
    '@boiboif/react-native-toast': { Toast: { show: options.toast ?? (() => {}) } },
    tamagui: { Text: 'Text', View: 'View', XStack: 'XStack', YStack: 'YStack',
      useTheme: () => ({ color12: { val: scheme === 'dark' ? '#EEEEEE' : '#111111' }, background: { val: scheme === 'dark' ? '#111111' : '#FFFFFF' } }) },
    '@/components/point/point-image': { __esModule: true, default: 'PointImage' },
    '@/components/point/point-navigation-button': { __esModule: true, default: 'PointNavigationButton' },
    '@/components/map/nearby-place-icon': { __esModule: true, default: 'NearbyPlaceIcon' },
    '@/lib/localized-data': { getBangumiTitle: () => '', getPointTitle: () => '' },
    '@/utils/nearby-points': { formatNearbyDistance: () => '' },
    '@/hooks/use-map-place-color': { useMapPlaceColor: () => options.mapColor ?? null },
    '@/utils/map-text-contrast': colors,
  });
  return Card({ geo: [35, 139], nearbyPoints: [], place, region: options.region ?? null, onPointPress() {} });
}

function text(tree, value) {
  return findAll(tree, (node) => node.type === 'Text' && node.props.children === value)[0];
}

test('card text uses the queried map color, independently of its icon category', () => {
  for (const name of ['police', 'fuel']) {
    const expected = '#3156A7';
    const tree = renderCard({ name: '地点', englishName: 'Place', icon: name, category: 'motorist' }, 'light', { mapColor: expected });
    const primary = text(tree, '地点');
    const english = text(tree, 'Place');
    const icon = findAll(tree, (node) => node.type === 'NearbyPlaceIcon')[0];
    assert.equal(primary.props.style.color, expected);
    assert.equal(english.props.style.color, expected);
    assert.equal(english.props.opacity, undefined, 'do not reduce contrast after adapting the map color');
    assert.equal(icon.props.name, name);
    assert.equal(icon.props.color, expected);
  }
});

test('satellite white and dark map colors adapt to the actual card background', () => {
  for (const [scheme, mapColor, background] of [['light', '#FFFFFF', '#FFFFFF'], ['dark', '#111111', '#111111']]) {
    const tree = renderCard({ name: '地点', englishName: 'Place', icon: 'unknown_beta', fallbackIcon: 'fuel' }, scheme, { mapColor });
    const expected = colors.getReadableMapTextColor(mapColor, background);
    assert.notEqual(expected, mapColor);
    assert.equal(text(tree, '地点').props.style.color, expected);
    assert.equal(text(tree, 'Place').props.style.color, expected);
    const icon = findAll(tree, (node) => node.type === 'NearbyPlaceIcon')[0];
    assert.equal(icon.props.fallbackName, 'fuel');
    assert.equal(icon.props.color, expected);
  }
});

test('the first render uses the prepared sprite color and source together without load callbacks', () => {
  const iconAsset = { source: { nativeRef: 'town-hall' }, width: 16, height: 16, color: '#3156A7' };
  const place = { name: '市政府', icon: 'town-hall', iconAsset };
  const tree = renderCard(place, 'light', { mapColor: '#147A68' });
  assert.equal(text(tree, '市政府').props.style.color, '#3156A7');
  const icon = findAll(tree, (node) => node.type === 'NearbyPlaceIcon')[0];
  assert.equal(icon.props.asset, iconAsset);
  assert.equal(icon.props.onColor, undefined);
  const other = renderCard({ name: '新地点', icon: 'fuel', iconAsset: null }, 'light', { mapColor: '#147A68' });
  assert.equal(text(other, '新地点').props.style.color, '#147A68');
});

test('unknown types use the card theme; an absent name uses coordinates without an icon', () => {
  const tree = renderCard({ name: '地点', englishName: 'Place', icon: 'unknown' });
  assert.equal(text(tree, '地点').props.color, '$color12');
  assert.equal(text(tree, '地点').props.style, undefined);
  assert.equal(text(tree, 'Place').props.color, '$color10');
  assert.equal(text(tree, 'Place').props.opacity, undefined);
  assert.equal(findAll(tree, (node) => node.type === 'NearbyPlaceIcon')[0].props.color, '#111111');

  const noPlace = renderCard(null);
  assert.equal(findAll(noPlace, (node) => node.type === 'NearbyPlaceIcon').length, 0);
  assert.ok(text(noPlace, '139.000000, 35.000000'));
});

function pressForText(tree, value) {
  const targets = findAll(tree, (node) => typeof node.props?.onPress === 'function' && text(node, value));
  assert.ok(targets.length, `No press target for ${value}`);
  return targets.at(-1).props.onPress({ stopPropagation() {} });
}

test('a missing region leaves the navigation row empty and does not replace a place name with coordinates', () => {
  for (const place of [null, { name: '地点' }]) {
    const tree = renderCard(place);
    const navigationRow = findAll(tree, (node) => node.type === 'XStack' &&
      findAll(node, (child) => child.type === 'PointNavigationButton').length > 0)[0];
    assert.ok(navigationRow);
    assert.equal(text(navigationRow, '139.000000, 35.000000'), undefined);
    assert.equal(findAll(tree, (node) => node.type === 'Text' && node.props.children === '139.000000, 35.000000').length, place ? 0 : 1);
  }
});

test('a recognized region remains independently selectable beside navigation', () => {
  const tree = renderCard(null, 'light', { region: '日本 三重県' });
  const region = text(tree, '日本 三重県');
  assert.ok(region);
  assert.equal(region.props.selectable, true);
  assert.ok(text(tree, '139.000000, 35.000000'));
});

test('tapping the title, English name or fallback coordinates copies the complete displayed text', async () => {
  const copied = [];
  const notices = [];
  const options = { copy: async (value) => { copied.push(value); return true; }, toast: (value) => notices.push(value) };
  const named = renderCard({ name: '地点', englishName: 'Place' }, 'light', options);
  const unnamed = renderCard(null, 'light', options);
  for (const [tree, value] of [[named, '地点'], [named, 'Place'], [unnamed, '139.000000, 35.000000']]) {
    await pressForText(tree, value);
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.deepEqual(copied, ['地点', 'Place', '139.000000, 35.000000']);
  assert.deepEqual(notices, ['copiedToClipboard', 'copiedToClipboard', 'copiedToClipboard']);
});

test('the success toast only appears after the clipboard confirms the copy', async () => {
  let finishCopy;
  const notices = [];
  const tree = renderCard(null, 'light', {
    copy: () => new Promise((resolve) => { finishCopy = resolve; }),
    toast: (value) => notices.push(value),
  });
  const pending = pressForText(tree, '139.000000, 35.000000');
  assert.deepEqual(notices, []);
  finishCopy(true);
  await pending;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(notices, ['copiedToClipboard']);
});

test('a rejected or unsuccessful clipboard write never reports success', async () => {
  for (const copy of [async () => false, async () => { throw new Error('clipboard unavailable'); }]) {
    const notices = [];
    const tree = renderCard({ name: '地点' }, 'light', { copy, toast: (value) => notices.push(value) });
    await pressForText(tree, '地点');
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(notices, []);
  }
});

function renderIcon(name, fallbackName, asset) {
  const { default: Icon } = compile('../../src/components/map/nearby-place-icon.tsx', {
    'react/jsx-runtime': jsxRuntime,
    tamagui: { View: 'View' },
    'expo-image': { Image: 'Image' },
    '@tamagui/lucide-icons-2': { Bus: 'Bus', Fuel: 'Fuel', Hospital: 'Hospital', School: 'School', Shield: 'Shield', Train: 'Train', Utensils: 'Utensils' },
  });
  return Icon({ name, fallbackName, color: '#123456', asset });
}

test('prepared artwork takes precedence over offline icons; missing artwork keeps a fixed fallback', () => {
  const asset = { source: { nativeRef: 'beta' }, width: 15, height: 15, color: '#123456' };
  const primary = renderIcon('beta', 'fuel', asset);
  assert.equal(primary.props.children.props.source, asset.source);
  assert.equal(renderIcon('unknown', 'fuel', null).type, 'Fuel');
  assert.equal(renderIcon('unknown', 'police', null).type, 'Shield');
  assert.equal(renderIcon('unknown', undefined, null), null);
});
