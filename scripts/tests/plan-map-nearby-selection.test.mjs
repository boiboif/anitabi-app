import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/app/plans/[planId]/map.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const point = (id, geo) => ({ id, geo, density: 1 });
const works = [
  { id: 1, points: [point('a', [35, 139]), point('outside-plan', [35, 139])] },
  { id: 2, points: [point('b', [36, 140])] },
];
const plan = { id: 'plan', items: [
  { key: '1:a', bangumiId: 1, pointId: 'a', completed: false },
  { key: '2:b', bangumiId: 2, pointId: 'b', completed: false },
] };
const location = (id = 1) => ({ id, geo: [35.5, 139.5], place: { name: `Place ${id}` } });
const plain = (value) => JSON.parse(JSON.stringify(value));

function find(root, type) {
  if (!root || typeof root !== 'object') return null;
  if (root.type === type) return root;
  for (const child of [root.props?.children].flat(Infinity)) {
    const result = find(child, type);
    if (result) return result;
  }
  return null;
}

function createHarness(params = {}) {
  const slots = [];
  const cameraCalls = [];
  const data = { data: { bangumis: works } };
  let cursor = 0;
  let tree;
  const sameDeps = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      const slot = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      slot.set ??= (next) => { slot.value = typeof next === 'function' ? next(slot.value) : next; };
      return [slot.value, slot.set];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useMemo(calculate, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { value: calculate(), deps };
      return slots[index].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect() { cursor++; },
  };
  const jsx = (type, props) => ({ type, props });
  const component = (name) => ({ __esModule: true, default: name });
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
    'react-native': { Pressable: 'Pressable' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 20, bottom: 10, left: 0, right: 0 }) },
    tamagui: { View: 'View', YStack: 'YStack', Text: 'Text' },
    'expo-router': { Stack: { Screen: 'Screen' }, useRouter: () => ({ back() {} }), useLocalSearchParams: () => ({ planId: 'plan', ...params }) },
    '@tamagui/lucide-icons-2': { ArrowLeft: 'ArrowLeft', List: 'List' },
    '@/hooks/use-map-locate': { useMapLocate: () => ({ handleLocate() {}, isLocating: false, isLocationPuckActive: true }) },
    '@/hooks/use-themed-map-style': { useThemedMapStyle: () => react.useState(0) },
    '@/lib/constants': { MAP_CONTROL_ICON_SIZE: 24, MAP_CONTROL_SIZE: 40, MAP_TOP_CONTROLS_TOP_OFFSET: 60 },
    '@/lib/map-camera': { getPointFlyToZoom: () => 18 },
    '@/lib/ui-sizes': { ICON_BUTTON_ICON_SIZE: 20, SELECTED_MAP_POINT_DOT_DIAMETER: 16 },
    '@/store/use-plans': { usePlans: (selector) => selector({ plans: [plan], togglePoint() {} }) },
    '@/store/use-map-data': { useMapData: (selector) => selector({ data, progress: null }) },
    '@/utils/bangumi-point-lookup': { createBangumiPointLookup: (bangumis) => (id) => {
      const bangumi = bangumis.find((item) => item.id === id);
      return bangumi ? { bangumi, pointsById: new Map(bangumi.points.map((item) => [item.id, item])) } : undefined;
    } },
    '@/utils/plan-point-membership': { getPlanPointMembership: (items) => JSON.stringify(items.map((item) => [item.bangumiId, item.pointId])) },
    '@/components/ui/strict-button': { StrictButton: 'Button' },
    '@/components/plan/plan-map-point-card': { ...component('PlanMapPointCard'), PLAN_MAP_POINT_CARD_BOTTOM_OFFSET: 8, PLAN_MAP_POINT_CARD_FALLBACK_HEIGHT: 100 },
    '@/components/plan/plan-map-point-list-sheet': component('PlanMapPointListSheet'),
  };
  for (const [path, name] of [
    ['building-3d-switch', 'Building3DSwitch'], ['layer-switch', 'LayerSwitch'], ['loading-badge', 'LoadingBadge'],
    ['locate-button', 'LocateButton'], ['map-container', 'MapContainer'], ['map-top-bangumi-icons', 'MapTopBangumiIcons'],
    ['point-image-marker-switch', 'PointImageMarkerSwitch'],
  ]) modules[`@/components/map/${path}`] = component(name);
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require(name) {
    assert.ok(name in modules, `Unexpected import ${name}; the plan route must not import the browse store`);
    return modules[name];
  } });
  const api = {
    cameraCalls,
    render() {
      cursor = 0;
      tree = module.exports.default();
      api.map().ref({ setCamera: (value) => cameraCalls.push(value), fitBounds() {} });
    },
    map: () => find(tree, 'MapContainer').props,
    card: () => find(tree, 'PlanMapPointCard')?.props,
    list: () => find(tree, 'PlanMapPointListSheet').props,
    filter: () => find(tree, 'MapTopBangumiIcons').props.filter,
  };
  api.render();
  return api;
}

