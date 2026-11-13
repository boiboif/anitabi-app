import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const paths = {
  image: 'src/components/point/point-image.tsx',
  popup: 'src/components/map/point-popup-card.tsx',
  actions: 'src/components/point/point-card-actions.tsx',
  button: 'src/components/comparison-camera/comparison-camera-button.tsx',
  route: 'src/app/comparison-camera.tsx',
  handlers: 'src/services/handlers.ts',
};
const compiled = Object.fromEntries(
  Object.entries(paths).map(([name, path]) => [
    name,
    ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
  ]),
);
const jsx = (type, props) => ({ type, props });
const host = (name) => ({ __esModule: true, default: name });
const pointA = { id: 'a', image: '/images/location-a.jpg', cn: 'A', geo: [35, 139] };
const pointB = { ...pointA, id: 'b', image: '/images/location-b.jpg', cn: 'B' };
const bangumi = { id: 7, title: 'Work', cover: '/images/cover.jpg' };

function find(tree, type) {
  if (Array.isArray(tree)) return tree.map((child) => find(child, type)).find(Boolean);
  if (!tree || typeof tree !== 'object') return undefined;
  return tree.type === type ? tree : find(tree.props?.children, type);
}

// Run the real entry components independently, passing their rendered child props
// down the same chain. Native image completion is the only simulated load signal.
function harness() {
  const slots = [];
  const components = {};
  const navigations = [];
  let cursor = 0;
  let dirty = false;
  let params = {};
  let mapData;
  const theme = new Proxy({}, { get: () => ({ val: '#333' }) });
  const modules = {
    react: {
      useMemo: (calculate) => calculate(),
      useState(initial) {
        const index = cursor++;
        slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
        const slot = slots[index];
        return [
          slot.value,
          (next) => {
            const value = typeof next === 'function' ? next(slot.value) : next;
            if (!Object.is(value, slot.value)) {
              slot.value = value;
              dirty = true;
            }
          },
        ];
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Pressable: 'Pressable', StatusBar: 'StatusBar', Linking: {} },
    'react-i18next': {
      useTranslation: () => ({ t: (key) => key, i18n: { resolvedLanguage: 'zh-CN' } }),
    },
    tamagui: {
      View: 'View',
      Text: 'Text',
      XStack: 'XStack',
      YStack: 'YStack',
      useTheme: () => theme,
      getTokens: () => ({ radius: new Proxy({}, { get: () => ({ val: 8 }) }) }),
    },
    '@tamagui/lucide-icons-2': { Camera: 'Camera' },
    'expo-router': {
      useRouter: () => ({ navigate: (navigation) => navigations.push(navigation), back() {} }),
      useLocalSearchParams: () => params,
    },
    '@/store/use-map-browse': { useMapBrowse: (select) => select({ openedBangumiDetailsId: null }) },
    '@/store/use-map-data': { useMapData: (select) => select({ data: mapData, isPartial: false }) },
    '@/lib/localized-data': { getPointTitle: (point) => point.cn, getBangumiTitle: (work) => work.title },
    '@/lib/copy-to-clipboard': { copyToClipboard: async () => {} },
    '@/lib/formatDuration': { formatDuration: String },
    '@/components/point/point-image': host('PointImage'),
    '@/components/point/point-card-actions': host('PointCardActions'),
    '@/components/point/favorite-point-button': host('FavoritePointButton'),
    '@/components/point/add-to-plan-button': host('AddToPlanButton'),
    '@/components/point/point-navigation-button': host('PointNavigationButton'),
    '@/components/comparison-camera/comparison-camera-button': host('ComparisonCameraButton'),
    '@/components/comparison-camera/comparison-camera-screen': host('ComparisonCameraScreen'),
    '@/components/image-preview/previewable-image': host('PreviewableImage'),
    './createHandler': { createHandler: () => ({}) },
  };
  const evaluate = (name) => {
    const exports = {};
    vm.runInNewContext(compiled[name], {
      exports,
      require(moduleName) {
        assert.ok(moduleName in modules, `unexpected import: ${moduleName}`);
        return modules[moduleName];
      },
    });
    return exports;
  };
  const { buildImageUrl } = evaluate('handlers');
  modules['@/services/handlers'] = { buildImageUrl };
  const render = (name, props) => {
    components[name] ??= evaluate(name).default;
    let tree;
    let passes = 0;
    do {
      assert.ok(++passes <= 20, 'entry state updates must converge');
      cursor = 0;
      dirty = false;
      tree = components[name](props);
    } while (dirty);
    return tree;
  };
  return {
    render,
    buildImageUrl,
    popup: (point = pointA) => render('popup', { point, bangumi }),
    navigate(actionProps) {
      const button = find(render('actions', actionProps), 'ComparisonCameraButton');
      assert.ok(button, 'camera action is available');
      const pressable = find(render('button', button.props), 'Pressable');
      let stopped = false;
      pressable.props.onPress({
        stopPropagation() {
          stopped = true;
        },
      });
      assert.equal(stopped, true);
      return navigations.at(-1);
    },
    route(navigationParams, point = pointA) {
      params = navigationParams;
      mapData = { data: { bangumis: [{ ...bangumi, points: [point] }] } };
      const screen = find(render('route'), 'ComparisonCameraScreen');
      assert.ok(screen, 'the route resolves the selected point');
      return screen.props;
    },
  };
}

test('PointImage reports its main source URI only after a successful main-image load', () => {
  const h = harness();
  const loaded = [];
  const image = find(
    h.render('image', {
      image: pointA.image,
      title: 'A',
      onThumbnailLoad: (uri) => loaded.push(uri),
    }),
    'PreviewableImage',
  );
  assert.equal(image.props.source.uri, h.buildImageUrl(pointA.image, 'plan=h360'));
  assert.equal(image.props.placeholder.uri, h.buildImageUrl(pointA.image, 'plan=h160'));
  assert.deepEqual(loaded, [], 'rendering a placeholder does not confirm the main image');
  image.props.onLoad({ source: { url: 'native-model-url', width: 640, height: 360 } });
  assert.deepEqual(loaded, [image.props.source.uri]);

  const custom = find(
    h.render('image', {
      image: pointA.image,
      title: 'A',
      thumbnailSource: { uri: 'file:///cached-thumbnail.jpg', cacheKey: 'custom-key' },
      onThumbnailLoad: (uri) => loaded.push(uri),
    }),
    'PreviewableImage',
  );
  custom.props.onLoad({ source: { url: 'native-model-url', width: 640, height: 360 } });
  assert.equal(loaded.at(-1), 'file:///cached-thumbnail.jpg', 'report the actual supplied source');

  const unchangedEntry = find(h.render('image', { image: pointA.image, title: 'A' }), 'PreviewableImage');
  assert.doesNotThrow(() => unchangedEntry.props.onLoad({ source: { width: 640, height: 360 } }));
});

test('popup uses h160 before main-image success and reuses successful h360 through the complete route chain', () => {
  const h = harness();
  let popup = h.popup();
  let actions = find(popup, 'PointCardActions').props;
  assert.equal(actions.initialReferenceUri, undefined);
  const pendingNavigation = h.navigate(actions);
  assert.equal(pendingNavigation.pathname, '/comparison-camera');
  assert.equal(h.route(pendingNavigation.params).initialReferenceUri, h.buildImageUrl(pointA.image, 'plan=h160'));

  const h360 = h.buildImageUrl(pointA.image, 'plan=h360');
  find(popup, 'PointImage').props.onThumbnailLoad(h360);
  popup = h.popup();
  actions = find(popup, 'PointCardActions').props;
  assert.equal(actions.initialReferenceUri, h360);
  const navigation = h.navigate(actions);
  assert.equal(navigation.params.initialReferenceUri, h360);
  assert.equal(navigation.params.bangumiId, String(bangumi.id));
  assert.equal(navigation.params.pointId, pointA.id);
  const screen = h.route(navigation.params);
  assert.equal(screen.initialReferenceUri, h360);
  assert.equal(screen.fullReferenceUri, h.buildImageUrl(pointA.image), 'full-resolution upgrade is unchanged');
});

test('switching popup images cannot reuse the previous image or its late completion callback', () => {
  const h = harness();
  const oldImage = find(h.popup(), 'PointImage').props;
  oldImage.onThumbnailLoad(h.buildImageUrl(pointA.image, 'plan=h360'));
  assert.equal(
    find(h.popup(), 'PointCardActions').props.initialReferenceUri,
    h.buildImageUrl(pointA.image, 'plan=h360'),
  );
  assert.equal(find(h.popup(pointB), 'PointCardActions').props.initialReferenceUri, undefined);
  oldImage.onThumbnailLoad(h.buildImageUrl(pointA.image, 'plan=h360'));
  let popup = h.popup(pointB);
  assert.equal(find(popup, 'PointCardActions').props.initialReferenceUri, undefined);
  find(popup, 'PointImage').props.onThumbnailLoad(h.buildImageUrl(pointB.image, 'plan=h360'));
  popup = h.popup(pointB);
  assert.equal(find(popup, 'PointCardActions').props.initialReferenceUri, h.buildImageUrl(pointB.image, 'plan=h360'));
});

test('a successfully loaded cover never becomes a point screenshot', () => {
  const h = harness();
  const point = { ...pointA, image: undefined };
  const image = find(h.popup(point), 'PointImage').props;
  image.onThumbnailLoad(h.buildImageUrl(bangumi.cover, 'plan=h360'));
  const actions = find(h.popup(point), 'PointCardActions').props;
  assert.equal(actions.initialReferenceUri, undefined);
  const navigation = h.navigate(actions);
  assert.equal(h.route(navigation.params, point).initialReferenceUri, undefined);
});

test('other camera entry points retain the h160 default', () => {
  const h = harness();
  const navigation = h.navigate({ point: pointA, bangumi, showCamera: true });
  assert.equal(navigation.params.initialReferenceUri, undefined);
  assert.equal(h.route(navigation.params).initialReferenceUri, h.buildImageUrl(pointA.image, 'plan=h160'));
});

test('the route accepts only the selected point h360 and falls back for unrelated or malformed parameters', () => {
  const h = harness();
  const params = { bangumiId: String(bangumi.id), pointId: pointA.id };
  const h160 = h.buildImageUrl(pointA.image, 'plan=h160');
  for (const initialReferenceUri of [
    undefined,
    '',
    'file:///other.jpg',
    h.buildImageUrl(pointB.image, 'plan=h360'),
    [h.buildImageUrl(pointA.image, 'plan=h360')],
  ]) {
    assert.equal(h.route({ ...params, initialReferenceUri }).initialReferenceUri, h160);
  }
  assert.equal(
    h.route({ ...params, initialReferenceUri: h.buildImageUrl(pointA.image, 'plan=h360') }).initialReferenceUri,
    h.buildImageUrl(pointA.image, 'plan=h360'),
  );
});
