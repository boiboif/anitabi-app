import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { jsx, jsxs } from 'react/jsx-runtime';
import ts from 'typescript';

const compiled = ts.transpileModule(
  readFileSync(new URL('../../src/components/ui/strict-button.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

// Exercise the actual wrapper across renders, observing the props delivered to
// Tamagui's button. Native enabled state and touch delivery need device coverage.
function createHarness() {
  const refs = [];
  let cursor = 0;
  const modules = {
    react: {
      useRef(initial) {
        const index = cursor++;
        return (refs[index] ??= { current: initial });
      },
    },
    'react/jsx-runtime': { jsx, jsxs },
    'tamagui/button': { Button: () => null },
  };
  const context = vm.createContext({
    exports: {},
    require(name) {
      assert.ok(name in modules, `unexpected import: ${name}`);
      return modules[name];
    },
  });
  vm.runInContext(compiled, context);
  return {
    render(props = {}) {
      cursor = 0;
      const element = context.exports.StrictButton({ children: 'Save', ...props });
      assert.equal(element.type, modules['tamagui/button'].Button);
      return element.props;
    },
  };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const press = (locationX = 20, locationY = 20) => ({ nativeEvent: { locationX, locationY } });
const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 44 } } };

test('disabled buttons explicitly clear accessibility disabled state when enabled or the prop is removed', () => {
  const button = createHarness();
  const snapshots = [
    button.render({ disabled: true }),
    button.render({ disabled: false }),
    button.render(),
    button.render({ disabled: true }),
    button.render(),
  ];
  assert.deepEqual(
    snapshots.map(({ accessibilityState }) => accessibilityState.disabled),
    [true, false, false, true, false],
  );
  for (const props of snapshots) {
    assert.equal(Object.hasOwn(props.accessibilityState, 'disabled'), true);
  }
  assert.equal(snapshots[0].disabled, true);
  assert.equal(snapshots[1].disabled, false);
  assert.equal(snapshots[2].disabled, undefined);
  assert.equal(snapshots[4].disabled, undefined);
});

test('explicit button disabled state preserves other caller accessibility values without mutating them', () => {
  const button = createHarness();
  const accessibilityState = Object.freeze({ busy: true, checked: 'mixed', selected: true, expanded: false });
  const disabled = button.render({ disabled: true, accessibilityState });
  const enabled = button.render({ disabled: false, accessibilityState });
  assert.deepEqual(plain(disabled.accessibilityState), {
    busy: true,
    checked: 'mixed',
    selected: true,
    expanded: false,
    disabled: true,
  });
  assert.deepEqual(plain(enabled.accessibilityState), {
    busy: true,
    checked: 'mixed',
    selected: true,
    expanded: false,
    disabled: false,
  });
  assert.deepEqual(accessibilityState, { busy: true, checked: 'mixed', selected: true, expanded: false });
  assert.notEqual(enabled.accessibilityState, accessibilityState);
  assert.equal(disabled.accessibilityState.disabled, true, 'a later render must not mutate a previous state snapshot');
});

test('caller accessibility disabled remains supported and an explicit disabled prop wins when supplied', () => {
  const button = createHarness();
  assert.equal(button.render({ accessibilityState: { disabled: true } }).accessibilityState.disabled, true);
  assert.equal(button.render({ accessibilityState: { disabled: false } }).accessibilityState.disabled, false);
  assert.equal(
    button.render({ disabled: false, accessibilityState: { disabled: true, busy: true } }).accessibilityState.disabled,
    false,
  );
  assert.equal(
    button.render({ disabled: true, accessibilityState: { disabled: false, selected: true } }).accessibilityState
      .disabled,
    true,
  );
  assert.equal(button.render().accessibilityState.disabled, false);
});

test('a release outside the measured button does not press, including after a re-render', () => {
  const button = createHarness();
  const calls = [];
  const onPress = (event) => calls.push(event);
  let props = button.render({ onPress });
  props.onLayout(layout);
  props.onPress(press(101, 20));
  assert.deepEqual(calls, []);

  props = button.render({ onPress, accessibilityState: { busy: false } });
  props.onPress(press(20, 45));
  assert.deepEqual(calls, [], 'a re-render must retain the measured button bounds');

  const inside = press();
  props.onPress(inside);
  assert.deepEqual(calls, [inside]);
});

test('the wrapper passes move and press-in callbacks through and configures Tamagui press retention', () => {
  const button = createHarness();
  const layoutEvents = [];
  const onPressIn = () => {};
  const onResponderMove = () => {};
  const props = button.render({
    onLayout: (event) => layoutEvents.push(event),
    onPressIn,
    onResponderMove,
  });
  props.onLayout(layout);
  assert.deepEqual(layoutEvents, [layout]);
  assert.equal(props.onPressIn, onPressIn);
  assert.equal(props.onResponderMove, onResponderMove);
  assert.deepEqual(plain(props.pressRetentionOffset), { top: 0, right: 0, bottom: 0, left: 0 });

  const pressRetentionOffset = { top: 4, right: 4, bottom: 4, left: 4 };
  assert.equal(button.render({ pressRetentionOffset }).pressRetentionOffset, pressRetentionOffset);
});