test('nearby cards coexist with the selected plan point and dismissal only closes the nearby card', () => {
  const h = createHarness({ bangumiId: '1', pointId: 'a' });
  assert.equal(h.card().resolved.point.id, 'a');
  assert.equal(h.map().nearbyLocation, null);
  const selected = h.map().selectedPoint;
  const overlayBottom = h.map().scaleBarPosition.bottom;
  const nearby = location();
  h.map().onNearbyLocationOpen(nearby);
  h.render();
  assert.equal(h.map().selectedPoint, selected);
  assert.equal(h.map().nearbyLocation, nearby);
  assert.equal(h.card().resolved.point.id, 'a');
  assert.equal(h.map().scaleBarPosition.bottom, overlayBottom, 'nearby popup must not change bottom overlay spacing');
  assert.equal(h.cameraCalls.length, 0, 'opening a nearby card does not move the camera');
  h.map().onPointSelect({ bangumiId: 2, pointId: 'b' });
  h.render();
  assert.equal(h.map().nearbyLocation, nearby, 'selecting a plan point leaves the independent nearby card open');
  assert.equal(h.card().resolved.point.id, 'b');
  h.map().onMapPress();
  h.render();
  assert.equal(h.card().resolved.point.id, 'b');
  assert.equal(h.map().nearbyLocation, null);
  h.map().onNearbyLocationOpen(location(2));
  h.render();
  h.map().onMapPress();
  h.render();
  assert.equal(h.map().nearbyLocation, null);
  assert.equal(h.card().resolved.point.id, 'b');
});

test('plan points and work filters are passed independently; hiding a selected point clears only its selection', () => {
  const h = createHarness({ bangumiId: '1', pointId: 'a' });
  assert.deepEqual(plain(h.map().bangumis.map((work) => [work.id, work.points.map((p) => p.id)])), [[1, ['a']], [2, ['b']]]);
  const nearby = location();
  h.map().onNearbyLocationOpen(nearby);
  h.render();
  h.filter().onToggleBangumi(2);
  h.render();
  assert.deepEqual(plain(h.map().selectedBangumiIds), [2]);
  assert.equal(h.map().selectedPoint, null);
  assert.equal(h.map().nearbyLocation, nearby, 'the work filter retains the independent nearby card');
  h.filter().onToggleBangumi(1);
  h.render();
  assert.equal(h.map().nearbyLocation, nearby);
  assert.deepEqual(plain(h.map().selectedBangumiIds), [2, 1]);
});

test('nearby thumbnail selection preserves map-tap camera policy and same-point identity', () => {
  const h = createHarness();
  h.map().onViewportChange({ zoom: 19, bounds: { sw: [138, 34], ne: [141, 37] } });
  h.map().onNearbyLocationOpen(location());
  h.render();
  h.map().onPointSelect({ bangumiId: 1, pointId: 'a' });
  h.render();
  const reference = h.map().selectedPoint;
  assert.deepEqual(plain(h.cameraCalls[0].centerCoordinate), [139, 35]);
  assert.equal(h.cameraCalls[0].zoomLevel, undefined);
  assert.equal(h.cameraCalls[0].animationDuration, 200);
  assert.equal(h.cameraCalls[0].animationMode, 'easeTo');
  h.map().onPointSelect({ bangumiId: 1, pointId: 'a' });
  h.render();
  assert.equal(h.map().selectedPoint, reference);
  assert.equal(h.cameraCalls.length, 2, 'same-point presses still retain existing camera refocus behavior');
  h.map().onViewportChange({ zoom: 16, bounds: null });
  h.map().onNearbyLocationOpen(location(2));
  h.render();
  h.map().onPointSelect({ bangumiId: 2, pointId: 'b' });
  assert.equal(h.cameraCalls.at(-1).zoomLevel, 18);
  assert.equal(h.cameraCalls.at(-1).animationDuration, 1000);
});

test('point-list selection preserves the nearby card, list camera rules and work-filter behavior', () => {
  const h = createHarness();
  h.filter().onToggleBangumi(2);
  h.render();
  h.map().onViewportChange({ zoom: 19, bounds: { sw: [138, 34], ne: [141, 37] } });
  const nearby = location();
  h.map().onNearbyLocationOpen(nearby);
  h.render();
  h.list().onSelect(h.list().points[0]);
  h.render();
  assert.equal(h.map().nearbyLocation, nearby);
  assert.equal(h.card().resolved.point.id, 'a');
  assert.deepEqual(plain(h.map().selectedBangumiIds), []);
  assert.equal(h.cameraCalls.at(-1).zoomLevel, undefined);
  assert.equal(h.cameraCalls.at(-1).animationDuration, 200);
});

test('separate plan screen instances own independent nearby selections', () => {
  const first = createHarness();
  const second = createHarness();
  const open = first.map().onNearbyLocationOpen;
  first.map().onNearbyLocationOpen(location());
  first.render();
  second.render();
  assert.equal(second.map().nearbyLocation, null);
  assert.equal(first.map().onNearbyLocationOpen, open);
  first.map().onMapPress();
  first.render();
  assert.equal(first.map().nearbyLocation, null);
});
