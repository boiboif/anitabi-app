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

// Run the component's real save callback. Only native drawing, permissions, files,
// album access and record persistence are replaced; visible native UI is not tested.
function createHarness({ platform = 'android', permission = true, failAt, recordGate, existingAlbum = true } = {}) {
  const inputUris = ['file:///input/reference.jpg', 'file:///input/photo.jpg'];
  const files = new Set(inputUris);
  const events = [];
  const alerts = [];
  const toasts = [];
  const assetCalls = [];
  const recordCalls = [];
  const permissionCalls = [];
  const systemPhotos = [];
  const resources = [];
  const slots = [];
  let cursor = 0;
  let effects = [];
  let tree;
  let normalizedCount = 0;
  let outputCount = 0;
  let retakes = 0;
  const settings = {
    ...exporter.DEFAULT_COMPARISON_EXPORT_SETTINGS,
    showCapturedAt: false,
    showLocation: false,
    showWork: false,
    showScene: false,
    showCoordinates: false,
  };
  const props = {
    visible: true,
    bangumi: { id: 42, title: '作品', cover: '/cover.jpg', color: '#123456' },
    point: { id: 'station', name: '地点', ep: 1, image: '/point.jpg', mark: '参考', geo: [35, 139] },
    capturedAt: '2026-10-08T12:30:00+08:00',
    referenceUri: inputUris[0],
    photoUri: inputUris[1],
    referenceDimensions: { uri: inputUris[0], size: { width: 1600, height: 900 } },
    photoDimensions: { uri: inputUris[1], size: { width: 900, height: 1200 } },
    onPickPhoto() {},
    onPickReference() {},
    onRetake() {
      retakes++;
    },
  };
  function nitroImage(width, height) {
    const image = {
      width,
      height,
      disposed: false,
      dispose() {
        assert.equal(image.disposed, false, 'native image resources are disposed once');
        image.disposed = true;
      },
      async renderIntoAsync() {
        if (failAt === 'draw') throw new Error('Native drawing failed');
        return nitroImage(width, height);
      },
      async cropAsync(left, top, right, bottom) {
        return nitroImage(right - left, bottom - top);
      },
      async saveToTemporaryFileAsync(format) {
        assert.equal(format, 'jpg');
        const path = `/cache/comparison-${++outputCount}.jpg`;
        files.add(`file://${path}`);
        events.push('output-created');
        return path;
      },
    };
    resources.push(image);
    return image;
  }
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [
        slots[index].value,
        (next) => {
          slots[index].value = typeof next === 'function' ? next(slots[index].value) : next;
        },
      ];
    },
    useRef(current) {
      return (slots[cursor++] ??= { current });
    },
    useEffect(effect) {
      effects.push(effect);
    },
  };
  const jsx = (type, nodeProps, key) => ({ type, props: nodeProps, key });
  const album = {
    async add(asset) {
      events.push('album-add');
      assert.equal(asset, systemPhotos.at(-1));
      if (failAt === 'album') throw new Error('Album classification failed');
    },
  };
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
      ActivityIndicator: 'ActivityIndicator',
      StatusBar: 'StatusBar',
      PixelRatio: { get: () => 2 },
      Platform: { OS: platform },
      StyleSheet: { absoluteFill: {} },
      Alert: { alert: (...args) => alerts.push(args) },
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    tamagui: { View: 'View', XStack: 'XStack', YStack: 'YStack', useTheme: () => ({ primary: { val: '#123456' } }) },
    '@tamagui/lucide-icons-2': {},
    '@boiboif/react-native-toast': { Toast: { show: (message) => toasts.push(message) } },
    'expo-image': { Image: 'Image' },
    'expo-file-system': {
      File: class {
        constructor(uri) {
          this.uri = uri;
        }
        get exists() {
          return files.has(this.uri);
        }
        delete() {
          assert.equal(inputUris.includes(this.uri), false, 'export cannot delete the selected input images');
          events.push(`delete:${this.uri}`);
          files.delete(this.uri);
        }
      },
    },
    'expo-image-manipulator': {
      SaveFormat: { JPEG: 'jpeg' },
      ImageManipulator: {
        manipulate(uri) {
          assert.ok(files.has(uri));
          return {
            release() {},
            async renderAsync() {
              return {
                release() {},
                async saveAsync() {
                  const normalizedUri = `file:///cache/normalized-${++normalizedCount}.jpg`;
                  files.add(normalizedUri);
                  return { uri: normalizedUri };
                },
              };
            },
          };
        },
      },
    },
    'react-native-nitro-image': {
      Images: { createBlankImageAsync: async (width, height) => nitroImage(width, height) },
      loadImage: async ({ filePath }) => {
        assert.ok(files.has(filePath));
        return nitroImage(1200, 900);
      },
    },
    'expo-media-library': {
      async requestPermissionsAsync(writeOnly, granularPermissions) {
        permissionCalls.push({ writeOnly, granularPermissions });
        return { granted: permission, accessPrivileges: permission ? 'all' : 'none' };
      },
      Asset: {
        async create(uri) {
          assetCalls.push(uri);
          assert.ok(files.has(uri), 'the completed output must exist when the system photo is saved');
          events.push('asset-create');
          if (failAt === 'asset') throw new Error('System photo save failed');
          const asset = { id: `asset-${systemPhotos.length + 1}` };
          systemPhotos.push(asset);
          return asset;
        },
      },
      Album: {
        async get(name) {
          assert.equal(name, 'Anitabi');
          events.push('album-get');
          return existingAlbum ? album : null;
        },
        async create(name, assets) {
          assert.equal(name, 'Anitabi');
          assert.equal(assets[0], systemPhotos.at(-1));
          events.push('album-create');
          if (failAt === 'album') throw new Error('Album classification failed');
        },
      },
    },
    '@/services/pilgrimage-records': {
      async savePilgrimagePhoto(input, uri, width, height, at) {
        recordCalls.push({ input, uri, width, height, at });
        assert.ok(files.has(uri), 'record persistence must receive the existing completed output');
        events.push('record-start');
        if (recordGate) await recordGate.promise;
        assert.ok(files.has(uri), 'temporary output must survive an asynchronous record write');
        if (failAt === 'record') throw new Error('Record persistence failed');
        events.push('record-finish');
      },
    },
    '@/lib/comparison-export': exporter,
    '@/lib/comparison-camera-geometry': geometry,
    '@/lib/formatDuration': { formatDuration: (seconds) => String(seconds) },
    '@/lib/storage': { getComparisonExportSettings: () => settings, setComparisonExportSettings() {} },
    '@/lib/localized-data': { getPointTitle: (point) => point.name, getBangumiTitle: (work) => work.title },
    '@/components/comparison-camera/comparison-camera-layout': {},
    '@/hooks/use-image-loading': {},
    'react-native-view-shot': {},
    './comparison-export-sheet': { __esModule: true, default: 'ExportSheet' },
    './comparison-image-pressable': { ComparisonImagePressable: 'ComparisonImagePressable' },
    './comparison-metadata-footer': { __esModule: true, default: 'MetadataFooter' },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require(name) {
      assert.ok(name in modules, `Unexpected module: ${name}`);
      return modules[name];
    },
    console: { error() {} },
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
    tree = module.exports.default(props);
  }
  function find(predicate, node = tree) {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat()) {
      if (!child || typeof child !== 'object') continue;
      const found = find(predicate, child);
      if (found) return found;
    }
  }
  render();
  find((node) => node.type === 'View' && node.props.onLayout).props.onLayout({
    nativeEvent: { layout: { width: 400, height: 800 } },
  });
  for (const uri of inputUris) {
    find((node) => node.props?.onLoad && (node.props.source?.uri ?? node.props.uri) === uri).props.onLoad({
      source: { width: 1200, height: 900 },
    });
  }
  render();
  effects.forEach((effect) => effect());
  render();
  const saveButton = () => find((node) => node.props?.primary === true);
  assert.equal(saveButton().props.disabled, false, 'the real preview is ready before saving');
  return {
    inputUris,
    files,
    events,
    alerts,
    toasts,
    assetCalls,
    recordCalls,
    permissionCalls,
    systemPhotos,
    resources,
    pressSave: () => saveButton().props.onPress(),
    close: () => find((node) => node.type === 'Modal').props.onRequestClose(),
    retakes: () => retakes,
    saving() {
      render();
      return saveButton().props.disabled;
    },
    async until(predicate) {
      for (let turn = 0; turn < 100; turn++) {
        if (predicate()) return;
        await new Promise(setImmediate);
      }
      assert.fail('Save callback did not reach the expected state');
    },
    assertClean() {
      assert.deepEqual([...files], inputUris);
      assert.ok(
        resources.every((image) => image.disposed),
        'all native composition images must be disposed',
      );
    },
  };
}

