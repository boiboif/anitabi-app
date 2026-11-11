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
  let prepareIcon = async () => null;
  const iconPreparations = [];
  const projected = [];
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
    '@/store/use-map-bangumi-filter': { useMapBangumiFilter: (selector) => selector({ selectedBangumiIds: browseSelectedBangumiIds }) },
    '@/services/administrative-region': { observeAdministrativeRegion: () => () => {} },
    '@/services/nearby-place-sprite': {
      preparePlaceIcon: (...args) => { iconPreparations.push(args); return prepareIcon(...args); },
      prefetchPlaceSprite: () => {},
    },
    '@/services/map-text-color': { prefetchMapStyle: () => {} },
    '@/utils/nearby-points': { findNearbyPoints: (...args) => { nearbySearches.push(args); return nearbyCandidates; } },
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
