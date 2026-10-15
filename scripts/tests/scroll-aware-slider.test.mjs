import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/components/ui/scroll-aware-slider.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

// Run the actual component callbacks. RNGH's native arbitration with TrueSheet/ScrollView
// is not simulated here and still requires a device test.
function createHarness(overrides = {}) {
  const refs = [];
  const changes = [];
  let cursor = 0;
  let pan;
  let tap;
  let tree;
  let props = { min: 0, max: 32, step: 2, value: 8, accessibilityLabel: '边框宽度', ...overrides };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: {
      useRef(value) {
        return (refs[cursor++] ??= { current: value });
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native-gesture-handler': {
      GestureDetector: 'GestureDetector',
      usePanGesture: (config) => (pan = config),
      useTapGesture: (config) => (tap = config),
      useCompetingGestures: (...gestures) => gestures,
    },
    tamagui: { View: 'View', Slider: { Track: 'Track', TrackActive: 'TrackActive', Thumb: 'Thumb' } },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: (name) => modules[name] });
  function render(value = props.value) {
    props = { ...props, value };
    cursor = 0;
    tree = module.exports.ScrollAwareSlider({ ...props, onValueChange: (next) => changes.push(next) });
    tree.props.children.props.onLayout({ nativeEvent: { layout: { width: 320 } } });
  }
  render();
  return {
    changes,
    render,
    get pan() {
      return pan;
    },
    get tap() {
      return tap;
    },
    get view() {
      return tree.props.children.props;
    },
  };
}

test('touching the track and then abandoning the gesture does not change the value', () => {
  const app = createHarness();
  app.pan.onBegin({ x: 240 });
  app.pan.onDeactivate({ canceled: true, x: 240, translationX: 0 });
  assert.deepEqual(app.changes, []);
  assert.equal(app.pan.activeOffsetY, undefined);
  assert.equal(app.pan.failOffsetY[0], -8);
  assert.equal(app.pan.failOffsetY[1], 8);
  assert.equal(app.pan.activeOffsetX[0], -10);
  assert.equal(app.pan.activeOffsetX[1], 10);
  assert.equal(app.tap.maxDistance, 8);
  assert.equal(app.view.children.props.pointerEvents, 'none', 'Tamagui cannot claim the touch on press-down');
});

test('a recognized tap commits its track position while a thumb tap leaves the value unchanged', () => {
  const app = createHarness();
  app.pan.onBegin({ x: 240 });
  assert.deepEqual(app.changes, []);
  app.tap.onActivate({ x: 240 });
  assert.deepEqual(app.changes, [24]);
  app.render(24);
  app.tap.onActivate({ x: 236 });
  assert.deepEqual(app.changes, [24]);
});

test('thumb dragging preserves its initial offset and value across controlled re-renders', () => {
  const app = createHarness();
  app.pan.onBegin({ x: 100 }); // Off-center, still within the thumb's touch area.
  // Android resets translationX at activation; use the original touch position instead.
  app.pan.onActivate({ x: 120, translationX: 0 });
  assert.deepEqual(app.changes, [10]);
  app.render(10);
  app.pan.onUpdate({ x: 140, translationX: 40 });
  assert.deepEqual(app.changes, [10, 12]);
});

test('horizontal dragging from the track follows the pointer, snaps to steps and clamps both ends', () => {
  const app = createHarness();
  app.pan.onBegin({ x: 240 });
  app.pan.onActivate({ x: 260, translationX: 20 });
  app.pan.onUpdate({ x: 500, translationX: 260 });
  app.pan.onDeactivate({ canceled: false, x: -100, translationX: -340 });
  assert.deepEqual(app.changes, [26, 32, 0]);
  const nonzero = createHarness({ min: 2, max: 10, step: 2, value: 2 });
  nonzero.tap.onActivate({ x: 120 });
  assert.deepEqual(nonzero.changes, [6]);
});

test('accessibility supports stepping and disabled controls cannot activate', () => {
  const app = createHarness();
  app.view.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
  app.view.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } });
  assert.deepEqual(app.changes, [10, 6]);
  const disabled = createHarness({ disabled: true });
  assert.equal(disabled.pan.enabled, false);
  assert.equal(disabled.tap.enabled, false);
  disabled.view.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
  assert.deepEqual(disabled.changes, []);
});
