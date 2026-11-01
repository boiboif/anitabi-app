import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}
function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: false,
    },
  }).outputText;
}
const cameraSource = read('../../src/components/comparison-camera/comparison-camera-screen.tsx');
const resultSource = read('../../src/components/comparison-camera/comparison-result-modal.tsx');
const compiledHook = compile(read('../../src/hooks/use-image-loading.ts'));
const compiledController = compile(read('../../src/utils/image-load-controller.ts'));
const variants = [
  { name: 'camera', component: 'RotatingReferenceImage', source: cameraSource, host: 'AnimatedImage' },
  { name: 'result', component: 'ReferenceImage', source: resultSource, host: 'Image' },
];
const plain = (value) => JSON.parse(JSON.stringify(value));
const load = { source: { url: 'reference', width: 1600, height: 900 } };
const error = { error: 'reference request failed' };

// Run the actual private image components, hook and controller. Export seams are
// appended only to the in-memory JS; native animation and drawing are not tested.
function harness(variant) {
  let slots = [];
  let cursor = 0;
  let node;
  let uri;
  let now = 0;
  let nextId = 1;
  const tasks = new Map();
  const reloads = [];
  const sizes = [];
  const loads = [];
  const props = {
    opacity: 0.4,
    orientationRotation: '90deg',
    pointerEvents: 'none',
    rotation: { value: 90 },
    viewport: { width: 200, height: 300 },
    onLoadSize: (size) => sizes.push(plain(size)),
    onLoad: (event) => loads.push(event),
    style: { width: 180, height: 140 },
    contentFit: 'contain',
    cachePolicy: 'disk',
  };
  const modules = {
    react: {
      useState(initial) {
        const index = cursor++;
        slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
        const slot = slots[index];
        return [
          slot.value,
          (next) => {
            slot.value = typeof next === 'function' ? next(slot.value) : next;
          },
        ];
      },
      useEffect(effect) {
        const index = cursor++;
        slots[index] ??= { cleanup: effect() };
      },
      useSyncExternalStore(subscribe, getSnapshot) {
        const index = cursor++;
        slots[index] ??= { cleanup: subscribe(() => {}) };
        return getSnapshot();
      },
    },
    'react/jsx-runtime': { jsx: (type, hostProps) => ({ type, props: hostProps }) },
    'react-native': { StyleSheet: { absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } } },
    'react-native-reanimated': {
      default: { createAnimatedComponent: () => 'AnimatedImage' },
      useAnimatedStyle: (worklet) => worklet(),
    },
    'expo-image': { Image: 'Image' },
  };
  const evaluate = (code) => {
    const exports = {};
    vm.runInNewContext(code, {
      exports,
      require: (name) => modules[name] ?? {},
      setTimeout(callback, delay) {
        const id = nextId++;
        tasks.set(id, { at: now + delay, callback });
        return id;
      },
      clearTimeout: (id) => tasks.delete(id),
    });
    return exports;
  };
  modules['@/utils/image-load-controller'] = evaluate(compiledController);
  modules['@/hooks/use-image-loading'] = evaluate(compiledHook);
  const component = evaluate(compile(variant.source) + `\nexports.testImage = ${variant.component};`).testImage;
  const cleanup = () => {
    for (const slot of slots) slot.cleanup?.();
    node?.props.ref(null);
  };
  const render = (nextUri = uri ?? 'reference') => {
    if (nextUri !== uri) {
      cleanup();
      slots = [];
      uri = nextUri;
    }
    cursor = 0;
    node = component({ ...props, uri });
    assert.equal(node.type, variant.host);
    const imageUri = uri;
    node.props.ref({
      reloadAsync: async () => {
        reloads.push(imageUri);
      },
    });
    return node;
  };
  const advance = (ms) => {
    const end = now + ms;
    while (tasks.size) {
      const [id, task] = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
      if (task.at > end) break;
      now = task.at;
      tasks.delete(id);
      task.callback();
    }
    now = end;
  };
  render();
  return {
    render,
    advance,
    reloads,
    sizes,
    loads,
    unmount: cleanup,
    get image() {
      return node.props;
    },
    fail() {
      node.props.onError(error);
    },
    loaded() {
      node.props.onLoad(load);
    },
  };
}

for (const variant of variants) {
  test(`${variant.name} reference retries through its Image ref at 500/1500ms and stops after two attempts`, () => {
    const h = harness(variant);
    const originalStyle = plain(h.image.style);
    h.image.onLoadStart();
    h.fail();
    h.advance(499);
    assert.deepEqual(h.reloads, []);
    h.advance(1);
    h.image.onLoadStart();
    h.fail();
    h.advance(1499);
    assert.deepEqual(h.reloads, ['reference']);
    h.advance(1);
    h.fail();
    h.advance(10000);
    assert.deepEqual(h.reloads, ['reference', 'reference']);
    assert.deepEqual(plain(h.image.style), originalStyle, 'retrying does not alter native reference geometry');
    assert.equal(h.image.cachePolicy, 'disk');
  });

  test(`${variant.name} reference success cancels retry and keeps size callbacks intact after later native errors`, () => {
    const h = harness(variant);
    h.fail();
    h.loaded();
    h.advance(10000);
    assert.deepEqual(h.reloads, []);
    if (variant.name === 'camera') assert.deepEqual(h.sizes, [{ width: 1600, height: 900 }]);
    else assert.deepEqual(h.loads, [load]);
    h.image.onLoadStart();
    h.fail();
    h.advance(10000);
    assert.deepEqual(h.reloads, []);
    assert.equal(h.sizes.length + h.loads.length, 1, 'an error must not clear or replace successful size information');
  });

  test(`${variant.name} reference unmount and URI remount cancel old requests without consuming the new budget`, () => {
    for (const replacement of [undefined, 'next-reference']) {
      const h = harness(variant);
      h.fail();
      const oldError = h.image.onError;
      if (replacement) h.render(replacement);
      else h.unmount();
      oldError(error);
      h.advance(10000);
      assert.deepEqual(h.reloads, []);
      if (!replacement) continue;
      h.fail();
      h.advance(500);
      assert.deepEqual(h.reloads, ['next-reference']);
    }
  });
}

test('camera and result reference call sites key their loading state by the displayed URI', () => {
  for (const variant of variants) {
    const sourceFile = ts.createSourceFile(
      `${variant.name}.tsx`,
      variant.source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const calls = [];
    function visit(node) {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(sourceFile) === variant.component
      ) {
        const expressions = new Map(
          node.attributes.properties
            .filter(ts.isJsxAttribute)
            .map((attribute) => [
              attribute.name.getText(sourceFile),
              attribute.initializer && ts.isJsxExpression(attribute.initializer)
                ? attribute.initializer.expression?.getText(sourceFile)
                : undefined,
            ]),
        );
        calls.push(expressions);
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    assert.equal(calls.length, variant.name === 'camera' ? 2 : 1);
    for (const attributes of calls) {
      assert.equal(attributes.get('uri'), 'referenceUri');
      assert.equal(attributes.get('key'), attributes.get('uri'), 'changing reference URI must reset its controller');
    }
  }
});
