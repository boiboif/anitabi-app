import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { getPreviewContainerOrigin } from '../../src/utils/image-preview-source.ts';

function compile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: false,
    },
  }).outputText;
}
const compiled = compile('../../src/components/image-preview/previewable-image.tsx');
const compiledHook = compile('../../src/hooks/use-image-loading.ts');
const compiledController = compile('../../src/utils/image-load-controller.ts');
const jsx = (type, props, key) => ({ type, props, key });
const plain = (value) => JSON.parse(JSON.stringify(value));
const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 160, height: 90 } } };
const load = { source: { url: 'thumbnail', width: 1280, height: 720 } };
const error = { error: 'thumbnail request failed' };
const tick = () => new Promise((resolve) => setImmediate(resolve));

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
}

// Run the real component, hook and loading controller together. Only React's
// host rendering, the clock and native Image requests are replaced by spies.
function createHarness(initialProps = {}, reload = async () => {}) {
  let slots = [];
  let cursor = 0;
  let identity;
  let tree;
  let nativeImage;
  let dirty = false;
  let now = 0;
  let nextTimer = 1;
  const timers = new Map();
  const reloads = [];
  let props = {
    source: { uri: 'thumbnail', cacheKey: 'thumbnail-cache' },
    previewUri: 'original',
    previewFallbackUri: 'fallback',
    recyclingKey: 'first-card',
    ...initialProps,
  };
  const modules = {
    '@/components/image-preview/image-preview': { default: 'ImagePreview' },
    '@/components/ui/strict-button': { StrictButton: 'StrictButton' },
    '@/utils/image-preview-source': { getPreviewContainerOrigin },
    '@tamagui/lucide-icons-2': { RefreshCw: 'RefreshCw' },
    'expo-image': { Image: 'Image' },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
    react: {
      memo: (component) => component,
      useRef(initial) {
        return (slots[cursor++] ??= { current: initial });
      },
      useState(initial) {
        const index = cursor++;
        slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
        const slot = slots[index];
        return [
          slot.value,
          (next) => {
            slot.value = typeof next === 'function' ? next(slot.value) : next;
            dirty = true;
          },
        ];
      },
      useEffect(effect) {
        const index = cursor++;
        slots[index] ??= { cleanup: effect() };
      },
      useSyncExternalStore(subscribe, getSnapshot) {
        const index = cursor++;
        slots[index] ??= {
          cleanup: subscribe(() => {
            dirty = true;
          }),
        };
        return getSnapshot();
      },
    },
    'react-native-gesture-handler': { GestureDetector: 'GestureDetector', Pressable: 'Pressable' },
    tamagui: { View: 'View', YStack: 'YStack' },
  };
  const globals = {
    setTimeout(callback, delay) {
      const id = nextTimer++;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    require(name) {
      assert.ok(name in modules, `unexpected import: ${name}`);
      return modules[name];
    },
  };
  const evaluate = (code) => {
    const context = vm.createContext({ ...globals, exports: {} });
    vm.runInContext(code, context);
    return context.exports;
  };
  modules['@/utils/image-load-controller'] = evaluate(compiledController);
  modules['@/hooks/use-image-loading'] = evaluate(compiledHook);
  const component = evaluate(compiled).default;
  const find = (type) => nodes(tree).find((node) => node.type === type)?.props;
  const cleanup = () => {
    for (const slot of slots) slot?.cleanup?.();
    const ref = find('Image')?.ref;
    if (typeof ref === 'function') ref(null);
    else if (ref) ref.current = null;
  };
  const render = (changes = {}) => {
    props = { ...props, ...changes };
    const wrapper = component(props);
    if (identity !== wrapper.key) {
      cleanup();
      slots = [];
      identity = wrapper.key;
      const uri = props.source.uri;
      nativeImage = {
        reloadAsync: () => {
          reloads.push(uri);
          return reload();
        },
      };
    }
    cursor = 0;
    dirty = false;
    tree = wrapper.type(wrapper.props);
    const ref = find('Image').ref;
    if (typeof ref === 'function') ref(nativeImage);
    else ref.current = nativeImage;
    return tree;
  };
  const flush = () => {
    if (dirty) render();
  };
  const advance = (ms) => {
    const until = now + ms;
    while (timers.size) {
      const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (timer.at > until) break;
      now = timer.at;
      timers.delete(id);
      timer.callback();
      flush();
    }
    now = until;
  };
  render();
  return {
    render,
    flush,
    advance,
    reloads,
    unmount: cleanup,
    get image() {
      flush();
      return find('Image');
    },
    get preview() {
      flush();
      return find('ImagePreview');
    },
    get retryButton() {
      flush();
      return find('StrictButton');
    },
    fail() {
      find('Image').onError(error);
      flush();
    },
    start() {
      find('Image').onLoadStart();
      flush();
    },
    loaded() {
      find('Image').onLoad(load);
      flush();
    },
    exhaust() {
      this.fail();
      advance(500);
      this.fail();
      advance(1500);
      this.fail();
    },
    open() {
      find('Pressable').onLayout(layout);
      find('Image').onLayout(layout);
      find('Pressable').onPress({ nativeEvent: { pageX: 25, pageY: 35, locationX: 5, locationY: 5 } });
      flush();
      assert.ok(find('ImagePreview'), 'an unfinished or failed thumbnail must still allow preview');
    },
    previewLoaded() {
      const preview = find('ImagePreview');
      preview.onImageLoad(preview.images[0], 0);
      flush();
    },
    close() {
      find('ImagePreview').onClose();
      flush();
      assert.equal(find('ImagePreview'), undefined);
    },
  };
}

test('thumbnail errors retry twice without preview, then show a manual retry that starts a new finite cycle', () => {
  const image = createHarness();
  image.fail();
  assert.equal(image.retryButton, undefined);
  image.advance(499);
  assert.deepEqual(image.reloads, []);
  image.advance(1);
  image.fail();
  image.advance(1499);
  assert.deepEqual(image.reloads, ['thumbnail']);
  image.advance(1);
  image.fail();
  const retry = image.retryButton;
  assert.equal(retry.children, 'retry');
  retry.onPress();
  assert.equal(image.retryButton, undefined);
  assert.equal(image.preview, undefined, 'retry is separate from opening a preview');
  retry.onPress();
  assert.equal(image.reloads.length, 3, 'double presses cannot restart a running manual request');
  image.exhaust();
  assert.equal(image.reloads.length, 5);
  assert.ok(image.retryButton);
});

test('a successful preview adds one recovery after automatic attempts are exhausted, preserving the source and instance', () => {
  for (const sameUri of [false, true]) {
    const image = createHarness(sameUri ? { previewUri: 'thumbnail' } : {});
    const { source, ref } = image.image;
    image.exhaust();
    image.open();
    assert.equal(image.preview.images[0].thumbnailUri, 'fallback');
    image.previewLoaded();
    assert.equal(image.reloads.length, 3);
    image.fail();
    image.previewLoaded();
    image.close();
    assert.equal(image.reloads.length, 3, 'repeated callbacks and close cannot add recovery attempts');
    assert.ok(image.retryButton);
    assert.equal(image.image.source, source);
    assert.equal(image.image.ref, ref);
  }
});

test('preview success does not interrupt loading or scheduled automatic retries and survives closing', () => {
  const image = createHarness();
  image.open();
  image.previewLoaded();
  image.close();
  assert.deepEqual(image.reloads, []);
  image.fail();
  image.advance(499);
  assert.deepEqual(image.reloads, []);
  image.advance(1);
  image.fail();
  image.advance(1500);
  image.fail();
  assert.equal(image.reloads.length, 3, 'the confirmed preview can recover a later failure after automatic retries');
  image.fail();
  assert.ok(image.retryButton);
});

test('new previews do not restart an active recovery, while stale preview callbacks are ignored', () => {
  const image = createHarness();
  image.exhaust();
  image.open();
  const previous = image.preview;
  image.close();
  image.open();
  previous.onImageLoad(previous.images[0], 0);
  assert.equal(image.reloads.length, 2);
  image.previewLoaded();
  image.close();
  image.open();
  image.previewLoaded();
  assert.equal(image.reloads.length, 3, 'reopening must not interrupt a recovery still in flight');
  image.fail();
  assert.equal(image.reloads.length, 4, 'a later actual error can use the new confirmed preview opportunity');
});

test('loaded content cancels scheduled retries, keeps dimensions and forwards native events', () => {
  const events = [];
  const image = createHarness({
    onLoadStart: () => events.push('start'),
    onLoad: (event) => events.push(['load', event]),
    onError: (event) => events.push(['error', event]),
    onLayout: (event) => events.push(['layout', event]),
  });
  image.fail();
  image.loaded();
  image.advance(10000);
  image.start();
  image.fail();
  image.open();
  image.previewLoaded();
  assert.deepEqual(plain(image.preview.images), [
    { id: 'original', uri: 'original', thumbnailUri: 'thumbnail', width: 1280, height: 720 },
  ]);
  image.close();
  assert.deepEqual(image.reloads, []);
  assert.equal(image.retryButton, undefined);
  assert.deepEqual(events, [['error', error], ['load', load], 'start', ['error', error], ['layout', layout]]);
});

test('terminal errors replace the annotation with retry and successful retry restores it without changing native image props', () => {
  const annotation = jsx('MissingScreenshot', { children: '暂无截图', pointerEvents: 'none' });
  const style = { width: 180, height: 140 };
  const events = [];
  const image = createHarness({
    overlay: annotation,
    style,
    onLoad: (event) => events.push(['load', event]),
    onError: (event) => events.push(['error', event]),
    onLayout: (event) => events.push(['layout', event]),
  });
  const { source, ref } = image.image;
  const hasAnnotation = () => nodes(image.render()).some((node) => node.type === 'MissingScreenshot');
  assert.equal(hasAnnotation(), true);
  image.image.onLayout(layout);
  image.exhaust();
  assert.equal(hasAnnotation(), false, 'the missing-screenshot label must not cover the retry control');
  assert.ok(image.retryButton);
  assert.equal(image.image.style, style);
  image.retryButton.onPress();
  image.start();
  image.loaded();
  assert.equal(hasAnnotation(), true);
  assert.equal(image.retryButton, undefined);
  assert.equal(image.image.source, source);
  assert.equal(image.image.ref, ref);
  assert.equal(image.image.style, style, 'retry state must not change the native image dimensions');
  assert.deepEqual(events, [
    ['layout', layout],
    ['error', error],
    ['error', error],
    ['error', error],
    ['load', load],
  ]);
  image.open();
  assert.equal(image.preview.images[0].width, 1280);
  assert.equal(image.preview.images[0].height, 720);
  image.advance(10000);
  assert.equal(image.reloads.length, 3, 'a successful manual retry must cancel all pending work');
});

test('preview bounds still use the native trigger origin and the image layout inside the new wrapper', () => {
  const image = createHarness({ containerStyle: { width: 140, height: 90 } });
  const tree = image.render();
  const trigger = nodes(tree).find((node) => node.type === 'Pressable').props;
  trigger.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 140, height: 90 } } });
  image.image.onLayout({ nativeEvent: { layout: { x: 5, y: 10, width: 160, height: 90 } } });
  trigger.onPress({ nativeEvent: { pageX: 25, pageY: 35, locationX: 5, locationY: 5 } });
  assert.deepEqual(plain(image.preview.getSourceBounds()), {
    x: 25,
    y: 40,
    width: 160,
    height: 90,
    contentFit: 'cover',
    borderRadius: 0,
    clip: { x: 20, y: 30, width: 140, height: 90 },
  });
});

