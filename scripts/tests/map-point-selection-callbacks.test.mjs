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
  const projected = [];
  const selected = [];
  const mapPresses = [];
  const browseSelections = [];
  let browseClears = 0;
  const browseState = {
    selectedMapPoint: null,
    lastPopupMapPoint: null,
    selectMapPoint: (value) => browseSelections.push(plain(value)),
    clearSelectedMapPoint: () => browseClears++,
    openBangumiDetails: () => {},
  };
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
    useEffect: () => {
      cursor++;
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
    '@/lib/map-styles': { MAP_STYLES: [{ url: 'fixture', key: 'streets' }] },
    '@/lib/constants': { MAP_DEFAULT_ZOOM: 4.6, MAP_COMPASS_TOP_OFFSET: 0 },
    '@/store/use-map-browse': { useMapBrowse: (selector) => selector(browseState) },
    '@/components/map/map-marker-selection': { MapMarkerSelectionContext: { Provider: 'Provider' } },
    '@/components/map/map-markers': { __esModule: true, default: 'MapMarkers' },
    '@/components/map/point-image-markers': { __esModule: true, default: 'PointImageMarkers' },
    '@/components/map/bangumi-icons': { __esModule: true, default: 'BangumiIcons' },
    '@/components/map/point-popup-card': { __esModule: true, default: 'PopupCard' },
    '@/components/map/map-selected-point-layers': {
      getSelectedPlanMarkerKey: (bangumiId, pointId, showImage) => `${bangumiId}:${pointId}:${showImage}`,
      SelectedPlanMapPointLayer: 'SelectedPlanMapPointLayer',
      SelectedMapPointLayer: 'SelectedMapPointLayer',
    },
    '@rnmapbox/maps': { MapView: 'MapView', Camera: 'Camera', Images: 'Images', Image: 'Image' },
    'react-native-svg': { __esModule: true, default: 'Svg', Circle: 'Circle', Path: 'Path' },
    tamagui: { YStack: 'YStack' },
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
    setMap(next) {
      find(tree, 'MapView').props.ref.current = next;
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
    mapPress(at = screenPoint) {
      this.mapHandler({ properties: { screenPointX: at.x, screenPointY: at.y } });
    },
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
    get browseClears() {
      return browseClears;
    },
  };
}

async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
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

test('browse point selection and blank-map dismissal remain independent of the plan event snapshot', () => {
  const h = createHarness('browse');
  const handler = h.pointHandler;
  h.update({ selectedPoint: reference('b'), onPointSelect: () => assert.fail('browse uses the browse store') });
  assert.equal(h.pointHandler, handler);
  h.pointPress('b');
  h.mapPress();
  assert.deepEqual(h.browseSelections, [reference('b')]);
  assert.equal(h.browseClears, 1);
  assert.deepEqual(h.projected, []);
});
