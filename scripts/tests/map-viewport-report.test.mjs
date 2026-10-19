import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/components/map/map-container.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

// Exercise the real reporting callbacks; native layout and map projection are supplied by the fixture.
function createHarness() {
  const reports = [];
  const reads = [];
  let pending;
  let report;
  let cleanup;
  let focused = true;
  let project = ([x, y]) => [139 + x / 1000, 35 - y / 1000];
  const jsx = (type, props) => ({ type, props });
  const react = {
    forwardRef: (render) => render,
    useCallback: (callback) => callback,
    useEffect: () => {},
    useMemo: (calculate) => calculate(),
    useRef: (current) => ({ current }),
    useState: (value) => [value, () => {}],
  };
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': {
      useNavigation: () => ({ isFocused: () => focused }),
      useFocusEffect: (callback) => {
        cleanup = callback();
      },
    },
    ahooks: {
      useDebounceFn: (callback) => {
        report = callback;
        return {
          run: (next) => {
            pending = next;
          },
          cancel: () => {
            pending = undefined;
          },
        };
      },
    },
    'react-i18next': { useTranslation: () => ({ i18n: { resolvedLanguage: 'zh-CN' } }) },
    '@/i18n': { resolveLanguageTag: () => 'zh-CN' },
    '@/lib/map-styles': { MAP_STYLES: [{ url: 'fixture', key: 'streets' }] },
    '@/store/use-map-browse': { useMapBrowse: (selector) => selector({ filteredBangumiId: null }) },
    '@/components/map/map-marker-selection': { MapMarkerSelectionContext: { Provider: 'Provider' } },
    '@rnmapbox/maps': { MapView: 'MapView', Camera: 'Camera' },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: (name) => modules[name] ?? {} });
  const tree = module.exports.default({
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
    bangumis: [],
    styleIndex: 0,
    mode: 'plan',
    onCameraChange: (next) => reports.push(next),
  });
  const map = tree.props.children;
  assert.equal(map.type, 'MapView');
  map.props.ref.current = {
    getCoordinateFromView: (corner) => {
      reads.push([...corner]);
      return Promise.resolve(project(corner));
    },
  };
  map.props.onDidFinishLoadingMap();
  map.props.onLayout({ nativeEvent: { layout: { width: 400, height: 800 } } });
  return {
    reports,
    reads,
    setProject: (next) => {
      project = next;
    },
    move: (heading = 45, pitch = 0, center = [139, 35]) =>
      map.props.onCameraChanged({
        properties: { zoom: 16, bounds: { sw: [138, 34], ne: [140, 36] }, center, heading, pitch },
        gestures: { isGestureActive: true },
      }),
    flush: () => {
      const next = pending;
      pending = undefined;
      return report(next);
    },
    blur: () => {
      focused = false;
      cleanup();
    },
    layout: (width, height) => map.props.onLayout({ nativeEvent: { layout: { width, height } } }),
  };
}

test('a settled rotated camera reads exactly the four map corners', async () => {
  const app = createHarness();
  app.move();
  assert.equal(app.reads.length, 0, 'camera events themselves do not cross the bridge');
  await app.flush();
  assert.deepEqual(app.reads, [
    [0, 0],
    [400, 0],
    [400, 800],
    [0, 800],
  ]);
  assert.equal(app.reports.length, 1);
  assert.equal(app.reports[0].footprint.length, 4);
});

test('rotation changes are reported even when zoom and enclosing bounds stay the same', async () => {
  const app = createHarness();
  app.move(45);
  await app.flush();
  app.move(-45);
  await app.flush();
  assert.equal(app.reports.length, 2);
  app.move(-45);
  await app.flush();
  assert.equal(app.reports.length, 2, 'identical settled viewports still deduplicate');
});

test('new camera movement discards an older native corner read', async () => {
  const app = createHarness();
  const resolvers = [];
  app.setProject(() => new Promise((resolve) => resolvers.push(resolve)));
  app.move(45);
  const oldRead = app.flush();
  app.move(90);
  resolvers.forEach((resolve) => resolve([139, 35]));
  await oldRead;
  assert.equal(app.reports.length, 0);
  app.setProject(([x, y]) => [139 + x / 1000, 35 - y / 1000]);
  await app.flush();
  assert.equal(app.reports.length, 1);
});

test('moving the camera center still reports a viewport when enclosing bounds remain unchanged', async () => {
  const app = createHarness();
  app.move(45, 0, [139, 35]);
  await app.flush();
  app.move(45, 0, [139.1, 35]);
  await app.flush();
  assert.equal(app.reports.length, 2);
});

test('leaving the map discards native reads still in flight', async () => {
  const app = createHarness();
  const resolvers = [];
  app.setProject(() => new Promise((resolve) => resolvers.push(resolve)));
  app.move();
  const read = app.flush();
  app.blur();
  resolvers.forEach((resolve) => resolve([139, 35]));
  await read;
  assert.equal(app.reports.length, 0);
});

test('returning to a flat north-up camera removes the old footprint without native reads', async () => {
  const app = createHarness();
  app.move();
  await app.flush();
  app.move(0);
  await app.flush();
  assert.equal(app.reads.length, 4);
  assert.equal(app.reports.length, 2);
  assert.equal(app.reports[1].footprint, undefined);
});

test('resizing the map samples the new screen dimensions', async () => {
  const app = createHarness();
  app.move();
  await app.flush();
  app.layout(800, 400);
  await app.flush();
  assert.deepEqual(app.reads.slice(4), [
    [0, 0],
    [800, 0],
    [800, 400],
    [0, 400],
  ]);
});