test('unmounting or recycling cancels old work and isolates load, dimensions and preview sessions', () => {
  for (const changes of [null, { source: { uri: 'second-thumbnail' } }, { recyclingKey: 'second-card' }]) {
    const image = createHarness();
    image.open();
    const oldPreview = image.preview;
    const oldError = image.image.onError;
    image.fail();
    if (changes) image.render(changes);
    else image.unmount();
    oldPreview.onImageLoad(oldPreview.images[0], 0);
    oldError(error);
    image.advance(10000);
    assert.deepEqual(image.reloads, []);
    if (!changes) continue;
    assert.equal(image.preview, undefined);
    image.open();
    assert.equal(image.preview.images[0].width, undefined);
    assert.equal(image.preview.images[0].thumbnailUri, 'fallback');
    image.previewLoaded();
    assert.deepEqual(image.reloads, []);
    image.fail();
    image.advance(500);
    assert.deepEqual(image.reloads, [changes.source?.uri ?? 'thumbnail']);
  }
});

test('native command rejections consume the finite automatic budget and expose manual retry', async () => {
  const image = createHarness({}, () => Promise.reject(new Error('native image unavailable')));
  image.fail();
  image.advance(500);
  await tick();
  image.advance(1500);
  await tick();
  assert.equal(image.reloads.length, 2);
  assert.ok(image.retryButton);
  image.advance(10000);
  assert.equal(image.reloads.length, 2);
});

test('an empty source remains a non-interactive placeholder without retrying', () => {
  const errors = [];
  const image = createHarness({ source: { uri: '' }, previewUri: undefined, onError: (event) => errors.push(event) });
  image.fail();
  image.advance(10000);
  assert.deepEqual(image.reloads, []);
  assert.equal(image.retryButton, undefined);
  assert.equal(image.preview, undefined);
  assert.deepEqual(errors, [error]);
});
