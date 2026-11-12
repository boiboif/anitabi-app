import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
function loadSource(path, require = nodeRequire) {
  const source = readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require, setTimeout: () => 1, clearTimeout: () => {} });
  return module.exports;
}

function find(node, type) {
  if (!node || typeof node !== 'object') return;
  if (node.type === type) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, type);
    if (result) return result;
  }
}

// Evaluate HomeScreen's actual element creation and click callback, using real
// Zustand actions. Effects and child/native rendering are outside this test.
function createInteraction() {
  const browse = loadSource('store/use-map-browse.ts').useMapBrowse;
  const filter = loadSource('store/use-map-bangumi-filter.ts').useMapBangumiFilter;
  const asSelector = (store) => Object.assign((selector) => selector(store.getState()), { getState: store.getState });
  const localUpdates = [];
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: {
      useRef: (current) => ({ current }),
      useState: (value) => [value, (next) => localUpdates.push(next)],
      useMemo: (calculate) => calculate(),
      useCallback: (callback) => callback,
      useEffect() {},
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Pressable: 'Pressable', StyleSheet: { create: (value) => value } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
    'expo-router': { useIsFocused: () => true, useNavigation: () => ({ isFocused: () => true }), useRouter: () => ({}) },
    '@tamagui/lucide-icons-2': { Dices: 'Dices' },
    tamagui: { View: 'View', YStack: 'YStack', useTheme: () => ({}) },
    '@/hooks/use-map-locate': { useMapLocate: () => ({}) },
    '@/hooks/use-themed-map-style': { useThemedMapStyle: () => [0, () => {}] },
    '@/lib/constants': loadSource('lib/constants.ts'),
    '@/lib/map-camera': loadSource('lib/map-camera.ts'),
    '@/store/use-map-browse': { useMapBrowse: asSelector(browse) },
    '@/store/use-map-bangumi-filter': { useMapBangumiFilter: asSelector(filter) },
    '@/store/use-map-data': { useMapData: (selector) => selector({ data: null, progress: null, isPartial: false }) },
  };
  const HomeScreen = loadSource('app/(tabs)/index.tsx', (name) => {
    if (name in modules) return modules[name];
    if (name.startsWith('@/components/')) return { __esModule: true, default: name };
    throw new Error(`Unexpected dependency: ${name}`);
  }).default;
  const tree = HomeScreen();
  const map = find(tree, '@/components/map/map-container');
  const gallery = find(tree, '@/components/map/map-viewport-photos');
  assert.ok(map && gallery, 'the homepage wires its map and viewport gallery');
  return { browse, filter, map, select: gallery.props.onSelect, localUpdates };
}

const item = { bangumi: { id: 10 }, point: { id: 'photo', geo: [35.7, 139.8], density: 1 } };

test('the homepage photo click opens the existing point selection without changing filters or zoom', () => {
  const { browse, filter, map, select, localUpdates } = createInteraction();
  browse.getState().openBangumiDetails(10);
  browse.getState().activateBangumiDetailsMap(10);
  browse.getState().openNearbyMapLocation([35, 139]);
  filter.getState().toggleBangumi(10);
  filter.getState().toggleBangumi(20);
  const originalFilter = filter.getState();
  const cameraCommands = [];
  const camera = { zoomLevel: 16.75, heading: 62, pitch: 45 };
  map.props.ref({ setCamera: (command) => { cameraCommands.push(command); Object.assign(camera, command); } });
  localUpdates.length = 0;
  const changes = [];
  browse.subscribe((state) => changes.push(state));

  select(item);

  const state = browse.getState();
  assert.deepEqual({ ...state.selectedMapPoint }, { bangumiId: 10, pointId: 'photo' });
  assert.equal(state.nearbyMapLocation, null);
  assert.equal(state.openedBangumiDetailsId, 10);
  assert.equal(state.filteredBangumiId, 10);
  assert.equal(state.mapCameraRequest, null, 'no parent request/acknowledgement round trip');
  assert.equal(filter.getState(), originalFilter);
  assert.equal(changes.length, 1);
  assert.equal(localUpdates.length, 1);
  assert.deepEqual({ ...localUpdates[0] }, { id: 1, bangumiId: 10, pointId: 'photo', interruption: undefined });
  assert.equal(cameraCommands.length, 0, 'the map decides whether the measured card needs a camera move');
  assert.equal(camera.zoomLevel, 16.75);
  assert.equal(camera.heading, 62);
  assert.equal(camera.pitch, 45);

  browse.getState().focusPointFromNearby({ bangumiId: 10, pointId: 'previous' });
  assert.ok(browse.getState().mapCameraRequest);
  select(item);
  assert.equal(browse.getState().mapCameraRequest, null, 'selection supersedes any pending point fly-to');
  assert.deepEqual({ ...localUpdates[1] }, { id: 2, bangumiId: 10, pointId: 'photo', interruption: undefined }, 'reselecting creates a fresh visibility request');
});