for (const platform of ['android', 'ios']) {
  test(`${platform}: denied photo permission creates neither output, system photo nor record`, async () => {
    const app = createHarness({ platform, permission: false });
    app.pressSave();
    await app.until(() => !app.saving());
    assert.equal(app.assetCalls.length, 0);
    assert.equal(app.recordCalls.length, 0);
    assert.equal(app.alerts.length, 1);
    assert.match(app.alerts[0][1], /允许应用向系统相册添加照片/);
    assert.equal(app.toasts.length, 0);
    app.assertClean();
  });

  test(`${platform}: system photo failure never creates a record and cleans the rendered output`, async () => {
    const app = createHarness({ platform, failAt: 'asset' });
    app.pressSave();
    await app.until(() => !app.saving());
    assert.equal(app.assetCalls.length, 1);
    assert.equal(app.recordCalls.length, 0);
    assert.equal(app.systemPhotos.length, 0);
    assert.equal(
      app.events.some((event) => event.startsWith('album-')),
      false,
    );
    assert.equal(app.alerts.length, 1);
    assert.equal(app.alerts[0][0], '保存失败');
    assert.equal(app.toasts.length, 0);
    app.assertClean();
  });

  test(`${platform}: record failure reports partial success without repeating the system photo save`, async () => {
    const app = createHarness({ platform, failAt: 'record' });
    app.pressSave();
    await app.until(() => !app.saving());
    assert.equal(app.assetCalls.length, 1);
    assert.equal(app.systemPhotos.length, 1);
    assert.equal(app.recordCalls.length, 1);
    assert.equal(app.alerts.length, 1);
    assert.equal(app.alerts[0][0], '巡礼记录保存失败');
    assert.match(app.alerts[0][1], /已保存到系统相册/);
    assert.equal(app.toasts.length, 0);
    app.assertClean();
  });
}

