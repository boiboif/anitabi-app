import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
function loadSource(path, require = nodeRequire, globals = {}) {
  const source = readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require, ...globals });
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

function findComponent(node, name) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'function' && node.type.name === name) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = findComponent(child, name);
    if (result) return result;
  }
}

// Evaluate HomeScreen with real Zustand actions. Tests can explicitly rerender
// and run collected effects; child/native rendering is outside this harness.
function createInteraction({ bangumis = null, onLocate = async () => true } = {}) {
  const browse = loadSource('store/use-map-browse.ts').useMapBrowse;
  const filter = loadSource('store/use-map-bangumi-filter.ts').useMapBangumiFilter;
  const asSelector = (store) => Object.assign((selector) => selector(store.getState()), { getState: store.getState });
  const localUpdates = [];
  const events = [];
  let now = 1000;
  let refIndex = 0;
  let stateIndex = 0;
  let effects = [];
  const refs = [];
  const states = [];
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: {
      useRef: (current) => {
        const index = refIndex++;
        return refs[index] ?? (refs[index] = { current });
      },
      useState: (value) => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof value === 'function' ? value() : value;
        return [states[index], (next) => {
          states[index] = typeof next === 'function' ? next(states[index]) : next;
          localUpdates.push(states[index]);
        }];
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
    '@/components/icons': { Dices: 'Dices' },
    tamagui: { View: 'View', YStack: 'YStack', useTheme: () => ({}) },
    '@/hooks/use-map-locate': { useMapLocate: () => ({
      handleLocate: onLocate,
      cancelPendingCameraMovement: () => events.push('cancel-locate'),
      isLocationPuckActive: true,
    }) },
    '@/hooks/use-themed-map-style': { useThemedMapStyle: () => [0, () => {}] },
    '@/lib/constants': loadSource('lib/constants.ts'),
    '@/lib/map-camera': loadSource('lib/map-camera.ts'),
    '@/store/use-map-browse': { useMapBrowse: asSelector(browse) },
    '@/store/use-map-bangumi-filter': { useMapBangumiFilter: asSelector(filter) },
    '@/store/use-map-data': { useMapData: (selector) => selector({ data: bangumis ? { data: { bangumis } } : null, progress: null, isPartial: false }) },
  };
  const require = (name) => {
    if (name in modules) return modules[name];
    if (name.startsWith('@/components/')) return { __esModule: true, default: name };
    throw new Error(`Unexpected dependency: ${name}`);
  };
  modules['@/hooks/use-home-map-locate'] = loadSource('hooks/use-home-map-locate.ts', require);
  const HomeScreen = loadSource('app/(tabs)/index.tsx', require, {
    Date: class extends Date { static now() { return now; } },
    requestIdleCallback: () => 1,
    cancelIdleCallback: () => {},
  }).default;
  const rerender = () => {
    refIndex = 0;
    stateIndex = 0;
    effects = [];
    return HomeScreen();
  };
  const tree = rerender();
  const map = find(tree, '@/components/map/map-container');
  const gallery = find(tree, '@/components/map/map-viewport-photos');
  const buildingSwitch = find(tree, '@/components/map/building-3d-switch');
  assert.ok(map && gallery && buildingSwitch, 'the homepage wires its map, gallery and 3D control');
  return { browse, filter, map, buildingSwitch, select: gallery.props.onSelect, localUpdates, events, rerender,
    runEffects: () => { effects.forEach((effect) => effect()); }, setNow: (value) => { now = value; } };
}

const item = { bangumi: { id: 10 }, point: { id: 'photo', geo: [35.7, 139.8], density: 1 } };

function createLocateInteraction(idle = async () => {}, locate = async () => true) {
  const calls = [];
  const interaction = createInteraction({
    onLocate: async (options) => {
      calls.push(['recenter', options?.resetOrientation]);
      return locate(options);
    },
  });
  interaction.map.props.ref({ setCamera: (command) => calls.push(['camera', structuredClone(command)]) });
  interaction.map.props.locationViewportRef.current = {
    transitionTo: async (state, transition) => {
      calls.push(['follow', structuredClone(state), structuredClone(transition)]);
      return true;
    },
    idle: () => {
      calls.push(['idle']);
      return idle();
    },
  };

  function render() {
    const tree = interaction.rerender();
    interaction.runEffects();
    return {
      map: find(tree, '@/components/map/map-container').props,
      locate: find(tree, '@/components/map/locate-button').props,
      buildings: find(tree, '@/components/map/building-3d-switch').props,
    };
  }

  return {
    calls,
    render,
    async pressLocate() {
      render().locate.onPress();
      await setImmediate();
      return render();
    },
  };
}

