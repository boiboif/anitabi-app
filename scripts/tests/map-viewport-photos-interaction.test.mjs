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
  vm.runInNewContext(compiled, { module, exports: module.exports, require });
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
  assert.deepEqual({ ...localUpdates[0] }, { id: 1, bangumiId: 10, pointId: 'photo' });
  assert.equal(cameraCommands.length, 0, 'the map decides whether the measured card needs a camera move');
  assert.equal(camera.zoomLevel, 16.75);
  assert.equal(camera.heading, 62);
  assert.equal(camera.pitch, 45);

  browse.getState().focusPointFromNearby({ bangumiId: 10, pointId: 'previous' });
  assert.ok(browse.getState().mapCameraRequest);
  select(item);
  assert.equal(browse.getState().mapCameraRequest, null, 'selection supersedes any pending point fly-to');
  assert.deepEqual({ ...localUpdates[1] }, { id: 2, bangumiId: 10, pointId: 'photo' }, 'reselecting creates a fresh visibility request');
});

test('a detached camera does not prevent photo selection or create a deferred zoom request', () => {
  const { browse, select } = createInteraction();
  assert.doesNotThrow(() => select(item));
  assert.deepEqual({ ...browse.getState().selectedMapPoint }, { bangumiId: 10, pointId: 'photo' });
  assert.equal(browse.getState().mapCameraRequest, null);
});