test('a detached camera does not prevent photo selection or create a deferred zoom request', () => {
  const { browse, select } = createInteraction();
  assert.doesNotThrow(() => select(item));
  assert.deepEqual({ ...browse.getState().selectedMapPoint }, { bangumiId: 10, pointId: 'photo' });
  assert.equal(browse.getState().mapCameraRequest, null);
});

// Keep hook state and run the homepage effects so that the test exercises an
// already-dispatched flight, not just a request still waiting in the store.
function createFlightInteraction() {
  const browse = loadSource('store/use-map-browse.ts').useMapBrowse;
  const filter = loadSource('store/use-map-bangumi-filter.ts').useMapBangumiFilter;
  const asSelector = (store) => Object.assign((selector) => selector(store.getState()), { getState: store.getState });
  const work = { id: 10, points: [{ id: 'random', geo: [35, 139], density: 1 }] };
  const data = { data: { bangumis: [work] } };
  const slots = [];
  let cursor = 0;
  let effects = [];
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: {
      useRef(initial) { const index = cursor++; return (slots[index] ??= { current: initial }); },
      useState(initial) {
        const index = cursor++;
        slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
        return [slots[index].value, (next) => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }];
      },
      useMemo: (calculate) => calculate(),
      useCallback: (callback) => callback,
      useEffect: (effect) => effects.push(effect),
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Pressable: 'Pressable', StyleSheet: { create: (value) => value } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
    'expo-router': { useIsFocused: () => true, useNavigation: () => ({ isFocused: () => true }), useRouter: () => ({}) },
    '@tamagui/lucide-icons-2': { Dices: 'Dices' },
    tamagui: { View: 'View', YStack: 'YStack', useTheme: () => ({}) },
    '@/hooks/use-map-locate': { useMapLocate: () => ({}) },
    '@/hooks/use-themed-map-style': { useThemedMapStyle: () => [0, () => {}] },
    '@/lib/constants': loadSource('lib/constants.ts'),
    '@/lib/map-camera': loadSource('lib/map-camera.ts'),
    '@/store/use-map-browse': { useMapBrowse: asSelector(browse) },
    '@/store/use-map-bangumi-filter': { useMapBangumiFilter: asSelector(filter) },
    '@/store/use-map-data': { useMapData: (selector) => selector({ data, progress: null, isPartial: false }) },
  };
  const HomeScreen = loadSource('app/(tabs)/index.tsx', (name) => {
    if (name in modules) return modules[name];
    if (name.startsWith('@/components/')) return { __esModule: true, default: name };
    throw new Error(`Unexpected dependency: ${name}`);
  }).default;
  let tree;
  function render() {
    cursor = 0;
    effects = [];
    tree = HomeScreen();
    for (const effect of effects) effect();
    return tree;
  }
  function findRandom(node) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'function' && node.type.name === 'RandomPointButton') return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const result = findRandom(child);
      if (result) return result;
    }
  }
  render();
  return {
    browse,
    render,
    get map() { return find(tree, '@/components/map/map-container'); },
    get gallery() { return find(tree, '@/components/map/map-viewport-photos'); },
    get random() { return findRandom(tree); },
  };
}

