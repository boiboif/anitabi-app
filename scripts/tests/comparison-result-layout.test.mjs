import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as geometry from '../../src/lib/comparison-camera-geometry.ts';
import * as exporter from '../../src/lib/comparison-export.ts';

const source = readFileSync(
  new URL('../../src/components/comparison-camera/comparison-result-modal.tsx', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

// Exercise the result component's settings and layout callbacks. Text measurement is supplied
// explicitly; this does not simulate native image drawing, sheet gestures, or visible frames.
function createHarness(initialSettings) {
  const slots = [];
  let cursor = 0;
  let tree;
  let visible = true;
  let effects = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [
        slots[index].value,
        (next) => {
          slots[index].value = typeof next === 'function' ? next(slots[index].value) : next;
        },
      ];
    },
    useRef(current) {
      const index = cursor++;
      return (slots[index] ??= { current });
    },
    useEffect(effect) {
      effects.push(effect);
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-i18next': {
      useTranslation: () => ({ t: (key, options) => options?.defaultValue ?? key, i18n: { language: 'zh-CN' } }),
    },
    'react-native': {
      View: 'NativeView',
      Modal: 'Modal',
      Pressable: 'Pressable',
      PixelRatio: { get: () => 2 },
      StyleSheet: { absoluteFill: {} },
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    tamagui: { View: 'View', XStack: 'XStack', YStack: 'YStack', useTheme: () => ({ primary: { val: '#123456' } }) },
    'expo-image': { Image: 'Image' },
    '@/lib/comparison-export': exporter,
    '@/lib/comparison-camera-geometry': geometry,
    '@/lib/storage': { getComparisonExportSettings: () => initialSettings, setComparisonExportSettings() {} },
    '@/lib/localized-data': { getPointTitle: () => '地点', getBangumiTitle: () => '作品' },
    './comparison-export-sheet': { __esModule: true, default: 'ExportSheet' },
    './comparison-metadata-footer': { __esModule: true, default: 'MetadataFooter' },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (name) => modules[name] ?? {},
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame() {},
    setTimeout: () => 1,
    clearTimeout() {},
  });
  function render() {
    cursor = 0;
    effects = [];
    tree = module.exports.default({
      visible,
      bangumi: {},
      point: { ep: 1, geo: [35, 139] },
      capturedAt: '2026-10-08T12:30:00+08:00',
      referenceUri: 'reference',
      photoUri: 'photo',
      referenceDimensions: { uri: 'reference', size: { width: 1600, height: 900 } },
      photoDimensions: { uri: 'photo', size: { width: 900, height: 1200 } },
    });
  }
  function find(predicate, node = tree) {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat()) {
      if (!child || typeof child !== 'object') continue;
      const match = find(predicate, child);
      if (match) return match;
    }
  }
  render();
  find((node) => node.type === 'View' && node.props.onLayout).props.onLayout({
    nativeEvent: { layout: { width: 400, height: 800 } },
  });
  render();
  return {
    footer: () => find((node) => node.type === 'NativeView'),
    preview: () => find((node) => node.type === 'YStack' && 'opacity' in node.props),
    exportReady: () => find((node) => node.type === 'ExportSheet').props.ready,
    saveDisabled: () => find((node) => node.props?.primary === true).props.disabled,
    reference: () => find((node) => node.props?.uri === 'reference' && node.props.onLoad),
    setVisible(next) {
      visible = next;
      render();
    },
    presentPreview() {
      for (const uri of ['reference', 'photo']) {
        find((node) => node.props?.onLoad && (node.props.source?.uri ?? node.props.uri) === uri).props.onLoad({
          source: { width: 1200, height: 900 },
        });
      }
      render();
      effects.forEach((effect) => effect());
      render();
    },
    measureFooter(height) {
      this.footer().props.onLayout({ nativeEvent: { layout: { height } } });
      render();
    },
    configure(settings) {
      find((node) => node.type === 'ExportSheet').props.onDismiss(settings);
      render();
    },
  };
}

test('border changes reuse the text measurement and render the correct image size immediately', () => {
  for (const layout of ['vertical', 'horizontal']) {
    const settings = { ...exporter.DEFAULT_COMPARISON_EXPORT_SETTINGS, layout };
    const app = createHarness(settings);
    app.measureFooter(72);
    const footerKey = app.footer().key;
    // No new onLayout event is delivered between these settings changes and assertions.
    for (const [showOuterBorder, borderWidth] of [
      [false, 8],
      [true, 32],
      [false, 32],
      [true, 12],
      [true, 8],
    ]) {
      const next = { ...settings, showOuterBorder, borderWidth };
      app.configure(next);
      assert.equal(app.footer().key, footerKey, 'border changes must not remount the fixed-width measurement');
      const contentWidth = 2160 - (showOuterBorder ? borderWidth * 2 : 0);
      const expected = exporter.getComparisonExportLayout(16 / 9, 3 / 4, next, Math.ceil((72 * contentWidth) / 360));
      const fitted = geometry.fitImageSize({ width: 400, height: 800 }, expected.width / expected.height);
      assert.equal(app.preview().props.width, fitted.width, 'first render includes the scaled footer height');
      const panels = app.preview().props.children[0].props.children;
      assert.ok(Math.abs(panels[0].props.height - (expected.reference.height * fitted.width) / 2160) < 1e-9);
    }
  }
});