for (const { platform, existingAlbum, classification } of [
  { platform: 'android', existingAlbum: false, classification: 'album-create' },
  { platform: 'ios', existingAlbum: false, classification: 'album-create' },
  { platform: 'ios', existingAlbum: true, classification: 'album-add' },
]) {
  test(`${platform}: ${classification} failure retains the system photo and still appends a record`, async () => {
    const app = createHarness({ platform, existingAlbum, failAt: 'album' });
    app.pressSave();
    await app.until(() => !app.saving());
    assert.equal(app.assetCalls.length, 1);
    assert.equal(app.systemPhotos.length, 1);
    assert.equal(app.recordCalls.length, 1);
    const saved = app.recordCalls[0];
    assert.equal(saved.input.key, '42:station');
    assert.equal(saved.input.snapshot.pointName, '地点');
    assert.deepEqual(Array.from(saved.input.snapshot.geo), [35, 139]);
    assert.equal('completed' in saved.input, false);
    assert.equal('planId' in saved.input, false);
    assert.equal(saved.uri, app.assetCalls[0]);
    assert.equal(saved.width, exporter.COMPARISON_EXPORT_WIDTH);
    assert.ok(saved.height > 0);
    assert.ok(Number.isSafeInteger(saved.at));
    assert.ok(app.events.indexOf('asset-create') < app.events.indexOf(classification));
    assert.ok(app.events.indexOf(classification) < app.events.indexOf('record-start'));
    assert.equal(app.alerts.length, 0);
    assert.deepEqual(app.toasts, ['对比图已保存到相册']);
    app.assertClean();
  });
}

for (const failAt of [undefined, 'record']) {
  test(`temporary output survives a pending record ${failAt ? 'failure' : 'success'} and concurrent actions are blocked`, async () => {
    let completeRecord;
    const recordGate = { promise: new Promise((resolve) => (completeRecord = resolve)) };
    const app = createHarness({ recordGate, failAt });
    app.pressSave();
    await app.until(() => app.recordCalls.length === 1);
    const output = app.recordCalls[0].uri;
    assert.equal(app.files.has(output), true);
    assert.equal(app.saving(), true);
    app.pressSave();
    app.close();
    await new Promise(setImmediate);
    assert.equal(app.assetCalls.length, 1, 'another tap during the same export must not create another photo');
    assert.equal(app.recordCalls.length, 1);
    assert.equal(app.retakes(), 0, 'back/retake cannot clean up inputs while the record still uses them');
    assert.equal(app.files.has(output), true);
    completeRecord();
    await app.until(() => !app.saving());
    assert.equal(app.files.has(output), false);
    if (!failAt) assert.ok(app.events.indexOf('record-finish') < app.events.indexOf(`delete:${output}`));
    assert.equal(app.systemPhotos.length, 1);
    assert.equal(app.assetCalls.length, 1);
    assert.equal(app.alerts.length, failAt ? 1 : 0);
    app.assertClean();
    app.close();
    assert.equal(app.retakes(), 1, 'finishing the write releases the close gate');
  });
}

test('drawing failure cleans normalized files and image resources before any system photo or record exists', async () => {
  const app = createHarness({ failAt: 'draw' });
  app.pressSave();
  await app.until(() => !app.saving());
  assert.equal(app.assetCalls.length, 0);
  assert.equal(app.recordCalls.length, 0);
  assert.equal(app.alerts.length, 1);
  assert.equal(app.alerts[0][0], '保存失败');
  app.assertClean();
});
