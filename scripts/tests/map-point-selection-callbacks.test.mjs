import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/components/map/map-container.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const visibilitySource = readFileSync(new URL('../../src/utils/map-popup-visibility.ts', import.meta.url), 'utf8');
const visibilityModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(visibilitySource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { module: visibilityModule, exports: visibilityModule.exports });

const work = {
  id: 10,
  points: [
    { id: 'a', geo: [35, 139] },
    { id: 'b', geo: [36, 140] },
    { id: 'c', geo: [37, 141] },
  ],
};
const reference = (pointId) => ({ bangumiId: work.id, pointId });
const screenPoint = { x: 100, y: 100 };
const hitRect = { left: -10, top: -20, right: 10, bottom: 10 };
const plain = (value) => JSON.parse(JSON.stringify(value));

function find(tree, type) {
  if (!tree || typeof tree !== 'object') return;
  if (tree.type === type) return tree;
  for (const child of [tree.props?.children].flat()) {
    const found = find(child, type);
    if (found) return found;
  }
}

function findParent(tree, type) {
  if (!tree || typeof tree !== 'object') return;
  const children = [tree.props?.children].flat();
  if (children.some((child) => child?.type === type)) return tree;
  for (const child of children) {
    const found = findParent(child, type);
    if (found) return found;
  }
}

// Execute the production component with persistent hook slots and separate
// render/layout-commit phases. Native projection is controlled by each test;
// this does not run the React Native renderer or prove device frame rates.
function createHarness(mode = 'plan') {
  let time = 0;
  let nextTimerId = 0;
  const timers = new Map();
  const setTimeout = (callback, delay = 0) => {
    const id = ++nextTimerId;
    timers.set(id, { callback, at: time + delay });
    return id;
  };
  const clearTimeout = (id) => timers.delete(id);
  function advanceTime(ms) {
    const until = time + ms;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      time = timer.at;
      timers.delete(id);
      timer.callback();
    }
    time = until;
  }
  let slots = [];
  let draftSlots;
  let cursor = 0;
  let layoutEffects;
  let props;
  let tree;
  let draft;
  let project = async () => [100, 100];
  let unproject = async (point) => point;
  let query = async () => ({ features: [] });
  let prepareIcon = async () => null;
  let measurePopup = () => {};
  const iconPreparations = [];
  const projected = [];
  const unprojected = [];
  const selected = [];
  const mapPresses = [];
  const browseSelections = [];
  let browseClears = 0;
  let hasMapData = true;
  let nextLocationId = 1;
  const nearbyOpens = [];
  const planNearbyOpens = [];
  const nearbySearches = [];
  let nearbyCandidates = [];
  let browseSelectedBangumiIds = [];
  const browseSubscribers = new Set();
  let browseState = {
    selectedMapPoint: null,
    nearbyMapLocation: null,
    filteredBangumiId: null,
    selectMapPoint: (value) => {
      browseSelections.push(plain(value));
      setBrowseState({ selectedMapPoint: value, nearbyMapLocation: null });
    },
    clearSelectedMapPoint: () => { browseClears++; setBrowseState({ selectedMapPoint: null, nearbyMapLocation: null }); },
    openNearbyMapLocation: (geo, place = null) => {
      const location = { id: nextLocationId++, geo, place };
      nearbyOpens.push(plain(location));
      setBrowseState({ nearbyMapLocation: location, selectedMapPoint: null });
    },
    setNearbyMapPlace: (id, place) => {
      if (browseState.nearbyMapLocation?.id === id) {
        setBrowseState({ nearbyMapLocation: { ...browseState.nearbyMapLocation, place } });
      }
    },
    focusPointFromNearby: () => {},
    openBangumiDetails: () => {},
  };
  function setBrowseState(patch) {
    const previous = browseState;
    browseState = { ...browseState, ...patch };
    for (const listener of browseSubscribers) listener(browseState, previous);
  }
  const useMapBrowse = (selector) => selector(browseState);
  useMapBrowse.getState = () => browseState;
  useMapBrowse.subscribe = (listener) => {
    browseSubscribers.add(listener);
    return () => browseSubscribers.delete(listener);
  };
  const useMapData = () => {};
  useMapData.getState = () => ({ data: hasMapData ? {} : null });
  const sameDeps = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const memo = (calculate, deps) => {
    const index = cursor++;
    if (!sameDeps(draftSlots[index]?.deps, deps)) draftSlots[index] = { value: calculate(), deps };
    return draftSlots[index].value;
  };
  const react = {
    forwardRef: (render) => render,
    useRef(initial) {
      const index = cursor++;
      // Committed refs are deliberately shared with abandoned renders, as in
      // React: writing one during render would leak and fail the draft test.
      return (draftSlots[index] ??= { kind: 'ref', current: initial });
    },
    useState(initial) {
      const index = cursor++;
      draftSlots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [draftSlots[index].value, () => {}];
    },
    useMemo: memo,
    useCallback: (callback, deps) => memo(() => callback, deps),
    useEffect(run, deps) {
      const index = cursor++;
      if (!sameDeps(draftSlots[index]?.deps, deps)) layoutEffects.push({ index, run, deps });
    },
    useLayoutEffect(run, deps) {
      const index = cursor++;
      if (!sameDeps(draftSlots[index]?.deps, deps)) layoutEffects.push({ index, run, deps });
    },
  };
  const jsx = (type, value, key) => ({ type, props: value, key });
  const navigation = { isFocused: () => true };
  const debounce = { run: () => {}, cancel: () => {} };
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { useNavigation: () => navigation, useFocusEffect: () => {} },
    ahooks: { useDebounceFn: () => debounce },
    'react-i18next': { useTranslation: () => ({ i18n: { resolvedLanguage: 'zh-CN' } }) },
    'react-native': { View: 'View' },
    '@/i18n': { resolveLanguageTag: () => 'zh-CN' },
    '@/lib/map-styles': { MAP_STYLES: [{ url: 'fixture', key: 'streets' }, { url: 'dark', key: 'dark' }] },
    '@/lib/constants': { MAP_DEFAULT_ZOOM: 4.6, MAP_COMPASS_TOP_OFFSET: 0 },
    '@/store/use-map-browse': { useMapBrowse },
    '@/store/use-map-data': { useMapData },
    '@/store/use-map-bangumi-filter': { useMapBangumiFilter: (selector) => selector({ selectedBangumiIds: browseSelectedBangumiIds }) },
    '@/services/administrative-region': { observeAdministrativeRegion: () => () => {} },
    '@/services/nearby-place-sprite': {
      preparePlaceIcon: (...args) => { iconPreparations.push(args); return prepareIcon(...args); },
      prefetchPlaceSprite: () => {},
    },
    '@/services/map-text-color': { prefetchMapStyle: () => {} },
    '@/utils/nearby-points': { findNearbyPoints: (...args) => { nearbySearches.push(args); return nearbyCandidates; } },
    '@/utils/map-popup-visibility': visibilityModule.exports,
    '@/utils/plan-point-distances': { isValidCoordinate: (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 },
    '@/components/map/map-marker-selection': { MapMarkerSelectionContext: { Provider: 'Provider' } },
    '@/components/map/map-markers': { __esModule: true, default: 'MapMarkers' },
    '@/components/map/point-image-markers': { __esModule: true, default: 'PointImageMarkers' },
    '@/components/map/bangumi-icons': { __esModule: true, default: 'BangumiIcons' },
    '@/components/map/point-popup-card': { __esModule: true, default: 'PopupCard' },
    '@/components/map/nearby-point-popup-card': { __esModule: true, default: 'NearbyPointPopupCard' },
    '@/components/map/map-selected-point-layers': {
      getSelectedPlanMarkerKey: (bangumiId, pointId, showImage) => `${bangumiId}:${pointId}:${showImage}`,
      SelectedPlanMapPointLayer: 'SelectedPlanMapPointLayer',
      SelectedMapPointLayer: 'SelectedMapPointLayer',
    },
    '@rnmapbox/maps': { MapView: 'MapView', Camera: 'Camera', Images: 'Images', Image: 'Image', MarkerView: 'MarkerView' },
    '@tamagui/lucide-icons-2': { Bus: 'Bus', Fuel: 'Fuel', Hospital: 'Hospital', School: 'School', Shield: 'Shield', Train: 'Train', Utensils: 'Utensils' },
    'react-native-svg': { __esModule: true, default: 'Svg', Circle: 'Circle', Path: 'Path' },
    tamagui: { YStack: 'YStack', useTheme: () => ({ primary: { val: '#000' } }) },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    Date: class extends Date { static now() { return time; } },
    setTimeout,
    clearTimeout,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
      return modules[name];
    },
  });
  const nativeMap = {
    getPointInView(coordinate) {
      projected.push([...coordinate]);
      return project(coordinate);
    },
    getCoordinateFromView(point) {
      unprojected.push([...point]);
      return unproject(point);
    },
    queryRenderedFeaturesAtPoint: (...args) => query(...args),
  };
  let nativePopup;
  let nativePopupKey;
  props = {
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
    bangumis: [work],
    styleIndex: 0,
    mode,
    showPointImageMarkers: true,
    selectedPoint: reference('a'),
    onPointSelect: (value) => selected.push(plain(value)),
    onMapPress: () => mapPresses.push('press'),
  };

  function render(patch = {}) {
    const nextProps = { ...props, ...patch };
    draftSlots = slots.slice();
    cursor = 0;
    layoutEffects = [];
    draft = { props: nextProps, tree: module.exports.default(nextProps), slots: draftSlots, effects: layoutEffects };
    return draft.tree;
  }
  function commit() {
    assert.ok(draft, 'render precedes commit');
    for (const effect of draft.effects) slots[effect.index]?.cleanup?.();
    slots = draft.slots;
    tree = draft.tree;
    props = draft.props;
    const map = find(tree, 'MapView');
    map.props.ref.current ??= nativeMap;
    const popupRef = findParent(tree, 'PopupCard')?.props.ref;
    if (popupRef && typeof popupRef === 'object') {
      const key = find(tree, 'MarkerView').key;
      if (!nativePopup || nativePopupKey !== key) {
        nativePopup = { measure: (callback) => measurePopup(callback) };
        nativePopupKey = key;
      }
      popupRef.current = nativePopup;
    } else {
      nativePopup = undefined;
      nativePopupKey = undefined;
    }
    for (const effect of draft.effects) slots[effect.index] = { deps: effect.deps, cleanup: effect.run() };
    draft = undefined;
    return tree;
  }
  render();
  commit();

  return {
    advanceTime,
    render,
    commit,
    discard() {
      draft = undefined;
    },
    update(patch) {
      render(patch);
      return commit();
    },
    setProject(next) {
      project = next;
    },
    setUnproject(next) { unproject = next; },
    setPopupMeasure(next) { measurePopup = next; },
    setQuery(next) { query = next; },
    setPrepareIcon(next) { prepareIcon = next; },
    enablePlanNearby(selectedPoint = null) {
      const update = (patch) => { render(patch); commit(); };
      update({
        selectedPoint,
        nearbyLocation: null,
        onNearbyLocationOpen: (location) => {
          planNearbyOpens.push(location);
          update({ nearbyLocation: location });
        },
        onPointSelect: (value) => {
          selected.push(plain(value));
          update({ selectedPoint: value });
        },
        onMapPress: () => {
          mapPresses.push('press');
          update({ nearbyLocation: null });
        },
      });
    },
    setBrowseState,
    setBrowseSelectedBangumiIds(ids) { browseSelectedBangumiIds = ids; },
    setNearbyCandidates(candidates) { nearbyCandidates = candidates; },
    get planNearbyLocation() { return props.nearbyLocation; },
    get planSelectedPoint() { return props.selectedPoint; },
    get nearbyCard() { return find(tree, 'NearbyPointPopupCard'); },
    clearPopup() { browseState.clearSelectedMapPoint(); },
    setMap(next) {
      find(tree, 'MapView').props.ref.current = next;
    },
    setCamera(camera) {
      find(tree, 'Camera').props.ref(camera);
    },
    setMapSize(width, height) {
      find(tree, 'MapView').props.onLayout({ nativeEvent: { layout: { width, height } } });
    },
    get popupCard() { return find(tree, 'PopupCard'); },
    get popupMarker() { return find(tree, 'MarkerView'); },
    get popupWrapper() { return findParent(tree, 'PopupCard'); },
    capturePopupLayout() {
      const onLayout = findParent(tree, 'PopupCard').props.onLayout;
      const currentTarget = nativePopup;
      return (event) => onLayout({ ...event, currentTarget });
    },
    layoutPopup(width, height) {
      const wrapper = findParent(tree, 'PopupCard');
      assert.ok(wrapper?.props.onLayout, 'the popup reports its measured layout');
      wrapper.props.onLayout({ currentTarget: nativePopup, nativeEvent: { layout: { width, height } } });
    },
    moveCamera() {
      find(tree, 'MapView').props.onCameraChanged({
        properties: { center: [139, 35], zoom: 12 },
        gestures: { isGestureActive: true },
      });
    },
    changeCamera() {
      find(tree, 'MapView').props.onCameraChanged({
        properties: { center: [139, 35], zoom: 12 },
        gestures: { isGestureActive: false },
      });
    },
    idleCamera() { find(tree, 'MapView').props.onMapIdle(); },
    hitRects(pointId = props.selectedPoint?.pointId, showImage = props.showPointImageMarkers) {
      find(tree, 'SelectedPlanMapPointLayer').props.onHitRectsChange(`${work.id}:${pointId}:${showImage}`, [hitRect]);
    },
    pointPress(pointId = 'c', at = screenPoint) {
      this.pointHandler(
        work.points.find((point) => point.id === pointId),
        work,
        at,
      );
    },
    mapPress(at = screenPoint, coordinates = [139, 35]) {
      this.mapHandler({ geometry: { coordinates }, properties: { screenPointX: at.x, screenPointY: at.y } });
    },
    setHasMapData(value) { hasMapData = value; },
    get pointHandler() {
      return find(tree, 'MapMarkers').props.onPointSelect;
    },
    get imageHandler() {
      return find(tree, 'PointImageMarkers')?.props.onPointSelect;
    },
    get mapHandler() {
      return find(tree, 'MapView').props.onPress;
    },
    unmount() {
      slots.forEach((slot) => slot?.cleanup?.());
      find(tree, 'MapView').props.ref.current = null;
    },
    projected,
    unprojected,
    selected,
    mapPresses,
    browseSelections,
    nearbyOpens,
    planNearbyOpens,
    nearbySearches,
    iconPreparations,
    get nearbyLocation() { return browseState.nearbyMapLocation; },
    get selectedMapPoint() { return browseState.selectedMapPoint; },
    get browseClears() {
      return browseClears;
    },
  };
}