test('home locate first recenters, then follows, and releases the viewport before resetting', async () => {
  let finishIdle;
  let finishLocate;
  const nativeIdle = new Promise((resolve) => { finishIdle = resolve; });
  const recenter = new Promise((resolve) => { finishLocate = resolve; });
  const interaction = createLocateInteraction(() => nativeIdle, ({ resetOrientation }) => resetOrientation ? recenter : true);

  assert.equal(interaction.render().locate.mode, 'browse');
  const centered = await interaction.pressLocate();
  assert.equal(centered.locate.mode, 'centered');
  assert.equal(centered.buildings.enabled, false);
  assert.deepEqual(interaction.calls, [['recenter', false]]);

  const following = await interaction.pressLocate();
  assert.equal(following.locate.mode, 'following');
  assert.equal(following.buildings.enabled, true);
  assert.equal(following.map.show3DBuildings, true);
  assert.deepEqual(interaction.calls[1], [
    'follow', { kind: 'followPuck', options: { bearing: 'heading', pitch: 45, zoom: 16 } }, { kind: 'default', maxDurationMs: 500 },
  ]);

  const releasing = await interaction.pressLocate();
  assert.equal(releasing.locate.mode, 'following');
  assert.deepEqual(interaction.calls.slice(2), [['idle']]);
  finishIdle();
  await setImmediate();
  assert.deepEqual(interaction.calls.slice(2), [['idle'], ['recenter', true]]);
  assert.equal(interaction.render().locate.mode, 'following');
  finishLocate(true);
  await setImmediate();
  const reset = interaction.render();
  assert.equal(reset.locate.mode, 'centered');
  assert.equal(reset.buildings.enabled, false);
  assert.equal(reset.map.show3DBuildings, false);
  assert.equal((await interaction.pressLocate()).locate.mode, 'following');
});

test('an unavailable location after turning off follow leaves the button ready to retry the reset', async () => {
  let resetAttempts = 0;
  const interaction = createLocateInteraction(undefined, ({ resetOrientation }) => !resetOrientation || ++resetAttempts > 1);
  await interaction.pressLocate();
  await interaction.pressLocate();

  const failed = await interaction.pressLocate();
  assert.equal(failed.locate.mode, 'browse');
  assert.equal(failed.buildings.enabled, true);

  const retry = await interaction.pressLocate();
  assert.deepEqual(interaction.calls.slice(2), [['idle'], ['recenter', true], ['recenter', true]]);
  assert.equal(retry.locate.mode, 'centered');
  assert.equal(retry.buildings.enabled, false);
});

test('dragging during an explicit reset cancels it and restores the ordinary locate button', async () => {
  let finishLocate;
  const recenter = new Promise((resolve) => { finishLocate = resolve; });
  const interaction = createLocateInteraction(undefined, ({ resetOrientation }) => resetOrientation ? recenter : true);
  await interaction.pressLocate();
  await interaction.pressLocate();
  const resetting = await interaction.pressLocate();

  resetting.map.onCameraGestureStart();
  assert.equal(interaction.render().locate.mode, 'browse');
  finishLocate(true);
  await setImmediate();

  const browsing = interaction.render();
  assert.equal(browsing.locate.mode, 'browse');
  assert.equal(browsing.buildings.enabled, true);
});

test('a home map gesture leaves the 3D view in place until the next locate', async () => {
  const interaction = createLocateInteraction();
  await interaction.pressLocate();
  const following = await interaction.pressLocate();
  following.map.onCameraGestureStart();
  await setImmediate();

  const browsing = interaction.render();
  assert.deepEqual(interaction.calls.slice(2), [['idle']]);
  assert.equal(browsing.locate.mode, 'browse');
  assert.equal(browsing.buildings.enabled, true);
  assert.equal(browsing.map.show3DBuildings, true);

  const centered = await interaction.pressLocate();
  assert.deepEqual(interaction.calls.slice(2), [['idle'], ['recenter', true]]);
  assert.equal(centered.locate.mode, 'centered');
  assert.equal(centered.buildings.enabled, false);
  assert.equal(centered.map.show3DBuildings, false);
});