test('clicking a photo interrupts an already-dispatched random flight and supersedes its request', () => {
  const h = createFlightInteraction();
  const cameraCommands = [];
  h.map.props.ref({ setCamera: (command) => cameraCommands.push(command) });
  h.render();
  h.random.props.onPress();
  h.render();
  assert.equal(cameraCommands.length, 1);
  assert.equal(cameraCommands[0].animationMode, 'flyTo');
  assert.equal(h.browse.getState().mapCameraRequest, null, 'request is consumed as soon as flight starts');

  h.gallery.props.onSelect(item);
  h.render();
  assert.equal(cameraCommands.length, 2, 'the running native flight receives an interrupt');
  assert.equal(cameraCommands[1].animationDuration, 0);
  assert.deepEqual({ ...h.browse.getState().selectedMapPoint }, { bangumiId: 10, pointId: 'photo' });
  assert.equal(h.browse.getState().mapCameraRequest, null);
  assert.equal(h.map.props.visibilityRequest.pointId, 'photo', 'the photo still requests card visibility');
  h.render();
  assert.equal(cameraCommands.length, 2, 'the consumed flight is not started again');
});

test('a photo supersedes a random request before the camera is attached', () => {
  const h = createFlightInteraction();
  h.random.props.onPress();
  h.render();
  assert.ok(h.browse.getState().mapCameraRequest);
  h.gallery.props.onSelect(item);
  h.render();
  assert.equal(h.browse.getState().mapCameraRequest, null);
  const cameraCommands = [];
  h.map.props.ref({ setCamera: (command) => cameraCommands.push(command) });
  h.render();
  assert.deepEqual(cameraCommands, [], 'attaching the camera cannot resume the cancelled flight');
  assert.deepEqual({ ...h.browse.getState().selectedMapPoint }, { bangumiId: 10, pointId: 'photo' });
});

test('a normal photo selection does not send an unnecessary camera interrupt', () => {
  const h = createFlightInteraction();
  const cameraCommands = [];
  h.map.props.ref({ setCamera: (command) => cameraCommands.push(command) });
  h.render();
  h.gallery.props.onSelect(item);
  h.render();
  assert.deepEqual(cameraCommands, []);
});

test('quick successive photo selections wait for the same interrupted flight to settle', () => {
  const h = createFlightInteraction();
  const cameraCommands = [];
  h.map.props.ref({ setCamera: (command) => cameraCommands.push(command) });
  h.render();
  h.random.props.onPress();
  h.render();
  h.gallery.props.onSelect(item);
  h.render();
  h.gallery.props.onSelect(item);
  h.render();
  assert.equal(h.map.props.visibilityRequest.pointId, 'photo');
  assert.equal(h.map.props.visibilityRequest.id, 2);
  assert.equal(h.browse.getState().mapCameraRequest, null);
});

test('a photo click after a completed random flight does not issue an interrupt', () => {
  const h = createFlightInteraction();
  const cameraCommands = [];
  h.map.props.ref({ setCamera: (command) => cameraCommands.push(command) });
  h.render();
  h.random.props.onPress();
  h.render();
  h.map.props.onMapIdle();
  h.gallery.props.onSelect(item);
  h.render();
  assert.equal(cameraCommands.length, 1);
  assert.equal(cameraCommands[0].animationMode, 'flyTo');
});

test('a map idle event before the photo selection commits does not block visibility', () => {
  const h = createFlightInteraction();
  const cameraCommands = [];
  h.map.props.ref({ setCamera: (command) => cameraCommands.push(command) });
  h.render();
  h.random.props.onPress();
  h.render();
  h.gallery.props.onSelect(item);
  h.map.props.onMapIdle();
  h.render();
  assert.equal(h.map.props.visibilityRequest.interruption.pending, false);
  assert.equal(h.map.props.visibilityRequest.pointId, 'photo');
});