test('metadata changes still request a fresh text measurement', () => {
  const settings = exporter.DEFAULT_COMPARISON_EXPORT_SETTINGS;
  const app = createHarness(settings);
  app.measureFooter(72);
  const before = app.footer().key;
  app.configure({ ...settings, showWork: false });
  assert.notEqual(app.footer().key, before);
});

test('name and content toggles retain the image layout until the new footer is measured', () => {
  for (const layout of ['vertical', 'horizontal']) {
    let settings = { ...exporter.DEFAULT_COMPARISON_EXPORT_SETTINGS, layout, name: '巡礼者' };
    const app = createHarness(settings);
    app.measureFooter(72);
    for (const field of ['showName', 'showLocation', 'showWork', 'showScene', 'showCoordinates', 'showCapturedAt']) {
      const previousWidth = app.preview().props.width;
      const previousPanelHeight = app.preview().props.children[0].props.children[0].props.height;
      const previousKey = app.footer().key;
      settings = { ...settings, [field]: !settings[field] };
      app.configure(settings);
      assert.notEqual(app.footer().key, previousKey, 'changed metadata still needs a fresh measurement');
      assert.equal(app.preview().props.width, previousWidth, `${field} must not temporarily remove footer space`);
      assert.equal(app.preview().props.children[0].props.children[0].props.height, previousPanelHeight);

      app.measureFooter(48);
      const contentWidth = 2160 - settings.borderWidth * 2;
      const expected = exporter.getComparisonExportLayout(
        16 / 9,
        3 / 4,
        settings,
        Math.ceil((48 * contentWidth) / 360),
      );
      const fitted = geometry.fitImageSize({ width: 400, height: 800 }, expected.width / expected.height);
      assert.equal(app.preview().props.width, fitted.width, 'new measured height must still update the layout');
    }
  }
});

test('disabling all metadata removes its space and re-enabling it reuses the last height while measuring', () => {
  const settings = { ...exporter.DEFAULT_COMPARISON_EXPORT_SETTINGS, name: '巡礼者' };
  const app = createHarness(settings);
  app.measureFooter(72);
  const previousWidth = app.preview().props.width;
  const empty = {
    ...settings,
    showName: false,
    showLocation: false,
    showWork: false,
    showScene: false,
    showCoordinates: false,
    showCapturedAt: false,
  };
  app.configure(empty);
  assert.equal(app.footer(), undefined);
  const layout = exporter.getComparisonExportLayout(16 / 9, 3 / 4, empty, 0);
  const fitted = geometry.fitImageSize({ width: 400, height: 800 }, layout.width / layout.height);
  assert.equal(app.preview().props.width, fitted.width);
  app.configure(settings);
  assert.equal(app.preview().props.width, previousWidth);
});

test('export and save remain enabled while applied metadata awaits its next measurement', () => {
  const settings = { ...exporter.DEFAULT_COMPARISON_EXPORT_SETTINGS, name: '巡礼者' };
  const app = createHarness(settings);
  app.measureFooter(72);
  app.presentPreview();
  assert.equal(app.exportReady(), true);
  assert.equal(app.saveDisabled(), false);
  for (const next of [
    { ...settings, showName: true },
    { ...settings, showWork: false },
  ]) {
    app.configure(next);
    assert.equal(app.exportReady(), true, 'closing the sheet must not briefly disable export');
    assert.equal(app.saveDisabled(), false, 'the result save button must not flash disabled either');
    app.measureFooter(48);
    assert.equal(app.exportReady(), true);
  }
});

test('export still waits for loaded images and the first measured preview', () => {
  const app = createHarness(exporter.DEFAULT_COMPARISON_EXPORT_SETTINGS);
  assert.equal(app.exportReady(), false);
  assert.equal(app.saveDisabled(), true);
  app.presentPreview();
  assert.equal(app.exportReady(), false, 'loaded images alone must not bypass the initial text measurement');
  assert.equal(app.saveDisabled(), true);
  app.measureFooter(72);
  app.presentPreview();
  assert.equal(app.exportReady(), true);
  assert.equal(app.saveDisabled(), false);
});

test('closing the result removes the reference image so its pending retries can be disposed', () => {
  const app = createHarness(exporter.DEFAULT_COMPARISON_EXPORT_SETTINGS);
  assert.ok(app.reference());
  app.setVisible(false);
  assert.equal(app.reference(), undefined);
  app.setVisible(true);
  assert.ok(app.reference());
});
