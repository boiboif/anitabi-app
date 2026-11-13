import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/components/map/map-container.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

const work = { id: 10, points: [{ id: 'a', geo: [35, 139] }, { id: 'b', geo: [36, 140] }] };
const otherWork = { id: 20, points: [{ id: 'a', geo: [35, 139] }] };
const pointRef = (pointId, bangumiId = work.id) => ({ bangumiId, pointId });
const sameDeps = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));

function find(node, type) {
  if (!node || typeof node !== 'object') return;
  if (node.type === type) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, type);
    if (result) return result;
  }
}

// Run the actual component's hooks and element creation. The map projection,
// frame scheduling and rerenders are deliberately controlled by the test.
// This is not a React Native renderer and cannot prove native frame ordering.
function createHarness() {
  const browseSubscribers = new Set();
  let bangumis = [work, otherWork];
  let browse = {
    selectedMapPoint: null, nearbyMapLocation: null, filteredBangumiId: null,
    openBangumiDetails() {}, selectMapPoint() {}, focusPointFromNearby() {},
  };
  function updateBrowse(patch) {
    const previous = browse;
    browse = { ...browse, ...patch };
    for (const listener of browseSubscribers) listener(browse, previous);
  }
  const useMapBrowse = (selector) => selector(browse);
  useMapBrowse.getState = () => browse;
  useMapBrowse.subscribe = (listener) => {
    browseSubscribers.add(listener);
    return () => browseSubscribers.delete(listener);
  };
  const slots = [];
  const effects = [];
  const frames = new Map();
  const projections = [];
  let frameId = 0;
  let nextNearbyId = 1;
  let notifyRegion;
  let cursor = 0;
  let tree;
  let dirty = false;
  const react = {
    forwardRef: (render) => render,
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (next) => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useMemo(calculate, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { deps, value: calculate() };
      return slots[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(run, deps) { schedule(run, deps); },
    useLayoutEffect(run, deps) { schedule(run, deps); },
  };
  function schedule(run, deps) {
    const index = cursor++;
    if (!sameDeps(slots[index]?.deps, deps)) effects.push({ index, run, deps });
  }
  const jsx = (type, props, key) => ({ type, props, key });
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { useNavigation: () => ({ isFocused: () => true }), useFocusEffect() {} },
    ahooks: { useDebounceFn: () => ({ run() {}, cancel() {} }) },
    'react-i18next': { useTranslation: () => ({ i18n: { resolvedLanguage: 'zh-CN' } }) },
    '@/i18n': { resolveLanguageTag: () => 'zh-CN' },
    '@/lib/map-styles': { MAP_STYLES: [{ url: 'fixture', key: 'streets' }] },
    '@/lib/constants': { MAP_DEFAULT_ZOOM: 4, MAP_COMPASS_TOP_OFFSET: 0 },
    '@/store/use-map-browse': { useMapBrowse },
    '@/store/use-map-bangumi-filter': { useMapBangumiFilter: (selector) => selector({ selectedBangumiIds: [] }) },
    '@/services/administrative-region': {
      observeAdministrativeRegion: (_geo, callback) => {
        notifyRegion = callback;
        return () => { if (notifyRegion === callback) notifyRegion = undefined; };
      },
    },
    '@/utils/nearby-points': { findNearbyPoints: () => [] },
    '@/services/nearby-place-sprite': { prefetchPlaceSprite() {}, preparePlaceIcon: async () => null },
    '@/services/map-text-color': { prefetchMapStyle() {} },
    '@/components/map/map-marker-selection': { MapMarkerSelectionContext: { Provider: 'Provider' } },
    '@/components/map/map-markers': { __esModule: true, default: 'MapMarkers' },
    '@/components/map/point-image-markers': { __esModule: true, default: 'PointImageMarkers' },
    '@/components/map/bangumi-icons': { __esModule: true, default: 'BangumiIcons' },
    '@/components/map/point-popup-card': { __esModule: true, default: 'PopupCard' },
    '@/components/map/nearby-point-popup-card': { __esModule: true, default: 'NearbyPointPopupCard' },
    '@/components/map/map-selected-point-layers': {
      getSelectedPlanMarkerKey: () => '', SelectedPlanMapPointLayer: 'SelectedPlanMapPointLayer',
      SelectedMapPointLayer: 'SelectedMapPointLayer',
    },
    '@rnmapbox/maps': { MapView: 'MapView', Camera: 'Camera', Images: 'Images', Image: 'Image', MarkerView: 'MarkerView' },
    '@tamagui/lucide-icons-2': {},
    'react-native-svg': { __esModule: true, default: 'Svg', Circle: 'Circle', Path: 'Path' },
    tamagui: { YStack: 'YStack', useTheme: () => ({ primary: { val: '#000' } }) },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, require: (name) => modules[name] ?? {},
    requestAnimationFrame: (callback) => { const id = ++frameId; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  const nativeMap = {
    getPointInView(coordinate) {
      let resolve;
      const promise = new Promise((done) => { resolve = done; });
      projections.push({ coordinate: [...coordinate], resolve });
      return promise;
    },
  };
  function render() {
    cursor = 0;
    effects.length = 0;
    dirty = false;
    tree = module.exports.default({
      insets: { top: 0, bottom: 0, left: 0, right: 0 }, bangumis, styleIndex: 0,
      mode: 'browse', showPointImageMarkers: false,
    });
    find(tree, 'MapView').props.ref.current ??= nativeMap;
    for (const effect of effects) {
      slots[effect.index]?.cleanup?.();
      slots[effect.index] = { deps: effect.deps, cleanup: effect.run() };
    }
    return tree;
  }
  function select(pointId, bangumiId = work.id) {
    updateBrowse({ selectedMapPoint: pointRef(pointId, bangumiId), nearbyMapLocation: null });
    return render();
  }
  function updatePointGeo(bangumiId, pointId, geo) {
    bangumis = bangumis.map((item) => item.id === bangumiId
      ? { ...item, points: item.points.map((point) => point.id === pointId ? { ...point, geo } : point) }
      : item);
    return render();
  }
  function popup(type = 'PopupCard') {
    return popups(type).at(-1);
  }
  function popups(type = 'PopupCard') {
    const result = [];
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'MarkerView' && find(node, type)) result.push(node);
      for (const child of [node.props?.children].flat(Infinity)) {
        walk(child);
      }
    }
    walk(tree);
    return result;
  }
  async function settleProjection(index) {
    projections[index].resolve([100, 100]);
    for (let i = 0; i < 4; i++) await Promise.resolve();
  }
  function frame() {
    const current = [...frames.values()];
    frames.clear();
    current.forEach((callback) => callback());
    if (dirty) render();
  }
  function openNearby(geo) {
    const location = { id: nextNearbyId++, geo, place: null };
    updateBrowse({ selectedMapPoint: null, nearbyMapLocation: location });
    return render();
  }
  function close() {
    updateBrowse({ selectedMapPoint: null, nearbyMapLocation: null });
    return render();
  }
  function updatePlace(name) {
    updateBrowse({ nearbyMapLocation: { ...browse.nearbyMapLocation, place: { name } } });
    render();
  }
  function updateRegion(region) {
    assert.ok(notifyRegion, 'the active nearby location subscribes to region updates');
    notifyRegion(region);
    if (dirty) render();
  }
  render();
  return { select, updatePointGeo, openNearby, close, updatePlace, updateRegion, popup, popups, projections, settleProjection, frame, render, frames };
}

function assertPoint(marker, pointId, coordinate) {
  assert.ok(marker, `point ${pointId} has a marker element`);
  assert.equal(find(marker, 'PopupCard').props.point.id, pointId);
  assert.deepEqual([...marker.props.coordinate], coordinate);
}

test('rapid A → B → A assigns marker identity to each point and retains one element', () => {
  const h = createHarness();
  h.select('a');
  const firstA = h.popup();
  assertPoint(firstA, 'a', [139, 35]);
  h.select('b');
  const b = h.popup();
  assertPoint(b, 'b', [140, 36]);
  assert.ok(firstA.key, 'the point marker has an explicit identity');
  assert.notEqual(firstA.key, b.key, 'switching points changes the marker element key');
  assert.equal(h.popups().length, 1, 'the rendered tree contains no previous point marker');
  h.select('a');
  const newA = h.popup();
  assertPoint(newA, 'a', [139, 35]);
  assert.notEqual(b.key, newA.key);
  assert.equal(firstA.key, newA.key, 'returning to the same point restores its identity');
  assert.equal(h.popups().length, 1);
  assert.equal(h.projections.length, 0, 'the point popup does not queue native position gates');
  assert.equal(h.frames.size, 0, 'the point popup does not schedule delayed visibility frames');
});

test('reselecting the same point preserves its marker element key', () => {
  const h = createHarness();
  h.select('a');
  const first = h.popup();
  h.select('a');
  const repeated = h.popup();
  assertPoint(repeated, 'a', [139, 35]);
  assert.ok(first.key);
  assert.equal(repeated.key, first.key);
  assert.equal(h.popups().length, 1);
});

test('point identity includes the work even when point ID and coordinates match', () => {
  const h = createHarness();
  h.select('a');
  const first = h.popup();
  h.select('a', otherWork.id);
  const other = h.popup();
  assertPoint(other, 'a', [139, 35]);
  assert.equal(find(other, 'PopupCard').props.bangumi.id, otherWork.id);
  assert.notEqual(other.key, first.key);
  assert.equal(h.popups().length, 1);
});

test('changing coordinates for the same point changes the marker element key', () => {
  const h = createHarness();
  h.select('a');
  const first = h.popup();
  h.updatePointGeo(work.id, 'a', [35.5, 139.5]);
  const updated = h.popup();
  assertPoint(updated, 'a', [139.5, 35.5]);
  assert.notEqual(updated.key, first.key);
  assert.equal(h.popups().length, 1);
});

test('nearby to point removes the nearby annotation and presents the selected point', () => {
  const h = createHarness();
  h.openNearby([35.5, 139.5]);
  const nearby = h.popup('NearbyPointPopupCard');
  assert.ok(nearby, 'nearby marker element is present while selected');
  assert.deepEqual([...nearby.props.coordinate], [139.5, 35.5]);
  const card = find(nearby, 'NearbyPointPopupCard');
  assert.equal(card.props.mapStyleURL, 'fixture');
  assert.equal(card.props.mapZoom, 4);

  h.select('b');
  assert.equal(h.popup('NearbyPointPopupCard'), undefined, 'nearby marker element is removed');
  assertPoint(h.popup(), 'b', [140, 36]);
  assert.equal(h.projections.length, 0, 'obsolete nearby positioning cannot complete later');
  assert.equal(h.frames.size, 0, 'obsolete nearby visibility frames cannot reveal an old card');
});

test('closing either kind of popup removes its marker element', () => {
  const h = createHarness();
  h.select('a');
  assert.ok(h.popup());
  h.close();
  assert.equal(h.popup(), undefined);
  h.openNearby([35.5, 139.5]);
  assert.ok(h.popup('NearbyPointPopupCard'));
  h.close();
  assert.equal(h.popup('NearbyPointPopupCard'), undefined);
});

test('nearby details update without replacing the marker; reopening creates a new location', () => {
  const h = createHarness();
  h.openNearby([35.5, 139.5]);
  const first = h.popup('NearbyPointPopupCard');
  assert.ok(first);

  h.updatePlace('附近地点');
  let updated = h.popup('NearbyPointPopupCard');
  assert.equal(updated.key, first.key, 'the async place result keeps the same marker key');
  assert.equal(find(updated, 'NearbyPointPopupCard').props.place.name, '附近地点');

  h.updateRegion('日本 神奈川県');
  updated = h.popup('NearbyPointPopupCard');
  assert.equal(updated.key, first.key, 'the async administrative region keeps the same marker key');
  assert.equal(find(updated, 'NearbyPointPopupCard').props.region, '日本 神奈川県');

  h.close();
  assert.equal(h.popup('NearbyPointPopupCard'), undefined);
  h.openNearby([35.5, 139.5]);
  const reopened = h.popup('NearbyPointPopupCard');
  assert.ok(reopened);
  assert.notEqual(reopened.key, first.key, 'reopening represents a fresh map click');
});
