import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/components/map/map-container.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

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

// Execute the production component with persistent hook slots and separate
// render/layout-commit phases. Native projection is controlled by each test;
// this does not run the React Native renderer or prove device frame rates.
function createHarness(mode = 'plan') {
  let slots = [];
  let draftSlots;
  let cursor = 0;
  let layoutEffects;
  let props;
  let tree;
  let draft;
  let project = async () => [100, 100];
  let query = async () => ({ features: [] });
  const projected = [];
  const selected = [];
  const mapPresses = [];
  const browseSelections = [];
  let browseClears = 0;
  let hasMapData = true;
  let nextLocationId = 1;
  const nearbyOpens = [];
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
  const jsx = (type, value) => ({ type, props: value });
  const navigation = { isFocused: () => true };
  const debounce = { run: () => {}, cancel: () => {} };
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { useNavigation: () => navigation, useFocusEffect: () => {} },
    ahooks: { useDebounceFn: () => debounce },
    'react-i18next': { useTranslation: () => ({ i18n: { resolvedLanguage: 'zh-CN' } }) },
    '@/i18n': { resolveLanguageTag: () => 'zh-CN' },
    '@/lib/map-styles': { MAP_STYLES: [{ url: 'fixture', key: 'streets' }, { url: 'dark', key: 'dark' }] },
    '@/lib/constants': { MAP_DEFAULT_ZOOM: 4.6, MAP_COMPASS_TOP_OFFSET: 0 },
    '@/store/use-map-browse': { useMapBrowse },
    '@/store/use-map-data': { useMapData },
    '@/store/use-map-bangumi-filter': { useMapBangumiFilter: (selector) => selector({ selectedBangumiIds: [] }) },
    '@/services/administrative-region': { observeAdministrativeRegion: () => () => {} },
    '@/utils/nearby-points': { findNearbyPoints: () => [] },
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
    '@rnmapbox/maps': { MapView: 'MapView', Camera: 'Camera', Images: 'Images', Image: 'Image' },
    '@tamagui/lucide-icons-2': { Bus: 'Bus', Fuel: 'Fuel', Hospital: 'Hospital', School: 'School', Shield: 'Shield', Train: 'Train', Utensils: 'Utensils' },
    'react-native-svg': { __esModule: true, default: 'Svg', Circle: 'Circle', Path: 'Path' },
    tamagui: { YStack: 'YStack', useTheme: () => ({ primary: { val: '#000' } }) },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
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
    queryRenderedFeaturesAtPoint: (...args) => query(...args),
  };
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
    for (const effect of draft.effects) slots[effect.index] = { deps: effect.deps, cleanup: effect.run() };
    draft = undefined;
    return tree;
  }
  render();
  commit();

  return {
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
    setQuery(next) { query = next; },
    setMap(next) {
      find(tree, 'MapView').props.ref.current = next;
    },
    moveCamera() {
      find(tree, 'MapView').props.onCameraChanged({
        properties: { center: [139, 35], zoom: 12 },
        gestures: { isGestureActive: true },
      });
    },
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
    selected,
    mapPresses,
    browseSelections,
    nearbyOpens,
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
  h.hitRects();
  h.setProject(async () => {
    throw new Error('map projection unavailable');
  });
  h.pointPress();
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

test('browse map rejects invalid coordinates and normalizes wrapped longitude', () => {
  const h = createHarness('browse');
  h.mapPress(screenPoint, [0, 91]);
  assert.deepEqual(h.nearbyOpens, []);
  h.mapPress(screenPoint, [181, 35]);
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
  const { featureKey: _featureKey, ...place } = plain(h.nearbyLocation.place);
  assert.deepEqual(place, { name: '中文', englishName: 'English', icon: 'police' });
});

test('nearby place preserves the preferred icon, standard fallback and map category', async () => {
  const h = createHarness('browse');
  h.setQuery(async () => ({
    features: [{ properties: { name: 'Station', maki_beta: 'rail-beta', maki: 'rail', class: 'transit' } }],
  }));
  h.mapPress({ x: 23, y: 45 }, [139, 35]);
  await flush();
  const { featureKey: _featureKey, ...place } = plain(h.nearbyLocation.place);
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
    const { featureKey: _featureKey, ...place } = plain(h.nearbyLocation.place);
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

test('with no open popup, a map tap opens coordinates immediately and fills in a later POI', async () => {
  const h = createHarness('browse');
  const pending = deferred();
  h.setQuery(() => pending.promise);
  h.mapPress(screenPoint, [139, 35]);
  assert.deepEqual(plain(h.nearbyLocation.geo), [35, 139]);
  assert.equal(h.nearbyLocation.place, null);
  pending.resolve({ features: [{ properties: { name: 'Station' } }] });
  await flush();
  assert.equal(h.nearbyLocation.place.name, 'Station');
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
  h.mapPress();
  await flush();
  h.mapPress(screenPoint, [140, 36]);
  pending.resolve({ features: [{ properties: { name: 'Old location' } }] });
  await flush();
  assert.deepEqual(plain(h.nearbyLocation.geo), [36, 140]);
  assert.equal(h.nearbyLocation.place, null);
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
  assert.equal(h.nearbyLocation.place, null);
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
  assert.equal(h.nearbyLocation.place, null);
  assert.equal(calls, 1);
  assert.deepEqual(plain(h.nearbyLocation.geo), [35, 139]);
});
