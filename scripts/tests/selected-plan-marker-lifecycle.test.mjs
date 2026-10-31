import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { getSelectedMapPointSource } from '../../src/utils/selected-map-point-source.ts';

const source = readFileSync(new URL('../../src/components/map/map-selected-point-layers.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

// Check the production host-element identities and child replacements React commits.
// Native attachment and Fresco decoding still require the device regression check.
function createHarness() {
  const layerSlots = [];
  let slots = layerSlots;
  let cursor = 0;
  let effects = [];
  let refreshCount = 0;
  let nextFrame = 1;
  const frames = new Map();
  const imageRequests = [];
  const hitRects = [];
  const nativeImage = { refresh: () => refreshCount++ };
  const sameDeps = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const memo = (calculate, deps) => {
    const index = cursor++;
    if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { value: calculate(), deps };
    return slots[index].value;
  };
  const jsx = (type, props, key) => ({ type, props, key: key ?? null });
  const modules = {
    react: {
      useRef: (initial) => {
        const index = cursor++;
        return (slots[index] ??= { current: initial });
      },
      useMemo: memo,
      useCallback: (callback, deps) => memo(() => callback, deps),
      useEffect: (run, deps) => {
        const index = cursor++;
        if (!sameDeps(slots[index]?.deps, deps)) effects.push({ index, run, deps });
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    '@rnmapbox/maps': {
      Images: 'MapboxImages',
      Image: 'MapboxImage',
      ShapeSource: 'ShapeSource',
      CircleLayer: 'CircleLayer',
      SymbolLayer: 'SymbolLayer',
    },
    'react-native': { Image: 'NativeImage' },
    tamagui: { View: 'View', YStack: 'YStack', Text: 'Text', useTheme: () => ({ primary: { val: '#FB7299' } }) },
    'react-i18next': { useTranslation: () => ({ t: (_key, { defaultValue }) => defaultValue }) },
    '@/lib/constants': {
      MAP_MARKER_HITBOX: { width: 12, height: 12 },
      SELECTED_MAP_POINT_LAYER_ID: 'selected-map-point',
    },
    '@/lib/ui-sizes': { SELECTED_MAP_POINT_DOT_DIAMETER: 24 },
    '@/utils/selected-map-point-source': { getSelectedMapPointSource },
    '@/utils/map-point-style': { getMapPointCircleStyle: () => ({}) },
    '@/services/handlers': {
      buildImageUrl: (path, variant) => {
        imageRequests.push({ path, variant });
        return `fixture:${path}?${variant}`;
      },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
      return modules[name];
    },
    requestAnimationFrame: (callback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  });

  return {
    render(selected, mapReady, showImage = true) {
      slots = layerSlots;
      cursor = 0;
      effects = [];
      const tree = module.exports.SelectedPlanMapPointLayer({
        selected,
        mapReady,
        showImage,
        onHitRectsChange: (key, rects) => hitRects.push({ key, rects }),
      });
      assert.equal(tree.type, 'Fragment');
      const [images, shapeSource] = tree.props.children;
      assert.equal(images.type, 'MapboxImages', 'image registration occupies the first persistent sibling');
      const image = images.props.children;
      assert.equal(image.type, 'MapboxImage');
      assert.equal(image.props.name, 'selected-plan-point-artwork');
      assert.equal(shapeSource.type, 'ShapeSource');
      image.props.ref.current = nativeImage;
      for (const pending of effects) {
        slots[pending.index]?.cleanup?.();
        slots[pending.index] = { deps: pending.deps, cleanup: pending.run() };
      }
      return { images, image, artwork: image.props.children, shapeSource };
    },
    renderArtwork(artwork) {
      assert.equal(typeof artwork.type, 'function', 'ready image child is the actual production artwork');
      slots = [];
      cursor = 0;
      return artwork.type(artwork.props);
    },
    flushFrames() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    },
    get pendingFrames() {
      return frames.size;
    },
    get refreshCount() {
      return refreshCount;
    },
    imageRequests,
    hitRects,
  };
}

function assertSameRegistration(previous, next) {
  // Matching type, key and sibling position preserves the native parent instances.
  assert.equal(next.images.type, previous.images.type);
  assert.equal(next.images.key, previous.images.key);
  assert.equal(next.image.type, previous.image.type);
  assert.equal(next.image.key, previous.image.key);
  assert.equal(next.image.props.name, previous.image.props.name);
  assert.equal(next.image.props.ref, previous.image.props.ref);
}

function assertPlaceholder(artwork) {
  assert.equal(artwork.type, 'View');
  assert.equal(artwork.props.collapsable, false);
  assert.equal(artwork.props.width, 1);
  assert.equal(artwork.props.height, 1);
  assert.equal(artwork.props.children, undefined);
}

function findNodes(node, type) {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  return [
    ...(node.type === type ? [node] : []),
    ...(Array.isArray(children) ? children : [children]).flatMap((child) => findNodes(child, type)),
  ];
}

const selected = {
  bangumi: { id: 10, color: '#123456' },
  point: { id: 'first', image: '/images/first.jpg', geo: [35, 139] },
};

test('an initially selected point registers the native image before map readiness without loading artwork', () => {
  const app = createHarness();
  const pending = app.render(selected, false);
  assertPlaceholder(pending.artwork);
  assert.equal(pending.shapeSource.props.shape.features.length, 1);
  assert.equal(app.imageRequests.length, 0);

  const ready = app.render(selected, true);
  assertSameRegistration(pending, ready);
  assert.notEqual(ready.artwork.type, pending.artwork.type);
  assert.notEqual(ready.artwork.key, pending.artwork.key, 'readiness replaces the placeholder child root');
  assert.equal(findNodes(app.renderArtwork(ready.artwork), 'NativeImage').length, 1);
});

test('starting without a selection keeps registration mounted through readiness and the first point selection', () => {
  const app = createHarness();
  const initial = app.render(null, false);
  const loaded = app.render(null, true);
  assertSameRegistration(initial, loaded);
  assertPlaceholder(loaded.artwork);
  assert.equal(loaded.shapeSource.props.shape.features.length, 0);
  assert.equal(app.imageRequests.length, 0);

  const active = app.render(selected, true);
  assertSameRegistration(initial, active);
  assert.notEqual(active.artwork.type, loaded.artwork.type);
  assert.notEqual(active.artwork.key, loaded.artwork.key);
  assert.equal(active.shapeSource.props.shape.features[0].properties.id, selected.point.id);
});

test('a style readiness cycle replaces the artwork root while keeping its native registration', () => {
  const app = createHarness();
  const first = app.render(selected, true);
  const reloading = app.render(selected, false);
  assertSameRegistration(first, reloading);
  assertPlaceholder(reloading.artwork);
  assert.notEqual(reloading.artwork.key, first.artwork.key);

  const restored = app.render(selected, true);
  assertSameRegistration(first, restored);
  assert.notEqual(restored.artwork.type, reloading.artwork.type);
  assert.notEqual(restored.artwork.key, reloading.artwork.key);
  assert.equal(restored.artwork.key, first.artwork.key, 'the same selection returns after the placeholder unmount');
});

test('deselection clears the source and replaces artwork without unmounting the native image parents', () => {
  const app = createHarness();
  const active = app.render(selected, true);
  const cleared = app.render(null, true);
  assertSameRegistration(active, cleared);
  assertPlaceholder(cleared.artwork);
  assert.equal(cleared.shapeSource.props.shape.features.length, 0);

  const anotherPoint = { ...selected, point: { ...selected.point, id: 'second' } };
  const next = app.render(anotherPoint, true);
  assertSameRegistration(active, next);
  assert.notEqual(next.artwork.key, active.artwork.key);
  assert.equal(next.shapeSource.props.shape.features.length, 1);
  assert.equal(next.shapeSource.props.shape.features[0].properties.id, 'second');
});

test('the attached artwork uses the shared React Native thumbnail pipeline and refreshes after image load', () => {
  const app = createHarness();
  const active = app.render(selected, true);
  app.flushFrames();
  const artwork = app.renderArtwork(active.artwork);
  assert.equal(artwork.props.collapsable, false, 'the offscreen artwork has a native root to attach');
  const [image] = findNodes(artwork, 'NativeImage');
  assert.equal(image.props.source.uri, 'fixture:/images/first.jpg?plan=h160');
  assert.deepEqual(app.imageRequests, [{ path: selected.point.image, variant: 'plan=h160' }]);
  assert.equal(image.props.resizeMode, 'cover');
  assert.equal(image.props.resizeMethod, 'scale');
  assert.equal(image.props.fadeDuration, 0);
  assert.equal(image.props.onLoad, active.artwork.props.onRendered);
  assert.equal(image.props.onLayout, active.artwork.props.onRendered);

  const before = app.refreshCount;
  image.props.onLoad();
  image.props.onLayout();
  assert.equal(app.pendingFrames, 1, 'load and layout refreshes coalesce in the existing RAF');
  app.flushFrames();
  assert.equal(app.refreshCount, before + 1);

  active.images.props.onImageMissing('another-image');
  assert.equal(app.pendingFrames, 0);
  active.images.props.onImageMissing(active.image.props.name);
  app.flushFrames();
  assert.equal(app.refreshCount, before + 2);
});

test('label-only artwork remains available after readiness without requesting a thumbnail', () => {
  const app = createHarness();
  const pending = app.render(selected, false, false);
  const active = app.render(selected, true, false);
  assertSameRegistration(pending, active);
  const artwork = app.renderArtwork(active.artwork);
  assert.equal(findNodes(artwork, 'NativeImage').length, 0);
  assert.equal(findNodes(artwork, 'Text').length, 1);
  assert.equal(app.imageRequests.length, 0);
});