test('a photo click while the camera is stationary selects without moving the camera', () => {
  const { browse, filter, map, select, localUpdates, events } = createInteraction();
  browse.getState().openBangumiDetails(10);
  browse.getState().activateBangumiDetailsMap(10);
  browse.getState().openNearbyMapLocation([35, 139]);
  filter.getState().toggleBangumi(10);
  filter.getState().toggleBangumi(20);
  const originalFilter = filter.getState();
  const cameraCommands = [];
  map.props.ref({
    flyTo: (...args) => cameraCommands.push(['flyTo', ...args]),
    setCamera: (...args) => cameraCommands.push(['setCamera', ...args]),
  });
  localUpdates.length = 0;
  const changes = [];
  browse.subscribe((state) => { events.push('select'); changes.push(state); });

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
  assert.deepEqual(events, ['cancel-locate', 'select']);
  assert.deepEqual(
    { id: localUpdates[0].id, bangumiId: localUpdates[0].bangumiId, pointId: localUpdates[0].pointId },
    { id: 1, bangumiId: 10, pointId: 'photo' },
  );
  assert.notEqual(localUpdates[0].interruptCamera, true);
  assert.deepEqual(cameraCommands, []);

  browse.getState().focusPointFromNearby({ bangumiId: 10, pointId: 'previous' });
  assert.ok(browse.getState().mapCameraRequest);
  select(item);
  assert.equal(browse.getState().mapCameraRequest, null, 'selection supersedes any pending point fly-to');
  assert.equal(cameraCommands.length, 0, 'a pending, undispatched request is cancelled without a camera move');
  assert.deepEqual(
    { id: localUpdates[1].id, bangumiId: localUpdates[1].bangumiId, pointId: localUpdates[1].pointId },
    { id: 2, bangumiId: 10, pointId: 'photo' },
    'reselecting creates a fresh visibility request',
  );
});

test('a detached camera still cancels pending locate, selects the photo and requests visibility', () => {
  const { browse, map, select, localUpdates, events } = createInteraction();
  map.props.onCameraAnimationStart(1500);
  assert.doesNotThrow(() => select(item));
  assert.deepEqual(events, ['cancel-locate']);
  assert.deepEqual({ ...browse.getState().selectedMapPoint }, { bangumiId: 10, pointId: 'photo' });
  assert.equal(browse.getState().mapCameraRequest, null);
  assert.deepEqual(
    { id: localUpdates[0].id, bangumiId: localUpdates[0].bangumiId, pointId: localUpdates[0].pointId },
    { id: 1, bangumiId: 10, pointId: 'photo' },
  );
});

// This checks command ordering, not actual cancellation in the native SDK.
test('a photo click during camera movement redirects the flight to that photo', () => {
  const { browse, map, select, events, localUpdates } = createInteraction();
  const commands = [];
  map.props.ref({
    setCamera: (command) => {
      events.push('fly');
      commands.push({ ...command, centerCoordinate: Array.from(command.centerCoordinate) });
    },
  });
  map.props.onCameraAnimationStart(1500);
  browse.subscribe(() => events.push('select'));
  select(item);
  assert.deepEqual(events, ['cancel-locate', 'fly', 'select']);
  assert.deepEqual(commands, [{ centerCoordinate: [139.8, 35.7], zoomLevel: 22, animationMode: 'flyTo', animationDuration: 1000 }]);
  const request = localUpdates.at(-1);
  assert.equal(request.interruptCamera, true);
  assert.equal(request.cameraAnimationEndTime, 2000);
  assert.deepEqual({ ...browse.getState().selectedMapPoint }, { bangumiId: 10, pointId: 'photo' });
  assert.equal(browse.getState().mapCameraRequest, null);
});

test('selecting a photo during a 3D building transition redirects its camera movement', () => {
  const { browse, map, buildingSwitch, select } = createInteraction();
  const commands = [];
  map.props.ref({
    setCamera: (command) => commands.push({ ...command,
      ...(command.centerCoordinate && { centerCoordinate: Array.from(command.centerCoordinate) }) }),
  });
  buildingSwitch.props.onChange(true);
  select(item);
  assert.deepEqual(commands, [
    { pitch: 45, animationDuration: 500, animationMode: 'easeTo' },
    { centerCoordinate: [139.8, 35.7], zoomLevel: 22, pitch: 45, animationMode: 'flyTo', animationDuration: 1000 },
  ]);
  assert.deepEqual({ ...browse.getState().selectedMapPoint }, { bangumiId: 10, pointId: 'photo' });
});