async function flush() {
  // A no-hit lookup may query several layers in sequence; drain all continuations.
  for (let i = 0; i < 24; i++) await Promise.resolve();
}

function assertGeo(actual, expected) {
  assert.ok(Math.abs(actual[0] - expected[0]) < 1e-10);
  assert.ok(Math.abs(actual[1] - expected[1]) < 1e-10);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function createPhotoVisibilityHarness(screenPosition, visibilityObstacles = [], visibilityObstaclesReady = true) {
  const h = createHarness('browse');
  const commands = [];
  h.setCamera({ setCamera: (command) => commands.push(plain(command)) });
  h.setMapSize(400, 600);
  h.setProject(async () => screenPosition);
  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update({ visibilityRequest: { id: 1, ...reference('a') }, visibilityObstacles, visibilityObstaclesReady });
  return { h, commands };
}

function createInterruptedVisibilityHarness() {
  const h = createHarness('browse');
  const commands = [];
  h.setCamera({ setCamera: (command) => commands.push(plain(command)) });
  h.setMapSize(400, 600);
  h.setProject(async () => [40, 300]);
  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update({ visibilityRequest: { id: 1, ...reference('a'), interruptCamera: true } });
  return { h, commands };
}

test('a photo selected during flight waits for its expected end and subsequent camera quiet', async () => {
  const { h, commands } = createInterruptedVisibilityHarness();
  h.update({ visibilityRequest: { id: 2, ...reference('a'), interruptCamera: true, cameraAnimationEndTime: 1500 } });
  h.layoutPopup(220, 200);
  h.advanceTime(1250);
  h.changeCamera();
  h.advanceTime(249);
  await flush();
  assert.equal(h.projected.length, 0, 'does not check before the expected end of the flight');
  h.changeCamera();
  h.advanceTime(249);
  await flush();
  assert.equal(h.projected.length, 0, 'the last camera event also needs a quiet period');
  h.advanceTime(1);
  await flush();
  assert.equal(commands.length, 1);
});

test('a flight visibility request eventually checks without camera events or map idle', async () => {
  const { h, commands } = createInterruptedVisibilityHarness();
  h.update({ visibilityRequest: { id: 2, ...reference('a'), interruptCamera: true, cameraAnimationEndTime: 1500 } });
  h.layoutPopup(220, 200);
  h.advanceTime(1499);
  await flush();
  assert.equal(commands.length, 0);
  h.advanceTime(1);
  await flush();
  assert.equal(commands.length, 1);
});

test('a larger layout arriving after the flight projection rechecks a provisional measurement', async () => {
  const { h, commands } = createInterruptedVisibilityHarness();
  h.setProject(async () => [200, 300]);
  h.setPopupMeasure((callback) => callback(0, 0, 220, 150));
  h.update({ visibilityRequest: { id: 2, ...reference('a'), interruptCamera: true, cameraAnimationEndTime: 1500 } });
  h.changeCamera();
  h.advanceTime(1500);
  await flush();
  assert.equal(commands.length, 0, 'the provisional card is fully visible');
  h.layoutPopup(220, 350);
  await flush();
  assert.equal(commands.length, 1, 'a later larger card is checked and corrected');
});

for (const cancel of ['gesture', 'selection']) {
  test(`a ${cancel} invalidates a provisional flight measurement and its late layout`, async () => {
    const { h, commands } = createInterruptedVisibilityHarness();
    h.setProject(async () => [200, 300]);
    h.setPopupMeasure((callback) => callback(0, 0, 220, 150));
    h.update({ visibilityRequest: { id: 2, ...reference('a'), interruptCamera: true, cameraAnimationEndTime: 1500 } });
    h.changeCamera();
    if (cancel === 'gesture') h.moveCamera();
    else h.setBrowseState({ selectedMapPoint: reference('b') });
    h.advanceTime(1500);
    await flush();
    h.layoutPopup(220, 350);
    await flush();
    assert.equal(commands.length, 0);
  });
}

test('visibility corrections report their duration before sending the camera command', async () => {
  const { h, commands } = createPhotoVisibilityHarness([40, 300]);
  const events = [];
  h.setCamera({ setCamera: () => events.push('camera') });
  h.update({ onCameraAnimationStart: (duration) => events.push(duration) });
  h.layoutPopup(220, 200);
  await flush();
  assert.deepEqual(events, [350, 'camera']);
  assert.equal(commands.length, 0);
});

test('gesture camera events notify the owner while programmatic events do not', () => {
  const { h } = createInterruptedVisibilityHarness();
  let gestures = 0;
  h.update({ onCameraGestureStart: () => { gestures++; } });
  h.changeCamera();
  assert.equal(gestures, 0);
  h.moveCamera();
  assert.equal(gestures, 1);
});

test('interrupted photo selection checks after camera events stop without map idle', async () => {
  const { h, commands } = createInterruptedVisibilityHarness();
  h.layoutPopup(220, 200);
  h.advanceTime(200);
  h.changeCamera();
  h.advanceTime(200);
  h.changeCamera();
  h.advanceTime(249);
  await flush();
  assert.equal(h.projected.length, 0, 'each late camera event restarts the quiet period');
  assert.equal(commands.length, 0);
  h.advanceTime(1);
  await flush();
  assert.deepEqual(h.projected, [[139, 35]]);
  assert.equal(commands.length, 1, 'an obscured card is corrected without onMapIdle');
  assertCardFitsAfterCameraMove(commands[0], [40, 300], { width: 220, height: 200 }, []);
});

test('interrupted selection checks even if no further camera event or idle arrives', async () => {
  const { h, commands } = createInterruptedVisibilityHarness();
  h.layoutPopup(220, 200);
  h.advanceTime(250);
  await flush();
  assert.equal(commands.length, 1);
});

test('a late popup layout is checked after the interrupted camera becomes quiet', async () => {
  const { h, commands } = createInterruptedVisibilityHarness();
  h.changeCamera();
  h.advanceTime(250);
  await flush();
  assert.equal(commands.length, 0);
  h.layoutPopup(220, 200);
  await flush();
  assert.equal(commands.length, 1);
});

test('a late camera event invalidates an in-flight interrupted visibility projection', async () => {
  const { h, commands } = createInterruptedVisibilityHarness();
  const first = deferred();
  let reads = 0;
  h.setProject(() => ++reads === 1 ? first.promise : Promise.resolve([40, 300]));
  h.layoutPopup(220, 200);
  h.advanceTime(250);
  await flush();
  assert.equal(reads, 1);
  h.changeCamera();
  first.resolve([40, 300]);
  await flush();
  assert.equal(commands.length, 0, 'the outdated projection cannot move the camera');
  h.advanceTime(250);
  await flush();
  assert.equal(reads, 2);
  assert.equal(commands.length, 1, 'the fresh projection can correct the card');
});

test('a user gesture cancels interrupted selection visibility retries', async () => {
  const { h, commands } = createInterruptedVisibilityHarness();
  h.layoutPopup(220, 200);
  h.changeCamera();
  h.advanceTime(100);
  h.moveCamera();
  h.advanceTime(500);
  await flush();
  assert.equal(h.projected.length, 0);
  assert.equal(commands.length, 0);
});

test('a newer selection cancels the interrupted selection visibility retry', async () => {
  const { h, commands } = createInterruptedVisibilityHarness();
  h.layoutPopup(220, 200);
  h.changeCamera();
  h.advanceTime(100);
  h.setBrowseState({ selectedMapPoint: reference('b') });
  h.update({ visibilityRequest: null });
  h.advanceTime(500);
  await flush();
  assert.equal(h.projected.length, 0);
  assert.equal(commands.length, 0);
});

test('rapid interrupted photo selections only check the latest card', async () => {
  const { h, commands } = createInterruptedVisibilityHarness();
  h.layoutPopup(220, 200);
  h.changeCamera();
  h.advanceTime(100);
  h.setBrowseState({ selectedMapPoint: reference('b') });
  h.update({ visibilityRequest: { id: 2, ...reference('b'), interruptCamera: true } });
  h.layoutPopup(220, 200);
  h.advanceTime(250);
  await flush();
  assert.deepEqual(h.projected, [[140, 36]], 'only the latest selection is projected');
  assert.equal(commands.length, 1);
});

test('a photo selection leaves the camera untouched when the entire measured card fits', async () => {
  // MarkerView uses a bottom-center anchor: this card occupies [90, 310] x [100, 300].
  const { h, commands } = createPhotoVisibilityHarness([200, 300]);
  h.layoutPopup(220, 200);
  await flush();
  assert.deepEqual(h.projected, [[139, 35]]);
  assert.deepEqual(commands, []);
});

test('a card exactly touching the viewport edges is fully visible', async () => {
  const { h, commands } = createPhotoVisibilityHarness([110, 600]);
  h.layoutPopup(220, 600);
  await flush();
  assert.deepEqual(commands, []);
});

function assertCardFitsAfterCameraMove(command, position, card, obstacles) {
  // The harness maps screen coordinates to themselves, so a change in camera
  // center translates the point by the opposite displacement on screen.
  const x = position[0] + 200 - command.centerCoordinate[0];
  const y = position[1] + 300 - command.centerCoordinate[1];
  const rect = { left: x - card.width / 2, right: x + card.width / 2, top: y - card.height, bottom: y };
  assert.ok(rect.left >= 0 && rect.right <= 400 && rect.top >= 0 && rect.bottom <= 600, JSON.stringify(rect));
  for (const obstacle of obstacles) {
    assert.ok(
      rect.right <= obstacle.x || rect.left >= obstacle.x + obstacle.width ||
      rect.bottom <= obstacle.y || rect.top >= obstacle.y + obstacle.height,
      `${JSON.stringify(rect)} overlaps ${JSON.stringify(obstacle)}`,
    );
  }
}

for (const [label, position, obstacle] of [
  ['search box', [200, 250], { x: 20, y: 20, width: 360, height: 80 }],
  ['photo list', [200, 520], { x: 0, y: 480, width: 300, height: 54 }],
]) {
  test(`a card obscured by the ${label} is moved completely outside it`, async () => {
    const { h, commands } = createPhotoVisibilityHarness(position, [obstacle]);
    h.layoutPopup(220, 200);
    await flush();
    assert.equal(commands.length, 1);
    assertCardFitsAfterCameraMove(commands[0], position, { width: 220, height: 200 }, [obstacle]);
    for (const field of ['zoomLevel', 'heading', 'pitch']) assert.equal(Object.hasOwn(commands[0], field), false);
  });
}

test('an overlay elsewhere on screen does not move an unobscured card', async () => {
  const { h, commands } = createPhotoVisibilityHarness([200, 320], [{ x: 0, y: 480, width: 300, height: 54 }]);
  h.layoutPopup(220, 200);
  await flush();
  assert.deepEqual(commands, []);
});

test('the photo list does not obscure a card to its right at the same height', async () => {
  const { h, commands } = createPhotoVisibilityHarness([350, 520], [{ x: 0, y: 480, width: 300, height: 54 }]);
  h.layoutPopup(80, 200);
  await flush();
  assert.deepEqual(commands, []);
});

test('a correction avoids the search box and photo list at the same time', async () => {
  const obstacles = [
    { x: 20, y: 20, width: 360, height: 80 },
    { x: 0, y: 300, width: 300, height: 54 },
  ];
  const position = [200, 240];
  const { h, commands } = createPhotoVisibilityHarness(position, obstacles);
  h.layoutPopup(220, 150);
  await flush();
  assert.equal(commands.length, 1);
  assertCardFitsAfterCameraMove(commands[0], position, { width: 220, height: 150 }, obstacles);
});

test('an updated overlay invalidates an in-flight measurement and uses its latest bounds', async () => {
  const first = { x: 20, y: 20, width: 360, height: 80 };
  const latest = { x: 0, y: 480, width: 300, height: 54 };
  const { h, commands } = createPhotoVisibilityHarness([200, 250], [first]);
  const pending = deferred();
  let reads = 0;
  h.setProject(() => ++reads === 1 ? pending.promise : Promise.resolve([200, 520]));
  h.layoutPopup(220, 200);
  h.update({ visibilityObstacles: [latest] });
  pending.resolve([200, 250]);
  await flush();
  assert.equal(commands.length, 1, 'the replacement measurement produces only one camera command');
  assertCardFitsAfterCameraMove(commands[0], [200, 520], { width: 220, height: 200 }, [latest]);
});

test('a newer popup layout supersedes an in-flight layout projection', async () => {
  const obstacle = { x: 20, y: 20, width: 360, height: 80 };
  const { h, commands } = createPhotoVisibilityHarness([200, 320], [obstacle]);
  const oldProjection = deferred();
  let reads = 0;
  h.setProject(() => ++reads === 1 ? oldProjection.promise : Promise.resolve([200, 320]));
  h.layoutPopup(220, 200);
  h.layoutPopup(220, 260);
  await flush();
  oldProjection.resolve([200, 320]);
  await flush();
  assert.equal(commands.length, 1, 'only the latest card dimensions can move the camera');
  assertCardFitsAfterCameraMove(commands[0], [200, 320], { width: 220, height: 260 }, [obstacle]);
});

test('hiding the photo list rechecks visibility with no list obstacle', async () => {
  const obstacle = { x: 0, y: 480, width: 300, height: 54 };
  const { h, commands } = createPhotoVisibilityHarness([200, 520], [obstacle]);
  const pending = deferred();
  let reads = 0;
  h.setProject(() => ++reads === 1 ? pending.promise : Promise.resolve([200, 520]));
  h.layoutPopup(220, 200);
  h.update({ visibilityObstacles: [] });
  pending.resolve([200, 520]);
  await flush();
  assert.equal(reads, 2, 'rechecks with the removed obstacle');
  assert.deepEqual(commands, [], 'the old list measurement cannot cause an unnecessary move');
});

test('card visibility waits for delayed overlay measurements', async () => {
  const obstacle = { x: 20, y: 20, width: 360, height: 80 };
  const { h, commands } = createPhotoVisibilityHarness([200, 250], [], false);
  h.layoutPopup(220, 200);
  await flush();
  assert.deepEqual(commands, []);
  assert.equal(h.projected.length, 0, 'does not decide using incomplete overlays');
  h.update({ visibilityObstacles: [obstacle], visibilityObstaclesReady: true });
  await flush();
  assert.equal(commands.length, 1);
  assertCardFitsAfterCameraMove(commands[0], [200, 250], { width: 220, height: 200 }, [obstacle]);
});

test('idle correction checks the position again and stops after the card becomes visible', async () => {
  const obstacle = { x: 20, y: 20, width: 360, height: 80 };
  const { h, commands } = createPhotoVisibilityHarness([200, 250], [obstacle]);
  h.layoutPopup(220, 200);
  await flush();
  assert.equal(commands.length, 1);
  h.setProject(async () => [200, 300]);
  h.idleCamera();
  await flush();
  assert.equal(commands.length, 1, 'no further adjustment once clear');
});

test('idle correction retries when perspective leaves the card partially obscured', async () => {
  const obstacle = { x: 20, y: 20, width: 360, height: 80 };
  const { h, commands } = createPhotoVisibilityHarness([200, 250], [obstacle]);
  h.layoutPopup(220, 200);
  await flush();
  assert.equal(commands.length, 1);
  h.setProject(async () => [200, 280]);
  h.idleCamera();
  await flush();
  assert.equal(commands.length, 2);
  assertCardFitsAfterCameraMove(commands[1], [200, 280], { width: 220, height: 200 }, [obstacle]);
  h.setProject(async () => [200, 301]);
  h.idleCamera();
  await flush();
  assert.equal(commands.length, 2);
});

test('a user gesture prevents further idle corrections after an automatic move', async () => {
  const obstacle = { x: 20, y: 20, width: 360, height: 80 };
  const { h, commands } = createPhotoVisibilityHarness([200, 250], [obstacle]);
  h.layoutPopup(220, 200);
  await flush();
  assert.equal(commands.length, 1);
  h.moveCamera();
  h.idleCamera();
  await flush();
  assert.equal(commands.length, 1, 'a user gesture takes priority over visibility corrections');
});

for (const [edge, position] of [
  ['left', [109, 300]],
  ['right', [291, 300]],
  ['top', [200, 199]],
  ['bottom', [200, 601]],
]) {
  test(`a photo selection adjusts the camera when the measured card overflows the ${edge} edge`, async () => {
    const { h, commands } = createPhotoVisibilityHarness(position);
    h.layoutPopup(220, 200);
    await flush();
    assert.equal(commands.length, 1);
    assertCardFitsAfterCameraMove(commands[0], position, { width: 220, height: 200 }, []);
    for (const field of ['zoomLevel', 'heading', 'pitch']) assert.equal(Object.hasOwn(commands[0], field), false);
  });
}

test('reselecting the same photo preserves the popup and rechecks visibility without a new layout event', async () => {
  const { h, commands } = createPhotoVisibilityHarness([200, 300]);
  h.layoutPopup(220, 200);
  await flush();
  const initialKey = h.popupMarker.key;
  const initialProjections = h.projected.length;
  assert.deepEqual(commands, []);

  h.setProject(async () => [40, 300]);
  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update({ visibilityRequest: { id: 2, ...reference('a') } });
  await flush();

  assert.equal(h.popupMarker.key, initialKey, 'the existing annotation and card keep their identity');
  assert.equal(h.projected.length, initialProjections + 1, 'recheck using the current card dimensions');
  assert.equal(commands.length, 1, 'move the card back into view if it became obscured');
});

test('selecting a different photo waits for its own card dimensions', async () => {
  const { h, commands } = createPhotoVisibilityHarness([200, 300]);
  h.layoutPopup(220, 200);
  await flush();
  const initialProjections = h.projected.length;

  h.setProject(async () => [40, 300]);
  h.setBrowseState({ selectedMapPoint: reference('b') });
  h.update({ visibilityRequest: { id: 2, ...reference('b') } });
  await flush();
  assert.equal(h.projected.length, initialProjections, 'do not use the previous point’s card dimensions');
  assert.deepEqual(commands, []);

  h.layoutPopup(220, 240);
  await flush();
  assert.equal(h.projected.length, initialProjections + 1);
  assert.equal(commands.length, 1);
});

test('ordinary map selection replaces the annotation and card when switching points', () => {
  const h = createHarness('browse');
  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update();
  const initialKey = h.popupMarker.key;
  h.setBrowseState({ selectedMapPoint: reference('b') });
  h.update();
  assert.notEqual(h.popupMarker.key, initialKey, 'the new point gets its own annotation and card subtree');
});

test('a photo click on a map-opened card keeps its subtree and reuses its measured layout', async () => {
  const h = createHarness('browse');
  const commands = [];
  h.setCamera({ setCamera: (command) => commands.push(plain(command)) });
  h.setMapSize(400, 600);
  h.setProject(async () => [40, 300]);
  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update();
  h.layoutPopup(220, 200);
  const initialKey = h.popupMarker.key;
  assert.equal(h.projected.length, 0);

  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update({ visibilityRequest: { id: 1, ...reference('a') } });
  await flush();

  assert.equal(h.popupMarker.key, initialKey, 'selecting the same point does not remount the card');
  assert.equal(h.projected.length, 1, 'visibility is checked without another layout event');
  assert.equal(commands.length, 1, 'the existing card is moved into view if necessary');
});

test('a photo click on a random-jump card keeps its subtree after camera movement', async () => {
  const h = createHarness('browse');
  const commands = [];
  h.setCamera({ setCamera: (command) => commands.push(plain(command)) });
  h.setMapSize(400, 600);
  h.setProject(async () => [200, 300]);
  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update();
  h.layoutPopup(220, 200);
  const initialKey = h.popupMarker.key;
  h.moveCamera();

  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update({ visibilityRequest: { id: 1, ...reference('a') } });
  await flush();

  assert.equal(h.popupMarker.key, initialKey, 'the current card is reused after the flight');
  assert.equal(h.projected.length, 1, 'the current camera position is checked');
  assert.deepEqual(commands, [], 'an already visible card does not move the camera');
});

test('a photo click measures the newly mounted map point before its layout event arrives', async () => {
  const h = createHarness('browse');
  const commands = [];
  h.setCamera({ setCamera: (command) => commands.push(plain(command)) });
  h.setMapSize(400, 600);
  h.setProject(async () => [40, 300]);
  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update();
  h.layoutPopup(220, 200);
  const initialKey = h.popupMarker.key;

  h.setBrowseState({ selectedMapPoint: reference('b') });
  h.update();
  const newKey = h.popupMarker.key;
  assert.notEqual(newKey, initialKey, 'the other map point remounts the annotation and card');
  h.setPopupMeasure((callback) => callback(0, 0, 220, 200, 0, 0));
  h.setBrowseState({ selectedMapPoint: reference('b') });
  h.update({ visibilityRequest: { id: 1, ...reference('b') } });
  await flush();

  assert.equal(h.popupMarker.key, newKey, 'the photo selection retains the newly mounted card');
  assert.deepEqual(h.projected, [[140, 36]], 'the newly selected point is projected');
  assert.equal(commands.length, 1, 'the measured point is adjusted into view');
});

test('a delayed popup measurement cannot overwrite a newer layout', async () => {
  const h = createHarness('browse');
  const commands = [];
  let finishMeasurement;
  h.setCamera({ setCamera: (command) => commands.push(plain(command)) });
  h.setMapSize(400, 600);
  h.setProject(async () => [200, 320]);
  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update();
  h.layoutPopup(220, 200);
  h.setBrowseState({ selectedMapPoint: reference('b') });
  h.update();
  h.setPopupMeasure((callback) => { finishMeasurement = callback; });
  h.update({ visibilityRequest: { id: 1, ...reference('b') }, visibilityObstacles: [{ x: 20, y: 20, width: 360, height: 80 }] });
  assert.equal(typeof finishMeasurement, 'function');

  h.layoutPopup(220, 260);
  await flush();
  assert.equal(commands.length, 1, 'the latest layout intersects the search area');
  finishMeasurement(0, 0, 220, 200, 0, 0);
  await flush();
  assert.equal(h.projected.length, 1, 'the old measurement cannot trigger another projection');
  assert.equal(commands.length, 1);
});

test('a later changed layout rechecks a card after its measured size was already considered visible', async () => {
  const h = createHarness('browse');
  const commands = [];
  const obstacle = { x: 20, y: 20, width: 360, height: 80 };
  h.setCamera({ setCamera: (command) => commands.push(plain(command)) });
  h.setMapSize(400, 600);
  h.setProject(async () => [200, 320]);
  h.setPopupMeasure((callback) => callback(0, 0, 220, 200, 0, 0));
  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update({ visibilityRequest: { id: 1, ...reference('a') }, visibilityObstacles: [obstacle] });
  await flush();
  assert.deepEqual(commands, [], 'the measured card fits');

  h.layoutPopup(220, 260);
  await flush();
  assert.equal(commands.length, 1, 'the larger onLayout result triggers another visibility check');
  assertCardFitsAfterCameraMove(commands[0], [200, 320], { width: 220, height: 260 }, [obstacle]);
});

test('a changed layout during an automatic correction is checked after the camera is idle', async () => {
  const h = createHarness('browse');
  const commands = [];
  const obstacle = { x: 20, y: 20, width: 360, height: 80 };
  h.setCamera({ setCamera: (command) => commands.push(plain(command)) });
  h.setMapSize(400, 600);
  h.setProject(async () => [90, 320]);
  h.setPopupMeasure((callback) => callback(0, 0, 220, 200, 0, 0));
  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update({ visibilityRequest: { id: 1, ...reference('a') }, visibilityObstacles: [obstacle] });
  await flush();
  assert.equal(commands.length, 1, 'the measured card needs a horizontal correction');

  h.changeCamera();
  h.layoutPopup(220, 260);
  h.setProject(async () => [200, 320]);
  h.idleCamera();
  await flush();
  assert.equal(commands.length, 2, 'the later layout is checked after the automatic motion');
  assertCardFitsAfterCameraMove(commands[1], [200, 320], { width: 220, height: 260 }, [obstacle]);
});

for (const action of ['gesture', 'programmatic camera change', 'new point', 'closed card']) {
  test(`a late layout cannot move the camera after ${action}`, async () => {
    const h = createHarness('browse');
    const commands = [];
    const obstacle = { x: 20, y: 20, width: 360, height: 80 };
    h.setCamera({ setCamera: (command) => commands.push(plain(command)) });
    h.setMapSize(400, 600);
    h.setProject(async () => [200, 320]);
    h.setPopupMeasure((callback) => callback(0, 0, 220, 200, 0, 0));
    h.setBrowseState({ selectedMapPoint: reference('a') });
    h.update({ visibilityRequest: { id: 1, ...reference('a') }, visibilityObstacles: [obstacle] });
    await flush();
    assert.deepEqual(commands, []);
    const oldLayout = h.capturePopupLayout();

    if (action === 'gesture') h.moveCamera();
    if (action === 'programmatic camera change') h.changeCamera();
    if (action === 'new point') { h.setBrowseState({ selectedMapPoint: reference('b') }); h.update(); }
    if (action === 'closed card') { h.setBrowseState({ selectedMapPoint: null }); h.update(); }
    oldLayout({ nativeEvent: { layout: { width: 220, height: 260 } } });
    await flush();
    assert.deepEqual(commands, [], 'a superseded request must not move the camera');
  });
}

test('repeated photo clicks ignore a pending measurement from the previous request', async () => {
  const h = createHarness('browse');
  const commands = [];
  const measurements = [];
  h.setCamera({ setCamera: (command) => commands.push(plain(command)) });
  h.setMapSize(400, 600);
  h.setProject(async () => [40, 300]);
  h.setPopupMeasure((callback) => measurements.push(callback));
  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update({ visibilityRequest: { id: 1, ...reference('a') } });
  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update({ visibilityRequest: { id: 2, ...reference('a') } });
  assert.equal(measurements.length, 2);

  measurements[1](0, 0, 220, 200, 0, 0);
  await flush();
  assert.equal(commands.length, 1);
  measurements[0](0, 0, 220, 260, 0, 0);
  await flush();
  assert.equal(h.projected.length, 1, 'only the latest request can project the point');
  assert.equal(commands.length, 1);
});

test('a pending popup measurement is discarded after the selected card is closed', async () => {
  const h = createHarness('browse');
  const commands = [];
  let finishMeasurement;
  h.setCamera({ setCamera: (command) => commands.push(plain(command)) });
  h.setMapSize(400, 600);
  h.setProject(async () => [40, 300]);
  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.setPopupMeasure((callback) => { finishMeasurement = callback; });
  h.update({ visibilityRequest: { id: 1, ...reference('a') } });
  assert.equal(typeof finishMeasurement, 'function');

  h.setBrowseState({ selectedMapPoint: null });
  h.update();
  finishMeasurement(0, 0, 220, 200, 0, 0);
  await flush();
  assert.equal(h.projected.length, 0);
  assert.deepEqual(commands, []);
});

test('a stale layout from a different map point cannot satisfy the selected photo request', async () => {
  const h = createHarness('browse');
  const commands = [];
  h.setCamera({ setCamera: (command) => commands.push(plain(command)) });
  h.setMapSize(400, 600);
  h.setProject(async () => [40, 300]);
  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update();
  const oldLayout = h.capturePopupLayout();
  h.layoutPopup(220, 200);

  h.setBrowseState({ selectedMapPoint: reference('b') });
  h.update({ visibilityRequest: { id: 1, ...reference('b') } });
  oldLayout({ nativeEvent: { layout: { width: 220, height: 200 } } });
  await flush();
  assert.equal(h.projected.length, 0, 'the old point dimensions are not used for the new point');
  assert.deepEqual(commands, []);

  h.layoutPopup(220, 240);
  await flush();
  assert.equal(h.projected.length, 1);
  assert.equal(commands.length, 1);
});

test('returning to A after B ignores layout events from the unmounted A card', async () => {
  const h = createHarness('browse');
  const commands = [];
  h.setCamera({ setCamera: (command) => commands.push(plain(command)) });
  h.setMapSize(400, 600);
  h.setProject(async () => [40, 300]);
  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update();
  const oldLayout = h.capturePopupLayout();
  h.layoutPopup(220, 200);

  h.setBrowseState({ selectedMapPoint: reference('b') });
  h.update();
  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update({ visibilityRequest: { id: 1, ...reference('a') } });
  oldLayout({ nativeEvent: { layout: { width: 220, height: 400 } } });
  await flush();
  assert.equal(h.projected.length, 0, 'a matching point key does not make the old native view current');
  assert.deepEqual(commands, []);

  h.layoutPopup(220, 200);
  await flush();
  assert.equal(h.projected.length, 1);
  assert.equal(commands.length, 1);
});

test('changing the selected point coordinates invalidates its old layout and in-flight projection', async () => {
  const { h, commands } = createPhotoVisibilityHarness([200, 300]);
  const oldProjection = deferred();
  h.setProject(() => oldProjection.promise);
  h.layoutPopup(220, 200);
  const initialKey = h.popupMarker.key;

  h.update({ bangumis: [{
    ...work,
    points: work.points.map((point) => point.id === 'a' ? { ...point, geo: [35.1, 139.1] } : point),
  }] });
  assert.notEqual(h.popupMarker.key, initialKey, 'the changed coordinate gets a new native annotation');
  oldProjection.resolve([40, 300]);
  await flush();
  assert.deepEqual(commands, [], 'the old coordinate cannot trigger a camera correction');
  assert.equal(h.projected.length, 1, 'the new instance waits for its own dimensions');

  h.setProject(async () => [40, 300]);
  h.layoutPopup(220, 200);
  await flush();
  assert.deepEqual(h.projected, [[139, 35], [139.1, 35.1]]);
  assert.equal(commands.length, 1, 'the new layout resumes the still-pending visibility request');
});

test('a repeated photo click supersedes the previous pending projection', async () => {
  const { h, commands } = createPhotoVisibilityHarness([200, 300]);
  const firstProjection = deferred();
  h.setProject(() => firstProjection.promise);
  h.layoutPopup(220, 200);

  h.setProject(async () => [40, 300]);
  h.setBrowseState({ selectedMapPoint: reference('a') });
  h.update({ visibilityRequest: { id: 2, ...reference('a') } });
  await flush();
  assert.equal(commands.length, 1);
  firstProjection.resolve([40, 300]);
  await flush();
  assert.equal(commands.length, 1, 'the older request cannot move the camera a second time');
});

test('a pending visibility projection cannot move the camera after the user moves it', async () => {
  const { h, commands } = createPhotoVisibilityHarness([200, 300]);
  const pending = deferred();
  h.setProject(() => pending.promise);
  h.layoutPopup(220, 200);
  h.moveCamera();
  pending.resolve([100, 300]);
  await flush();
  assert.deepEqual(commands, []);
});

test('a pending visibility projection cannot move the camera after another point is selected', async () => {
  const { h, commands } = createPhotoVisibilityHarness([200, 300]);
  const pending = deferred();
  h.setProject(() => pending.promise);
  h.layoutPopup(220, 200);
  h.setBrowseState({ selectedMapPoint: reference('b') });
  h.update({ visibilityRequest: { id: 2, ...reference('b') } });
  pending.resolve([100, 300]);
  await flush();
  assert.deepEqual(commands, []);
});

test('a pending visibility projection remains stale after selection changes away and back', async () => {
  const { h, commands } = createPhotoVisibilityHarness([200, 300]);
  const pending = deferred();
  h.setProject(() => pending.promise);
  h.layoutPopup(220, 200);
  h.setBrowseState({ selectedMapPoint: reference('b') });
  h.setBrowseState({ selectedMapPoint: reference('a') });
  pending.resolve([100, 300]);
  await flush();
  assert.deepEqual(commands, []);
});

test('a pending visibility projection cannot move the camera after unmount', async () => {
  const { h, commands } = createPhotoVisibilityHarness([200, 300]);
  const pending = deferred();
  h.setProject(() => pending.promise);
  h.layoutPopup(220, 200);
  h.unmount();
  pending.resolve([100, 300]);
  await flush();
  assert.deepEqual(commands, []);
});

test('a failed native projection does not move the camera', async () => {
  const { h, commands } = createPhotoVisibilityHarness([200, 300]);
  h.setProject(async () => { throw new Error('map projection unavailable'); });
  h.layoutPopup(220, 200);
  await flush();
  assert.deepEqual(commands, []);
});

test('ordinary point and image source callbacks stay identical across committed selection and callback changes', () => {
  const h = createHarness();
  const point = h.pointHandler;
  const map = h.mapHandler;
  assert.equal(h.imageHandler, point);
  for (const selectedPoint of [reference('b'), null, reference('a')]) {
    h.update({ selectedPoint, onPointSelect: () => {}, onMapPress: () => {}, selectedBangumiIds: [10] });
    assert.equal(h.pointHandler, point);
    assert.equal(h.imageHandler, point);
    assert.equal(h.mapHandler, map);
  }
  h.update({ bangumis: [{ ...work, points: work.points.slice() }] });
  assert.equal(h.pointHandler, point, 'a refreshed parent data/callback must not invalidate source press props');
});

test('selected artwork wins overlapping point presses; an outside hit preserves the ordinary point fallback', async () => {
  const h = createHarness();
  h.hitRects();
  h.pointPress();
  await flush();
  h.pointPress('c', { x: 111, y: 100 });
  await flush();
  assert.deepEqual(h.selected, [reference('a'), reference('c')]);
  assert.deepEqual(h.projected, [
    [139, 35],
    [139, 35],
  ]);
});

test('blank-map presses preserve artwork priority and use the latest map callback outside it', async () => {
  const h = createHarness();
  h.update({ nearbyLocation: { id: 1, geo: [35, 139], place: null } });
  h.hitRects();
  h.mapPress();
  await flush();
  const blank = [];
  h.update({ onMapPress: () => blank.push('latest') });
  h.mapPress({ x: 111, y: 100 });
  await flush();
  assert.deepEqual(h.selected, [reference('a')]);
  assert.deepEqual(blank, ['latest']);
  assert.deepEqual(h.mapPresses, []);
});

test('an old stable handler reads the latest committed selected point and updated coordinates', async () => {
  const h = createHarness();
  const handler = h.pointHandler;
  const next = {
    ...work,
    points: work.points.map((point) => (point.id === 'b' ? { ...point, geo: [38, 142] } : point)),
  };
  const received = [];
  h.update({ selectedPoint: reference('b'), bangumis: [next], onPointSelect: (value) => received.push(plain(value)) });
  h.hitRects('b');
  handler(work.points[2], work, screenPoint);
  await flush();
  assert.deepEqual(received, [reference('b')]);
  assert.deepEqual(h.projected, [[142, 38]]);
  assert.deepEqual(h.selected, []);
});

test('an uncommitted render cannot expose its selection or callback to committed native handlers', async () => {
  const h = createHarness();
  h.hitRects();
  const leaked = [];
  h.render({ selectedPoint: reference('b'), onPointSelect: (value) => leaked.push(value) });
  h.pointPress();
  await flush();
  assert.deepEqual(h.selected, [reference('a')]);
  assert.deepEqual(h.projected, [[139, 35]]);
  assert.deepEqual(leaked, []);
  h.commit();
  h.hitRects('b');
  h.pointPress();
  await flush();
  assert.deepEqual(plain(leaked), [reference('b')]);
});

test('discarding a render leaves the previous committed selection and callback active', async () => {
  const h = createHarness();
  h.hitRects();
  h.render({ selectedPoint: reference('b'), onPointSelect: () => assert.fail('discarded callback must stay private') });
  h.discard();
  h.update({ selectedBangumiIds: [work.id] });
  h.pointPress();
  await flush();
  assert.deepEqual(h.selected, [reference('a')]);
  assert.deepEqual(h.projected, [[139, 35]]);
});

test('a callback update during native projection uses the latest committed callback without dropping the press', async () => {
  const h = createHarness();
  const pending = deferred();
  h.hitRects();
  h.setProject(() => pending.promise);
  h.pointPress();
  const latest = [];
  h.update({ onPointSelect: (value) => latest.push(plain(value)) });
  pending.resolve([100, 100]);
  await flush();
  assert.deepEqual(latest, [reference('a')]);
  assert.deepEqual(h.selected, []);
});

for (const change of ['switch', 'cancel', 'image toggle']) {
  test(`a ${change} during projection rejects old artwork and preserves the ordinary point fallback`, async () => {
    const h = createHarness();
    const pending = deferred();
    h.hitRects();
    h.setProject(() => pending.promise);
    h.pointPress();
    h.update(
      change === 'switch'
        ? { selectedPoint: reference('b') }
        : change === 'cancel'
          ? { selectedPoint: null }
          : { showPointImageMarkers: false },
    );
    pending.resolve([100, 100]);
    await flush();
    assert.deepEqual(h.selected, [reference('c')]);
  });
}

test('cancelling selection then pressing the same point selects it through the ordinary fallback', async () => {
  const h = createHarness();
  h.hitRects();
  h.update({ selectedPoint: null });
  h.pointPress('a');
  await flush();
  assert.deepEqual(h.selected, [reference('a')]);
  assert.deepEqual(h.projected, [], 'cancelled artwork does not request a native projection');
});

test('hit rectangles for another artwork never intercept ordinary point presses', async () => {
  const h = createHarness();
  h.hitRects('b');
  h.pointPress();
  await flush();
  assert.deepEqual(h.selected, [reference('c')]);
  assert.deepEqual(h.projected, []);
});

test('native projection failures preserve ordinary point and blank-map fallback behavior', async () => {
  const h = createHarness();
  h.update({ nearbyLocation: { id: 1, geo: [35, 139], place: null } });
  h.hitRects();
  h.setProject(async () => {
    throw new Error('map projection unavailable');
  });
  h.pointPress();
  await flush();
  h.mapPress();
  await flush();
  assert.deepEqual(h.selected, [reference('c')]);
  assert.deepEqual(h.mapPresses, ['press']);
});

for (const change of ['map instance replacement', 'unmount']) {
  test(`${change} drops pending point and blank-map events`, async () => {
    const h = createHarness();
    const pending = deferred();
    h.hitRects();
    h.setProject(() => pending.promise);
    h.pointPress();
    h.mapPress();
    if (change === 'unmount') h.unmount();
    else h.setMap({ getPointInView: async () => [100, 100] });
    pending.resolve([100, 100]);
    await flush();
    assert.deepEqual(h.selected, []);
    assert.deepEqual(h.mapPresses, []);
  });
}

test('point presses without screen coordinates stay synchronous and use the latest parent callback', () => {
  const h = createHarness();
  const handler = h.pointHandler;
  const latest = [];
  h.update({ onPointSelect: (value) => latest.push(plain(value)) });
  handler(work.points[1], work);
  assert.deepEqual(latest, [reference('b')]);
  assert.deepEqual(h.projected, []);
});

test('browse point selection and blank-map dismissal remain independent of the plan event snapshot', async () => {
  const h = createHarness('browse');
  const handler = h.pointHandler;
  h.update({ selectedPoint: reference('b'), onPointSelect: () => assert.fail('browse uses the browse store') });
  assert.equal(h.pointHandler, handler);
  h.pointPress('b');
  h.mapPress();
  await flush();
  assert.deepEqual(h.browseSelections, [reference('b')]);
  assert.equal(h.browseClears, 1);
  assert.deepEqual(h.projected, []);
});

test('browse blank presses first dismiss an open popup, then open at the next position', async () => {
  const h = createHarness('browse');
  h.pointPress('b');
  h.mapPress(screenPoint, [140, 36]);
  await flush();
  assert.equal(h.browseClears, 1);
  assert.deepEqual(h.nearbyOpens, []);
  h.mapPress(screenPoint, [141, 37]);
  await flush();
  assert.deepEqual(h.nearbyOpens.map((item) => item.geo), [[37, 141]]);
  h.mapPress(screenPoint, [142, 38]);
  await flush();
  assert.equal(h.browseClears, 2);
  assert.equal(h.nearbyOpens.length, 1);
});

test('missing map data prevents opening, but never prevents closing a popup', async () => {
  const h = createHarness('browse');
  h.setHasMapData(false);
  h.mapPress();
  assert.deepEqual(h.nearbyOpens, []);
  h.pointPress('a');
  h.mapPress();
  await flush();
  assert.equal(h.browseClears, 1);
});

test('browse map rejects invalid coordinates and normalizes wrapped longitude', async () => {
  const h = createHarness('browse');
  h.mapPress(screenPoint, [0, 91]);
  assert.deepEqual(h.nearbyOpens, []);
  h.mapPress(screenPoint, [181, 35]);
  await flush();
  assert.deepEqual(h.nearbyOpens.map((item) => item.geo), [[35, -179]]);
});

test('nearby place lookup queries basemap layers at the tapped screen point', async () => {
  const h = createHarness('browse');
  const queries = [];
  h.setQuery(async (point, filter, layers) => {
    queries.push({ point: plain(point), filter: plain(filter), layers: plain(layers) });
    return { features: [{ properties: { name: 'Original', 'name_zh-Hans': '中文', name_en: 'English', maki: 'police' } }] };
  });
  h.mapPress({ x: 23, y: 45 }, [139, 35]);
  await flush();
  assert.deepEqual(queries, [{ point: [23, 45], filter: [], layers: ['poi-label'] }]);
  const { featureKey: _featureKey, mapFeature, iconAsset: _iconAsset, ...place } = plain(h.nearbyLocation.place);
  assert.deepEqual(place, { name: '中文', englishName: 'English', icon: 'police' });
  assert.deepEqual(mapFeature, {
    layerId: 'poi-label',
    feature: { properties: { name: 'Original', 'name_zh-Hans': '中文', name_en: 'English', maki: 'police' } },
  });
});

test('nearby place preserves the preferred icon, standard fallback and map category', async () => {
  const h = createHarness('browse');
  h.setQuery(async () => ({
    features: [{ properties: { name: 'Station', maki_beta: 'rail-beta', maki: 'rail', class: 'transit' } }],
  }));
  h.mapPress({ x: 23, y: 45 }, [139, 35]);
  await flush();
  const { featureKey: _featureKey, mapFeature: _mapFeature, iconAsset: _iconAsset, ...place } = plain(h.nearbyLocation.place);
  assert.deepEqual(place, {
    name: 'Station', icon: 'rail-beta', fallbackIcon: 'rail', category: 'transit',
  });
});

for (const initial of ['point', 'nearby']) {
  test(`a named map POI replaces an existing ${initial} popup in one tap`, async () => {
    const h = createHarness('browse');
    if (initial === 'point') h.pointPress('a');
    else { h.mapPress(screenPoint, [139, 35]); await flush(); }

    const pending = deferred();
    h.setQuery(() => pending.promise);
    const oldLocation = h.nearbyLocation;
    const oldPoint = h.selectedMapPoint;
    h.mapPress({ x: 23, y: 45 }, [140, 36]);
    assert.equal(h.nearbyLocation, oldLocation, 'do not dismiss the old popup before lookup resolves');
    assert.equal(h.selectedMapPoint, oldPoint);
    pending.resolve({ features: [{ properties: { name: 'Original', 'name_zh-Hans': '中文', name_en: 'English', maki: 'police' } }] });
    await flush();
    assert.deepEqual(plain(h.nearbyLocation.geo), [36, 140]);
    const { featureKey: _featureKey, mapFeature: _mapFeature, iconAsset: _iconAsset, ...place } = plain(h.nearbyLocation.place);
    assert.deepEqual(place, { name: '中文', englishName: 'English', icon: 'police' });
    assert.equal(h.nearbyOpens.at(-1).place?.name, '中文', 'the replacement must be created with its name already available');
    assert.equal(h.selectedMapPoint, null);
  });
}

for (const initial of ['point', 'nearby']) {
  test(`an unnamed map tap closes an existing ${initial} popup without opening a new one`, async () => {
    const h = createHarness('browse');
    if (initial === 'point') h.pointPress('a');
    else { h.mapPress(screenPoint, [139, 35]); await flush(); }
    const oldOpenCount = h.nearbyOpens.length;
    h.setQuery(async () => ({ features: [{ properties: { name: '' } }] }));
    h.mapPress(screenPoint, [140, 36]);
    await flush();
    assert.equal(h.selectedMapPoint, null);
    assert.equal(h.nearbyLocation, null);
    assert.equal(h.nearbyOpens.length, oldOpenCount);
    assert.equal(h.browseClears, 1);
  });
}

test('with no open popup, the first card mounts with the complete POI instead of growing after opening', async () => {
  const h = createHarness('browse');
  const pending = deferred();
  h.setQuery(() => pending.promise);
  h.mapPress(screenPoint, [139, 35]);
  assert.equal(h.nearbyLocation, null);
  assert.deepEqual(h.nearbyOpens, []);
  pending.resolve({ features: [{ properties: { name: 'Station', name_en: 'Station English', maki: 'rail' } }] });
  await flush();
  assert.deepEqual(plain(h.nearbyLocation.geo), [35, 139]);
  assert.equal(h.nearbyLocation.place.name, 'Station');
  assert.equal(h.nearbyOpens.length, 1);
  assert.equal(h.nearbyOpens[0].place.englishName, 'Station English');
  assert.equal(h.nearbyOpens[0].place.icon, 'rail');
});

for (const result of ['empty', 'error', 'unavailable']) {
  test(`with no open popup, a ${result} POI lookup still opens the coordinates card`, async () => {
    const h = createHarness('browse');
    h.setQuery(async () => {
      if (result === 'error') throw new Error('native query failed');
      return result === 'empty' ? { features: [] } : undefined;
    });
    h.mapPress(screenPoint, [139, 35]);
    await flush();
    assert.deepEqual(plain(h.nearbyLocation.geo), [35, 139]);
    assert.equal(h.nearbyLocation.place, null);
    assert.equal(h.nearbyOpens.length, 1);
    assert.equal(h.iconPreparations.length, 0, 'coordinate-only cards do not wait for icon resources');
  });
}

test('without a queryable screen point a first tap falls back directly to coordinates', () => {
  const h = createHarness('browse');
  h.setQuery(() => assert.fail('invalid screen coordinates must not reach the native query'));
  h.mapPress({ x: NaN, y: NaN }, [139, 35]);
  assert.deepEqual(plain(h.nearbyLocation.geo), [35, 139]);
  assert.equal(h.nearbyLocation.place, null);
});

test('map data becoming unavailable during the first lookup prevents opening a card', async () => {
  const h = createHarness('browse');
  const pending = deferred();
  h.setQuery(() => pending.promise);
  h.mapPress();
  h.setHasMapData(false);
  pending.resolve({ features: [{ properties: { name: 'Station' } }] });
  await flush();
  assert.equal(h.nearbyLocation, null);
  assert.deepEqual(h.nearbyOpens, []);
});

for (const initial of ['point', 'nearby']) {
  test(`a failed POI lookup preserves the existing ${initial} popup`, async () => {
    const h = createHarness('browse');
    if (initial === 'point') h.pointPress('a');
    else { h.mapPress(); await flush(); }
    const oldLocation = h.nearbyLocation;
    const oldPoint = h.selectedMapPoint;
    h.setQuery(async () => { throw new Error('native query failed'); });
    h.mapPress(screenPoint, [140, 36]);
    await flush();
    assert.equal(h.selectedMapPoint, oldPoint);
    assert.equal(h.nearbyLocation, oldLocation);
    assert.equal(h.browseClears, 0);
  });
}

test('the last map tap wins when POI lookups complete out of order', async () => {
  const h = createHarness('browse');
  h.pointPress('a');
  const first = deferred();
  const second = deferred();
  let calls = 0;
  h.setQuery(() => ++calls === 1 ? first.promise : second.promise);
  h.mapPress({ x: 11, y: 12 }, [140, 36]);
  h.mapPress({ x: 21, y: 22 }, [141, 37]);
  second.resolve({ features: [{ properties: { name: 'Second' } }] });
  await flush();
  assert.deepEqual(plain(h.nearbyLocation.geo), [37, 141]);
  assert.equal(h.nearbyLocation.place.name, 'Second');
  first.resolve({ features: [{ properties: { name: 'First' } }] });
  await flush();
  assert.deepEqual(plain(h.nearbyLocation.geo), [37, 141]);
  assert.equal(h.nearbyLocation.place.name, 'Second');
});

test('selecting a pilgrimage point invalidates a pending POI lookup', async () => {
  const h = createHarness('browse');
  h.pointPress('a');
  const pending = deferred();
  h.setQuery(() => pending.promise);
  h.mapPress(screenPoint, [140, 36]);
  h.pointPress('b');
  pending.resolve({ features: [{ properties: { name: 'Stale POI' } }] });
  await flush();
  assert.deepEqual(plain(h.selectedMapPoint), reference('b'));
  assert.equal(h.nearbyLocation, null);
});

test('a pending POI lookup stays invalid after the selection moves away and back', async () => {
  const h = createHarness('browse');
  h.pointPress('a');
  const pending = deferred();
  h.setQuery(() => pending.promise);
  h.mapPress(screenPoint, [140, 36]);
  h.pointPress('b');
  h.pointPress('a');
  pending.resolve({ features: [{ id: 81, properties: { name: 'Stale POI' } }] });
  await flush();
  assert.deepEqual(plain(h.selectedMapPoint), reference('a'));
  assert.equal(h.nearbyLocation, null);
});

for (const change of ['camera', 'map instance', 'map style']) {
  test(`a ${change} change invalidates an existing-popup POI lookup`, async () => {
    const h = createHarness('browse');
    h.pointPress('a');
    const pending = deferred();
    h.setQuery(() => pending.promise);
    h.mapPress(screenPoint, [140, 36]);
    if (change === 'camera') h.moveCamera();
    else if (change === 'map instance') h.setMap({ getPointInView: async () => [100, 100] });
    else h.update({ styleIndex: 1 });
    pending.resolve({ features: [{ properties: { name: 'Stale POI' } }] });
    await flush();
    assert.deepEqual(plain(h.selectedMapPoint), reference('a'));
    assert.equal(h.nearbyLocation, null);
    assert.equal(h.browseClears, 0);
  });
}

test('one failing queried layer and no POI preserves the existing popup', async () => {
  const h = createHarness('browse');
  h.pointPress('a');
  h.setQuery(async (_point, _filter, layers) => {
    if (layers[0] === 'poi-label') throw new Error('native layer query failed');
    return { features: [] };
  });
  h.mapPress(screenPoint, [140, 36]);
  await flush();
  assert.deepEqual(plain(h.selectedMapPoint), reference('a'));
  assert.equal(h.nearbyLocation, null);
  assert.equal(h.browseClears, 0);
});

test('a valid POI in a later layer still replaces the popup when an earlier layer fails', async () => {
  const h = createHarness('browse');
  h.pointPress('a');
  h.setQuery(async (_point, _filter, layers) => {
    if (layers[0] === 'poi-label') throw new Error('native layer query failed');
    return { features: [{ id: 52, properties: { name: 'Station' } }] };
  });
  h.mapPress(screenPoint, [140, 36]);
  await flush();
  assert.equal(h.nearbyLocation.place.name, 'Station');
  assert.equal(h.selectedMapPoint, null);
});

test('dark map style skips its known missing transit layer when deciding a blank tap', async () => {
  const h = createHarness('browse');
  h.update({ styleIndex: 1 });
  h.pointPress('a');
  const queried = [];
  h.setQuery(async (_point, _filter, layers) => {
    queried.push(layers[0]);
    if (layers[0] === 'transit-label') throw new Error('layer absent from dark style');
    return { features: [] };
  });
  h.mapPress(screenPoint, [140, 36]);
  await flush();
  assert.equal(h.selectedMapPoint, null);
  assert.equal(h.browseClears, 1);
  assert.equal(queried.includes('transit-label'), false);
});

test('tapping the same POI again preserves the card even when the screen point changes', async () => {
  const h = createHarness('browse');
  h.setQuery(async () => ({ features: [{ id: 17, properties: { name: 'Station' } }] }));
  h.mapPress({ x: 11, y: 12 }, [139, 35]);
  await flush();
  const first = h.nearbyLocation;
  h.mapPress({ x: 20, y: 25 }, [139.0001, 35.0001]);
  await flush();
  assert.equal(h.nearbyLocation, first, 'a repeat hit on the same feature keeps the existing card');
  assert.equal(h.browseClears, 0);
  assert.equal(h.nearbyOpens.length, 1);
});

test('same-named but distinct POI feature IDs open the newly tapped location', async () => {
  const h = createHarness('browse');
  let id = 17;
  h.setQuery(async () => ({ features: [{ id, properties: { name: 'Station' } }] }));
  h.mapPress({ x: 11, y: 12 }, [139, 35]);
  await flush();
  const first = h.nearbyLocation;
  id = 18;
  h.mapPress({ x: 20, y: 25 }, [139.0001, 35.0001]);
  await flush();
  assert.notEqual(h.nearbyLocation, first);
  assertGeo(h.nearbyLocation.geo, [35.0001, 139.0001]);
  assert.equal(h.nearbyLocation.place.name, 'Station');
});

test('a POI with no feature ID stays selected when its point geometry is unchanged', async () => {
  const h = createHarness('browse');
  h.setQuery(async () => ({ features: [{ geometry: { type: 'Point', coordinates: [139, 35] }, properties: { name: 'Station' } }] }));
  h.mapPress({ x: 11, y: 12 }, [139, 35]);
  await flush();
  const first = h.nearbyLocation;
  h.mapPress({ x: 20, y: 25 }, [139.0001, 35.0001]);
  await flush();
  assert.equal(h.nearbyLocation, first);
  assert.equal(h.nearbyOpens.length, 1);
});

test('a POI lacking ID and point geometry only matches again at the exact same clicked coordinate', async () => {
  const h = createHarness('browse');
  h.setQuery(async () => ({ features: [{ properties: { name: 'Station' } }] }));
  h.mapPress({ x: 11, y: 12 }, [139, 35]);
  await flush();
  const first = h.nearbyLocation;
  h.mapPress({ x: 20, y: 25 }, [139, 35]);
  await flush();
  assert.equal(h.nearbyLocation, first);
  h.mapPress({ x: 20, y: 25 }, [139.0001, 35.0001]);
  await flush();
  assert.notEqual(h.nearbyLocation, first);
  assertGeo(h.nearbyLocation.geo, [35.0001, 139.0001]);
});

test('a delayed basemap lookup cannot overwrite a dismissed or replaced nearby card', async () => {
  const h = createHarness('browse');
  const pending = deferred();
  let calls = 0;
  h.setQuery(() => ++calls === 1 ? pending.promise : Promise.resolve({ features: [] }));
  h.mapPress();
  h.mapPress(screenPoint, [140, 36]);
  await flush();
  pending.resolve({ features: [{ properties: { name: 'Old location' } }] });
  await flush();
  assert.deepEqual(plain(h.nearbyLocation.geo), [36, 140]);
  assert.equal(h.nearbyLocation.place, null);
  assert.equal(h.nearbyOpens.length, 1);
  assert.ok(calls > 1);
});

test('a basemap style change discards an in-flight lookup', async () => {
  const h = createHarness('browse');
  const pending = deferred();
  h.setQuery(() => pending.promise);
  h.mapPress();
  h.update({ styleIndex: 1 });
  pending.resolve({ features: [{ properties: { name: 'Old style' } }] });
  await flush();
  assert.equal(h.nearbyLocation, null);
});

test('camera movement discards an in-flight lookup at the old screen point', async () => {
  const h = createHarness('browse');
  const pending = deferred();
  let calls = 0;
  h.setQuery(() => { calls++; return pending.promise; });
  h.mapPress();
  h.moveCamera();
  pending.resolve({ features: [{ properties: { name: 'Old screen position' } }] });
  await flush();
  assert.equal(h.nearbyLocation, null);
  assert.equal(calls, 1);
  assert.deepEqual(h.nearbyOpens, []);
});

for (const initial of ['none', 'point', 'nearby']) {
  test(`prepared icon and color arrive with the first new card while preserving the previous ${initial} selection`, async () => {
    const h = createHarness('browse');
    if (initial === 'point') h.pointPress('a');
    if (initial === 'nearby') { h.mapPress(); await flush(); }
    const oldLocation = h.nearbyLocation;
    const oldPoint = h.selectedMapPoint;
    const oldOpenCount = h.nearbyOpens.length;
    const pending = deferred();
    h.setQuery(async () => ({ features: [{ id: 201, properties: { name: 'New place', maki_beta: 'government', maki: 'town-hall' } }] }));
    h.setPrepareIcon(() => pending.promise);
    h.mapPress(screenPoint, [140, 36]);
    await flush();
    assert.equal(h.nearbyLocation, oldLocation);
    assert.equal(h.selectedMapPoint, oldPoint);
    assert.equal(h.nearbyOpens.length, oldOpenCount);
    assert.deepEqual(h.iconPreparations, [['government', 'town-hall']]);
    const asset = { uri: 'file:///ready.png', color: '#3156a7' };
    pending.resolve(asset);
    await flush();
    assert.equal(h.nearbyOpens.length, oldOpenCount + 1);
    assert.equal(h.nearbyLocation.place.name, 'New place');
    assert.equal(h.nearbyLocation.place.iconAsset, asset, 'the prepared asset is available in the opening state');
    assert.deepEqual(plain(h.nearbyLocation.geo), [36, 140]);
  });
}

test('the newest map click wins when icon preparation resolves out of order', async () => {
  const h = createHarness('browse');
  const first = deferred();
  const second = deferred();
  let id = 1;
  h.setQuery(async () => ({ features: [{ id, properties: { name: `Place ${id}`, maki: `${id}` } }] }));
  h.setPrepareIcon((icon) => icon === '1' ? first.promise : second.promise);
  h.mapPress(screenPoint, [140, 36]);
  await flush();
  id = 2;
  h.mapPress(screenPoint, [141, 37]);
  await flush();
  second.resolve({ uri: 'file:///second.png', color: '#222222' });
  await flush();
  first.resolve({ uri: 'file:///first.png', color: '#111111' });
  await flush();
  assert.equal(h.nearbyOpens.length, 1);
  assert.equal(h.nearbyLocation.place.name, 'Place 2');
  assert.deepEqual(plain(h.nearbyLocation.geo), [37, 141]);
});

for (const change of ['camera', 'style', 'map replacement', 'unmount', 'point selection', 'clear']) {
  test(`${change} while icon preparation is pending prevents the old card from opening`, async () => {
    const h = createHarness('browse');
    h.pointPress('a');
    const pending = deferred();
    h.setQuery(async () => ({ features: [{ properties: { name: 'Stale place', maki: 'police' } }] }));
    h.setPrepareIcon(() => pending.promise);
    h.mapPress();
    await flush();
    assert.equal(h.iconPreparations.length, 1);
    if (change === 'camera') h.moveCamera();
    else if (change === 'style') h.update({ styleIndex: 1 });
    else if (change === 'map replacement') h.setMap({});
    else if (change === 'unmount') h.unmount();
    else if (change === 'point selection') h.pointPress('b');
    else h.clearPopup();
    pending.resolve({ uri: 'file:///stale.png', color: '#3156a7' });
    await flush();
    assert.equal(h.nearbyLocation, null);
    assert.deepEqual(h.nearbyOpens, []);
    assert.deepEqual(plain(h.selectedMapPoint), change === 'clear' ? null : reference(change === 'point selection' ? 'b' : 'a'));
  });
}

test('an empty-map click closes the current card without waiting for pending icon preparation', async () => {
  const h = createHarness('browse');
  h.pointPress('a');
  const pending = deferred();
  h.setPrepareIcon(() => pending.promise);
  h.setQuery(async () => ({ features: [{ properties: { name: 'Old place', maki: 'police' } }] }));
  h.mapPress();
  await flush();
  h.setQuery(async () => ({ features: [] }));
  h.mapPress(screenPoint, [140, 36]);
  await flush();
  assert.equal(h.selectedMapPoint, null);
  assert.equal(h.nearbyLocation, null);
  assert.equal(h.browseClears, 1);
  assert.equal(h.iconPreparations.length, 1);
  pending.resolve({ uri: 'file:///stale.png', color: '#3156a7' });
  await flush();
  assert.deepEqual(h.nearbyOpens, []);
});

test('icon preparation failure still opens the recognized place with a stable null asset', async () => {
  const h = createHarness('browse');
  h.setQuery(async () => ({ features: [{ properties: { name: 'Recognized place', maki: 'police' } }] }));
  h.setPrepareIcon(async () => { throw new Error('icon unavailable'); });
  h.mapPress();
  await flush();
  assert.equal(h.nearbyLocation.place.name, 'Recognized place');
  assert.equal(h.nearbyLocation.place.iconAsset, null);
  assert.equal(h.browseClears, 0);
  assert.equal(h.nearbyOpens.length, 1);
});

test('a repeated hit on the selected feature does not prepare its icon again', async () => {
  const h = createHarness('browse');
  h.setQuery(async () => ({ features: [{ id: 17, properties: { name: 'Station', maki: 'rail' } }] }));
  h.mapPress();
  await flush();
  const original = h.nearbyLocation;
  h.setPrepareIcon(() => assert.fail('same-feature clicks must reuse the current card'));
  h.mapPress(screenPoint, [139.0001, 35.0001]);
  await flush();
  assert.equal(h.nearbyLocation, original);
  assert.equal(h.iconPreparations.length, 1);
});

test('losing map data while the icon is preparing prevents opening a card', async () => {
  const h = createHarness('browse');
  const pending = deferred();
  h.setQuery(async () => ({ features: [{ properties: { name: 'Place', maki: 'rail' } }] }));
  h.setPrepareIcon(() => pending.promise);
  h.mapPress();
  await flush();
  h.setHasMapData(false);
  pending.resolve(null);
  await flush();
  assert.equal(h.nearbyLocation, null);
  assert.deepEqual(h.nearbyOpens, []);
});

test('plan empty-map taps open and close their own coordinate card without changing browse selection', async () => {
  const h = createHarness('plan');
  const browseLocation = { id: 99, geo: [10, 20], place: null };
  h.setBrowseState({ nearbyMapLocation: browseLocation, selectedMapPoint: reference('c') });
  h.enablePlanNearby(reference('a'));
  h.mapPress(screenPoint, [140, 36]);
  await flush();
  assert.deepEqual(plain(h.planNearbyLocation.geo), [36, 140]);
  assert.equal(h.planNearbyLocation.place, null);
  assert.deepEqual(plain(h.planSelectedPoint), reference('a'), 'a selected plan point does not prevent opening nearby coordinates');
  assert.ok(h.nearbyCard, 'the plan map renders its controlled nearby card');
  h.mapPress(screenPoint, [141, 37]);
  await flush();
  assert.equal(h.planNearbyLocation, null);
  assert.deepEqual(plain(h.planSelectedPoint), reference('a'), 'closing nearby leaves the bottom plan card selected');
  assert.equal(h.planNearbyOpens.length, 1);
  assert.equal(h.nearbyLocation, browseLocation);
  assert.deepEqual(plain(h.selectedMapPoint), reference('c'));
  assert.deepEqual(h.nearbyOpens, []);
  assert.equal(h.browseClears, 0);
});

test('a named plan-map place opens independently after its appearance is ready and keeps the selected plan point', async () => {
  const h = createHarness('plan');
  h.enablePlanNearby(reference('a'));
  const pending = deferred();
  h.setQuery(async () => ({ features: [{ id: 51, properties: { name: 'Station', maki: 'rail' } }] }));
  h.setPrepareIcon(() => pending.promise);
  h.mapPress(screenPoint, [140, 36]);
  await flush();
  assert.deepEqual(plain(h.planSelectedPoint), reference('a'));
  assert.equal(h.planNearbyLocation, null);
  pending.resolve(null);
  await flush();
  assert.deepEqual(plain(h.planSelectedPoint), reference('a'));
  assert.equal(h.planNearbyLocation.place.name, 'Station');
  assert.deepEqual(plain(h.planNearbyLocation.geo), [36, 140]);
  assert.equal(h.mapPresses.length, 0, 'the old card was replaced instead of closed first');
  assert.deepEqual(h.browseSelections, []);
});

test('plan nearby-card screenshots select the plan point and close only the nearby card', async () => {
  const h = createHarness('plan');
  const browseLocation = { id: 99, geo: [10, 20], place: null };
  h.setBrowseState({ nearbyMapLocation: browseLocation, selectedMapPoint: reference('c') });
  h.enablePlanNearby(reference('a'));
  h.setNearbyCandidates([{ point: work.points[1], bangumi: work, distanceMeters: 20 }]);
  h.mapPress();
  await flush();
  assert.equal(h.nearbyCard.props.nearbyPoints[0].point.id, 'b');
  h.nearbyCard.props.onPointPress(work.points[1], work);
  await flush();
  assert.deepEqual(plain(h.planSelectedPoint), reference('b'));
  assert.equal(h.planNearbyLocation, null);
  assert.equal(h.nearbyCard, undefined, 'the nearby annotation is removed after screenshot selection');
  assert.deepEqual(h.selected, [reference('b')]);
  assert.deepEqual(h.projected, [], 'a card screenshot does not perform artwork hit testing');
  assert.deepEqual(h.browseSelections, []);
  assert.deepEqual(plain(h.selectedMapPoint), reference('c'));
  assert.equal(h.nearbyLocation, browseLocation);
  assert.equal(h.browseClears, 0);
});

test('a nearby screenshot of the current plan point still selects it and closes the nearby card', async () => {
  const h = createHarness('plan');
  const browseLocation = { id: 99, geo: [10, 20], place: null };
  h.setBrowseState({ nearbyMapLocation: browseLocation, selectedMapPoint: reference('c') });
  h.enablePlanNearby(reference('a'));
  h.setNearbyCandidates([{ point: work.points[0], bangumi: work, distanceMeters: 20 }]);
  h.mapPress();
  await flush();

  assert.equal(h.nearbyCard.props.nearbyPoints[0].point.id, 'a');
  h.nearbyCard.props.onPointPress(work.points[0], work);
  await flush();

  assert.deepEqual(h.selected, [reference('a')], 'the plan receives the selection so it can refocus');
  assert.deepEqual(plain(h.planSelectedPoint), reference('a'));
  assert.deepEqual(h.mapPresses, ['press'], 'the nearby dismissal callback runs even for the current point');
  assert.equal(h.planNearbyLocation, null);
  assert.equal(h.nearbyCard, undefined);
  assert.deepEqual(h.projected, [], 'a card screenshot does not perform artwork hit testing');
  assert.deepEqual(h.browseSelections, []);
  assert.deepEqual(plain(h.selectedMapPoint), reference('c'));
  assert.equal(h.nearbyLocation, browseLocation);
  assert.equal(h.browseClears, 0);
});

test('ordinary plan-marker selection keeps the independent nearby card open', async () => {
  const h = createHarness('plan');
  h.enablePlanNearby(reference('a'));
  h.mapPress();
  await flush();
  const nearby = h.planNearbyLocation;
  h.pointPress('b');
  await flush();
  assert.deepEqual(plain(h.planSelectedPoint), reference('b'));
  assert.equal(h.planNearbyLocation, nearby);
  assert.ok(h.nearbyCard);
  assert.equal(h.mapPresses.length, 0, 'ordinary marker selection does not invoke nearby dismissal');
});

test('plan nearby candidates use the supplied plan points and plan work filter rather than browse filters', async () => {
  const h = createHarness('plan');
  h.setBrowseState({ filteredBangumiId: 999 });
  h.setBrowseSelectedBangumiIds([999]);
  h.enablePlanNearby();
  const planWork = { ...work, points: work.points.slice(1) };
  h.update({ bangumis: [planWork], selectedBangumiIds: [10] });
  h.mapPress(screenPoint, [140, 36]);
  await flush();
  const [bangumis, geo, singleFilter, multiFilter] = h.nearbySearches.at(-1);
  assert.equal(bangumis[0], planWork);
  assert.deepEqual(bangumis[0].points.map((point) => point.id), ['b', 'c']);
  assert.deepEqual(plain(geo), [36, 140]);
  assert.equal(singleFilter, null);
  assert.deepEqual(multiFilter, [10]);
  h.update({ selectedBangumiIds: [] });
  assert.deepEqual(h.nearbySearches.at(-1)[3], []);
});

test('changing browse state does not invalidate a pending plan nearby lookup', async () => {
  const h = createHarness('plan');
  h.enablePlanNearby();
  const pending = deferred();
  h.setQuery(() => pending.promise);
  h.mapPress();
  await flush();
  h.setBrowseState({ selectedMapPoint: reference('b'), nearbyMapLocation: null });
  pending.resolve({ features: [{ properties: { name: 'Plan place' } }] });
  await flush();
  assert.equal(h.planNearbyLocation.place.name, 'Plan place');
  assert.deepEqual(plain(h.selectedMapPoint), reference('b'));
});

test('a named place switches directly between plan nearby cards, while hitting the same feature keeps it', async () => {
  const h = createHarness('plan');
  h.enablePlanNearby(reference('a'));
  let id = 1;
  h.setQuery(async () => ({ features: [{ id, properties: { name: 'Place' } }] }));
  h.mapPress();
  await flush();
  const first = h.planNearbyLocation;
  id = 2;
  h.mapPress(screenPoint, [140, 36]);
  await flush();
  assert.notEqual(h.planNearbyLocation.id, first.id);
  assert.equal(h.planNearbyOpens.length, 2);
  assert.equal(h.mapPresses.length, 0);
  const second = h.planNearbyLocation;
  h.mapPress(screenPoint, [140.0001, 36.0001]);
  await flush();
  assert.equal(h.planNearbyLocation, second);
  assert.equal(h.planNearbyOpens.length, 2);
  assert.deepEqual(plain(h.planSelectedPoint), reference('a'));
});

for (const change of ['selected point', 'selection away and back', 'camera', 'style', 'unmount']) {
  test(`a plan ${change} change discards pending nearby icon preparation`, async () => {
    const h = createHarness('plan');
    h.enablePlanNearby(reference('a'));
    const pending = deferred();
    h.setQuery(async () => ({ features: [{ properties: { name: 'Old place', maki: 'rail' } }] }));
    h.setPrepareIcon(() => pending.promise);
    h.mapPress();
    await flush();
    if (change === 'selected point') h.update({ selectedPoint: reference('b') });
    else if (change === 'selection away and back') {
      const original = h.planSelectedPoint;
      h.update({ selectedPoint: reference('b') });
      h.update({ selectedPoint: original });
    } else if (change === 'camera') h.moveCamera();
    else if (change === 'style') h.update({ styleIndex: 1 });
    else h.unmount();
    pending.resolve(null);
    await flush();
    assert.equal(h.planNearbyLocation, null);
    assert.deepEqual(h.planNearbyOpens, []);
  });
}

test('an empty plan-map tap supersedes a pending named-place request without clearing the selected plan point', async () => {
  const h = createHarness('plan');
  h.enablePlanNearby(reference('a'));
  const pending = deferred();
  h.setQuery(() => pending.promise);
  h.mapPress();
  await flush();
  h.setQuery(async () => ({ features: [] }));
  h.mapPress(screenPoint, [140, 36]);
  await flush();
  assert.deepEqual(plain(h.planSelectedPoint), reference('a'));
  const coordinates = h.planNearbyLocation;
  assert.deepEqual(plain(coordinates.geo), [36, 140]);
  pending.resolve({ features: [{ properties: { name: 'Stale' } }] });
  await flush();
  assert.equal(h.planNearbyLocation, coordinates);
  assert.equal(h.planNearbyOpens.length, 1);
});

test('plan source callbacks remain stable while nearby opens and its screenshot selects a plan point', async () => {
  const h = createHarness('plan');
  h.enablePlanNearby(reference('a'));
  const handler = h.pointHandler;
  const imageHandler = h.imageHandler;
  const mapHandler = h.mapHandler;
  h.setQuery(async () => ({ features: [{ properties: { name: 'Place' } }] }));
  h.mapPress();
  await flush();
  assert.ok(h.planNearbyLocation);
  assert.equal(h.pointHandler, handler);
  assert.equal(h.imageHandler, imageHandler);
  assert.equal(h.mapHandler, mapHandler);
  h.nearbyCard.props.onPointPress(work.points[1], work);
  await flush();
  assert.equal(h.pointHandler, handler);
  assert.equal(h.imageHandler, imageHandler);
  assert.equal(h.mapHandler, mapHandler);
});

test('camera movement during plan artwork projection prevents querying the old screen point', async () => {
  const h = createHarness('plan');
  h.enablePlanNearby(reference('a'));
  h.hitRects();
  const projection = deferred();
  h.setProject(() => projection.promise);
  h.setQuery(() => assert.fail('the stale screen point must not reach the POI query'));
  h.mapPress({ x: 111, y: 100 });
  h.moveCamera();
  projection.resolve([100, 100]);
  await flush();
  assert.deepEqual(plain(h.planSelectedPoint), reference('a'));
  assert.equal(h.planNearbyLocation, null);
});

test('a failed plan POI query keeps the existing nearby card and selected plan point', async () => {
  const h = createHarness('plan');
  h.enablePlanNearby(reference('a'));
  h.mapPress();
  await flush();
  const nearby = h.planNearbyLocation;
  h.setQuery(async () => { throw new Error('native query failed'); });
  h.mapPress();
  await flush();
  assert.deepEqual(plain(h.planSelectedPoint), reference('a'));
  assert.equal(h.planNearbyLocation, nearby);
  assert.equal(h.mapPresses.length, 0);
});
