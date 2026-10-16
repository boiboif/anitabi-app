import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/components/map/point-image-markers.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

const jsx = (type, props) => ({ type, props });
const modules = {
  react: { memo: (component) => component, useMemo: (calculate) => calculate() },
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  '@/lib/constants': {
    FILTER_MODE_MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE: 18,
    MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE: 18,
    MAP_IMAGE_PRIORITY_BASE_ZOOM_OFFSET: 1,
    SELECTED_MAP_POINT_LAYER_ID: 'selected-map-point',
  },
  '@/services/handlers': { buildImageUrl: (path) => path },
  '@/store/use-map-browse': { useMapBrowse: (select) => select({ openedBangumiDetailsId: null }) },
  '@/store/use-map-bangumi-filter': { useMapBangumiFilter: (select) => select({ selectedBangumiIds: [] }) },
  '@/utils/map-image-sort': {
    getStableMapImageSortKeys: (_byLatitude, count) => new Uint32Array(count).fill(1),
  },
  '@rnmapbox/maps': { Images: 'Images', ShapeSource: 'ShapeSource' },
  ahooks: { useDebounce: (value) => value },
  './map-marker-selection': { SelectableSymbolLayer: 'SelectableSymbolLayer' },
};
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, require: (name) => modules[name] ?? {} });
const PointImageMarkers = module.exports.default;

const bounds = { sw: [138, 34], ne: [140, 36] };
const bangumis = [
  {
    id: 1,
    points: [
      { id: 'low', geo: [35, 139], image: 'low.jpg', priority: 5 },
      { id: 'at-cutoff', geo: [35, 139], image: 'cutoff.jpg', priority: 6 },
      { id: 'outside', geo: [37, 139], image: 'outside.jpg', priority: 8 },
    ],
  },
  { id: 2, points: [{ id: 'other-work', geo: [35, 139], image: 'other.jpg', priority: 8 }] },
];

function renderedImageIds(props) {
  const marker = PointImageMarkers({ bangumis, zoom: 17, bounds, ...props });
  if (!marker) return [];
  const layer = marker.type(marker.props);
  const images = layer.props.children[0];
  return Object.keys(images.props.images).sort();
}

test('large plans wait for zoom 17 and a settled viewport before registering ordinary images', () => {
  assert.deepEqual(renderedImageIds({ zoom: 16.9, zoomThresholdOverride: 17 }), []);
  assert.deepEqual(renderedImageIds({ bounds: null, zoomThresholdOverride: 17 }), []);
  assert.deepEqual(renderedImageIds({ zoomThresholdOverride: 17 }), ['point_img_at-cutoff', 'point_img_other-work']);
});

test('large plan work filters still limit registered images', () => {
  assert.deepEqual(renderedImageIds({ zoomThresholdOverride: 17, selectedBangumiIds: [1] }), ['point_img_at-cutoff']);
});

test('small plans retain images at low zoom without viewport bounds or priority filtering', () => {
  assert.deepEqual(renderedImageIds({ zoom: 4, bounds: null, ignoreZoomThreshold: true }), [
    'point_img_at-cutoff',
    'point_img_low',
    'point_img_other-work',
    'point_img_outside',
  ]);
});

test('home map retains its existing zoom 18 threshold', () => {
  assert.deepEqual(renderedImageIds({ zoom: 17 }), []);
  assert.deepEqual(renderedImageIds({ zoom: 18 }), ['point_img_at-cutoff', 'point_img_other-work']);
});