test('selecting a photo redirects the actual random-point camera request', () => {
  const randomPoint = { id: 'random', geo: [35, 139], density: 1 };
  const interaction = createInteraction({ bangumis: [{ id: 10, points: [randomPoint] }] });
  const commands = [];
  interaction.map.props.ref({
    setCamera: (command) => commands.push({ ...command, centerCoordinate: Array.from(command.centerCoordinate) }),
  });
  let tree = interaction.rerender();
  interaction.runEffects();
  const randomButton = findComponent(tree, 'RandomPointButton');
  assert.ok(randomButton);
  randomButton.props.onPress();
  tree = interaction.rerender();
  interaction.runEffects();
  const gallery = find(tree, '@/components/map/map-viewport-photos');
  gallery.props.onSelect(item);

  assert.equal(commands.length, 2);
  assert.equal(commands[0].animationMode, 'flyTo');
  assert.equal(commands[0].animationDuration, 1500);
  assert.deepEqual(commands[0].centerCoordinate, [139, 35]);
  assert.deepEqual(commands[1], { centerCoordinate: [139.8, 35.7], zoomLevel: 22, animationMode: 'flyTo', animationDuration: 1000 });
  assert.deepEqual({ ...interaction.browse.getState().selectedMapPoint }, { bangumiId: 10, pointId: 'photo' });
  assert.equal(interaction.browse.getState().mapCameraRequest, null);
});

test('a completed camera animation does not trigger a new flight on photo selection', () => {
  const { map, select, setNow } = createInteraction();
  const commands = [];
  map.props.ref({ flyTo: (...args) => commands.push(args), setCamera: (...args) => commands.push(args) });
  map.props.onCameraAnimationStart(1500);
  setNow(2501);
  select(item);
  assert.deepEqual(commands, []);
});

test('a user gesture clears the running animation marker', () => {
  const { map, select } = createInteraction();
  const commands = [];
  map.props.ref({ flyTo: (...args) => commands.push(args), setCamera: (...args) => commands.push(args) });
  map.props.onCameraAnimationStart(1500);
  map.props.onCameraGestureStart();
  select(item);
  assert.deepEqual(commands, []);
});

test('rapidly selecting different photos redirects to the latest selection', () => {
  const { browse, map, select, localUpdates } = createInteraction();
  const commands = [];
  map.props.ref({ setCamera: (command) => commands.push({ ...command, centerCoordinate: Array.from(command.centerCoordinate) }) });
  map.props.onCameraAnimationStart(1500);
  localUpdates.length = 0;
  select(item);
  const other = { bangumi: { id: 20 }, point: { id: 'next', geo: [36, 140], density: 1 } };
  select(other);
  assert.deepEqual(commands, [
    { centerCoordinate: [139.8, 35.7], zoomLevel: 22, animationMode: 'flyTo', animationDuration: 1000 },
    { centerCoordinate: [140, 36], zoomLevel: 22, animationMode: 'flyTo', animationDuration: 1000 },
  ]);
  assert.deepEqual({ ...browse.getState().selectedMapPoint }, { bangumiId: 20, pointId: 'next' });
  assert.deepEqual(localUpdates.map(({ id, bangumiId, pointId }) => ({ id, bangumiId, pointId })), [
    { id: 1, bangumiId: 10, pointId: 'photo' },
    { id: 2, bangumiId: 20, pointId: 'next' },
  ]);
});

test('redirected photo flights use the existing density-based zoom rule', () => {
  const cases = [
    [undefined, 15], [65, 15], [64, 16], [32, 17], [16, 18],
    [8, 19], [4, 20], [2, 21], [1, 22],
  ];
  for (const [density, expectedZoom] of cases) {
    const { map, select } = createInteraction();
    const commands = [];
    map.props.ref({ setCamera: (command) => commands.push(command) });
    map.props.onCameraAnimationStart(1500);
    select({ ...item, point: { ...item.point, density } });
    assert.equal(commands.length, 1);
    assert.equal(commands[0].zoomLevel, expectedZoom, `density ${density}`);
    assert.equal(commands[0].animationMode, 'flyTo');
  }
});
