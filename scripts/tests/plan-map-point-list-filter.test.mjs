import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as cardListLayout from '../../src/lib/card-list-layout.ts';

const source = readFileSync(
  new URL('../../src/components/plan/plan-map-point-list-sheet.tsx', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

// This harness records requested scroll commands and invokes list callbacks explicitly.
// It does not model native layout, mounting, image recycling, or visible intermediate frames.
function createHarness(
  points,
  selectedKey,
  {
    rowHeight = 104,
    measureRow = (index) => index * rowHeight,
    maxOffset = Infinity,
    autoPresent = true,
    loadBeforePresent = true,
    positionBeforeDidPresent = false,
  } = {},
) {
  const slots = [];
  const frames = new Map();
  const timers = new Map();
  const scrollCalls = [];
  let cursor = 0;
  let dirty = false;
  let effects = [];
  let frameId = 0;
  let timerId = 0;
  let tree;
  let list;
  let offset = 0;
  const sameDeps = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const effect = (run, deps, layout) => {
    const index = cursor++;
    if (!sameDeps(slots[index]?.deps, deps)) effects.push({ index, run, deps, layout });
  };
  const react = {
    forwardRef: (render) => render,
    memo: (render) => render,
    useState: (initial) => {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [
        slots[index].value,
        (update) => {
          const next = typeof update === 'function' ? update(slots[index].value) : update;
          if (!Object.is(next, slots[index].value)) {
            slots[index].value = next;
            dirty = true;
          }
        },
      ];
    },
    useRef: (value) => {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: value };
      return slots[index];
    },
    useMemo: (calculate, deps) => {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { value: calculate(), deps };
      return slots[index].value;
    },
    useCallback: (callback, deps) => react.useMemo(() => callback, deps),
    useLayoutEffect: (run, deps) => effect(run, deps, true),
    useEffect: (run, deps) => effect(run, deps, false),
  };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    '@/lib/card-list-layout': cardListLayout,
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-i18next': { useTranslation: () => ({ t: (_, options) => options?.defaultValue }) },
    tamagui: {
      useTheme: () => ({ color2: { val: '#fff' }, primary: { val: '#000' }, color12: { val: '#000' } }),
      useThemeName: () => 'light',
    },
    'zustand/vanilla': { createStore: () => (initialize) => ({ setState() {}, getState: initialize }) },
    '@shopify/flash-list': { FlashList: 'FlashList' },
  };
  const nativeScroll = {
    scrollTo: (options) => {
      scrollCalls.push({ ...options });
    },
  };
  const contentLength = () =>
    list.props.data.length * rowHeight +
    list.props.contentContainerStyle.paddingTop +
    list.props.contentContainerStyle.paddingBottom;
  const context = vm.createContext({
    __DEV__: false,
    exports: {},
    require: (name) => modules[name] ?? {},
    setTimeout: (run) => {
      timers.set(++timerId, run);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (run) => {
      frames.set(++frameId, run);
      return frameId;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  vm.runInContext(compiled, context);

  function render() {
    let passes = 0;
    do {
      assert.ok(++passes < 20, 'render reaches a stable state');
      dirty = false;
      cursor = 0;
      effects = [];
      tree = context.exports.default({ points, selectedKey, onSelect() {}, onToggleCompleted() {} }, null);
      list = tree.props.children.props.children;
      list.props.ref.current = {
        getNativeScrollRef: () => nativeScroll,
        getLayout: (index) => {
          const y = measureRow(index);
          return y === undefined ? undefined : { x: 0, y, width: 400, height: rowHeight };
        },
      };
      for (const pending of effects.sort((a, b) => Number(b.layout) - Number(a.layout))) {
        slots[pending.index]?.cleanup?.();
        slots[pending.index] = { deps: pending.deps, cleanup: pending.run() };
      }
    } while (dirty);
  }

  function invoke(callback) {
    callback();
    if (dirty) render();
  }

  function captureFrames() {
    const callbacks = [...frames.values()];
    frames.clear();
    return callbacks;
  }

  function flushFrame() {
    captureFrames().forEach((run) => run());
    if (dirty) render();
  }

  function applyRequestedOffset() {
    const command = scrollCalls.at(-1);
    if (command) offset = Math.min(maxOffset, command.y);
  }

  function present() {
    if (loadBeforePresent) invoke(list.props.onLoad);
    invoke(tree.props.onWillPresent);
    if (positionBeforeDidPresent) invoke(tree.props.onPositionChange);
    invoke(tree.props.onDidPresent);
    applyRequestedOffset();
    flushFrame();
  }

  render();
  if (autoPresent) present();
  scrollCalls.length = 0;

  return {
    toggle() {
      invoke(tree.props.header.props.children[0].props.children[1].props.children[1].props.onPress);
    },
    beginDrag() {
      invoke(list.props.onScrollBeginDrag);
    },
    scrollAway(y) {
      invoke(list.props.onScrollBeginDrag);
      offset = y;
      invoke(() => list.props.onScroll({ nativeEvent: { contentOffset: { y } } }));
      invoke(list.props.onScrollEndDrag);
    },
    scrollEvent(y) {
      offset = y;
      invoke(() => list.props.onScroll({ nativeEvent: { contentOffset: { y } } }));
    },
    load() {
      invoke(list.props.onLoad);
    },
    commit() {
      invoke(list.props.onCommitLayoutEffect);
    },
    captureCommit: () => list.props.onCommitLayoutEffect,
    willPresent() {
      invoke(tree.props.onWillPresent);
    },
    positionChanged() {
      invoke(tree.props.onPositionChange);
    },
    didPresent() {
      invoke(tree.props.onDidPresent);
    },
    dismiss() {
      invoke(tree.props.onDidDismiss);
    },
    contentReady(height = contentLength()) {
      invoke(() => list.props.onContentSizeChange(400, height));
    },
    flushFrame,
    flushTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((run) => run());
      if (dirty) render();
    },
    captureFrames,
    present,
    get offset() {
      return offset;
    },
    get visibleKeys() {
      return list.props.data.map((point) => point.item.key);
    },
    get locateButtonVisible() {
      return Boolean(tree.props.footer.props.children);
    },
    get listType() {
      return list.type;
    },
    get positionMaintenanceDisabled() {
      return list.props.maintainVisibleContentPosition?.disabled;
    },
    scrollCalls,
  };
}

const point = (key, completed = false) => ({ item: { key, completed } });

test('completed rows above the selection position both filter directions in the committed layout callback', () => {
  const app = createHarness([point('done', true), point('a'), point('b'), point('selected'), point('c')], 'selected');
  assert.equal(app.listType, 'FlashList');
  assert.equal(app.positionMaintenanceDisabled, true, 'automatic first-row correction must not compete with selection');
  app.toggle();
  assert.deepEqual([...app.visibleKeys], ['a', 'b', 'selected', 'c']);
  assert.equal(app.scrollCalls.length, 0, 'the data render alone does not establish a committed list layout');
  app.commit();
  assert.equal(app.scrollCalls.length, 1, 'the command is issued before the next animation frame');
  assert.equal(app.scrollCalls[0].y, 104);
  assert.equal(app.scrollCalls[0].animated, false);
  app.commit();
  app.flushFrame();
  assert.equal(app.scrollCalls.length, 1, 'later commits and cleanup do not repeat positioning');
  app.toggle();
  assert.equal(app.scrollCalls.length, 1);
  app.commit();
  assert.equal(app.scrollCalls.at(-1).y, 208);
});

test('filtering the immediately preceding completed row still positions the selected item', () => {
  const app = createHarness([point('a'), point('done', true), point('selected'), point('c')], 'selected');
  app.toggle();
  app.commit();
  assert.equal(app.scrollCalls[0].y, 0);
  app.flushFrame();
  app.toggle();
  app.commit();
  assert.equal(app.scrollCalls.at(-1).y, 104);
});

test('the selected item at index zero keeps a nonnegative positioning request', () => {
  const app = createHarness([point('done', true), point('selected'), point('c')], 'selected');
  app.toggle();
  assert.equal(app.visibleKeys[0], 'selected');
  app.commit();
  assert.equal(app.scrollCalls[0].y, 0);
  app.flushFrame();
  app.toggle();
  app.commit();
  assert.equal(app.visibleKeys[1], 'selected');
  assert.equal(app.scrollCalls.at(-1).y, 0);
});

test('an initially selected first row requests the top on both filter directions', () => {
  const app = createHarness([point('selected'), point('done', true), point('c')], 'selected');
  app.toggle();
  app.commit();
  app.flushFrame();
  app.toggle();
  app.commit();
  assert.deepEqual(
    app.scrollCalls.map((command) => command.y),
    [0, 0],
  );
});

test('filtering after scrolling away positions the selection as soon as the new layout is committed', () => {
  const app = createHarness([point('done', true), point('a'), point('b'), point('selected'), point('c')], 'selected');
  app.scrollAway(0);
  app.toggle();
  assert.equal(app.scrollCalls.length, 0);
  app.commit();
  assert.equal(app.scrollCalls.length, 1);
  assert.equal(app.scrollCalls[0].y, 104);
  assert.equal(app.scrollCalls[0].animated, false);
});

test('completed rows below the selected item do not change its positioning target', () => {
  const app = createHarness([point('a'), point('b'), point('selected'), point('done', true)], 'selected');
  app.toggle();
  app.commit();
  app.flushFrame();
  app.toggle();
  app.commit();
  assert.deepEqual(
    app.scrollCalls.map((command) => command.y),
    [104, 104],
  );
});

test('filtering out the completed selection positions at top and restoring it positions at its row', () => {
  const app = createHarness([point('a'), point('b'), point('selected', true)], 'selected');
  app.toggle();
  app.commit();
  assert.equal(app.scrollCalls[0].y, 0);
  app.flushFrame();
  app.toggle();
  app.commit();
  assert.equal(app.scrollCalls.at(-1).y, 104);
});

test('empty filtering issues no scroll and nonempty content can position on its layout commit', () => {
  const app = createHarness([point('a', true), point('b', true), point('selected', true)], 'selected');
  app.toggle();
  app.commit();
  app.flushFrame();
  assert.equal(app.visibleKeys.length, 0);
  assert.equal(app.scrollCalls.length, 0, 'empty content has no selected row to position');
  app.toggle();
  assert.equal(app.scrollCalls.length, 0);
  app.commit();
  assert.equal(app.scrollCalls.length, 1);
  assert.equal(app.scrollCalls[0].y, 104);
});

test('a pending filter can position on a committed layout before initial load', () => {
  const app = createHarness([point('a'), point('b'), point('selected'), point('done', true)], 'selected', {
    loadBeforePresent: false,
  });
  app.toggle();
  assert.equal(app.scrollCalls.length, 0);
  app.commit();
  assert.equal(app.scrollCalls.length, 1, 'the new layout commit establishes readiness without another onLoad event');
  assert.equal(app.scrollCalls[0].y, 104);
  app.load();
  app.commit();
  assert.equal(app.scrollCalls.length, 1);
});

test('a content-size event cannot replace the new filter layout commit', () => {
  const app = createHarness([point('done', true), point('a'), point('b'), point('selected')], 'selected');
  app.toggle();
  app.contentReady();
  app.flushFrame();
  assert.equal(app.scrollCalls.length, 0);
  app.commit();
  assert.equal(app.scrollCalls[0].y, 104);
});

test('cleanup from an earlier filter does not expose scroll events during a newer filter', () => {
  const app = createHarness([point('done', true), point('a'), point('b'), point('selected')], 'selected');
  app.toggle();
  app.commit();
  const oldCleanup = app.captureFrames();
  app.toggle();
  app.commit();
  oldCleanup.forEach((run) => run());
  app.scrollEvent(0);
  app.scrollEvent(104);
  assert.equal(app.locateButtonVisible, false, 'stale cleanup must not clear the current filter transition');
  app.flushFrame();
  app.scrollEvent(0);
  app.scrollEvent(104);
  assert.equal(app.locateButtonVisible, true, 'the current transition cleanup restores ordinary scroll handling');
  assert.deepEqual(
    app.scrollCalls.map((command) => command.y),
    [104, 208],
  );
});

test('a drag cancels filter positioning that is still waiting for layout commit', () => {
  const app = createHarness([point('done', true), point('a'), point('b'), point('selected')], 'selected');
  app.toggle();
  app.beginDrag();
  app.commit();
  assert.equal(app.scrollCalls.length, 0, 'a later layout callback must not override the user drag');
  app.scrollAway(0);
  app.toggle();
  app.commit();
  assert.equal(app.scrollCalls.length, 1);
  assert.equal(app.scrollCalls[0].y, 208);
});

test('dismissal prevents an old layout callback from positioning and reopening establishes a new request', () => {
  const app = createHarness([point('done', true), point('a'), point('b'), point('selected')], 'selected');
  app.toggle();
  const oldCommit = app.captureCommit();
  app.dismiss();
  oldCommit();
  assert.equal(app.scrollCalls.length, 0);
  app.present();
  assert.equal(app.scrollCalls.at(-1).y, 104);
  app.scrollCalls.length = 0;
  app.toggle();
  app.commit();
  assert.equal(app.scrollCalls[0].y, 208);
});

test('reopening can position on a new layout commit without another initial-load event', () => {
  const app = createHarness([point('done', true), point('a'), point('b'), point('selected')], 'selected', {
    loadBeforePresent: false,
    positionBeforeDidPresent: true,
  });
  app.commit();
  assert.equal(app.scrollCalls.at(-1).y, 208);
  app.flushFrame();
  app.dismiss();
  app.scrollCalls.length = 0;
  app.present();
  assert.equal(app.scrollCalls.length, 0);
  app.commit();
  assert.equal(app.scrollCalls.length, 1);
  assert.equal(app.scrollCalls[0].y, 208);
});

test('a layout commit after presentation can position without waiting for the first-load or position event', () => {
  const app = createHarness([point('a'), point('b'), point('selected')], 'selected', {
    loadBeforePresent: false,
  });
  assert.equal(app.scrollCalls.length, 0);
  app.commit();
  assert.equal(app.scrollCalls.length, 1);
  assert.equal(app.scrollCalls[0].y, 104);
  app.load();
  app.positionChanged();
  assert.equal(app.scrollCalls.length, 1, 'later readiness events must not repeat the completed positioning');
});

test('a clamped previous viewport does not cap the new native positioning target in JavaScript', () => {
  const app = createHarness(
    [point('done', true), point('a'), point('b'), point('c'), point('selected'), point('d')],
    'selected',
    { maxOffset: 104 },
  );
  assert.equal(app.offset, 104, 'the harness feeds a prior bounded viewport into the next action');
  app.toggle();
  app.commit();
  assert.equal(app.scrollCalls[0].y, 208, 'the native command retains the full target for TrueSheet padding');
});

test('the opening position event can request selection positioning before did-present', () => {
  const app = createHarness([point('done', true), point('a'), point('b'), point('selected')], 'selected', {
    autoPresent: false,
  });
  app.load();
  app.willPresent();
  assert.equal(app.scrollCalls.length, 0);
  app.positionChanged();
  assert.equal(app.scrollCalls.length, 1);
  assert.equal(app.scrollCalls[0].y, 208);
  app.didPresent();
  assert.equal(app.scrollCalls.length, 1, 'presentation completion does not duplicate the early positioning');
  app.flushFrame();
  app.toggle();
  app.commit();
  assert.equal(app.scrollCalls.at(-1).y, 104);
});

test('both filter directions use measured fractional row positions instead of the 104 pixel estimate', () => {
  const rowHeight = 103.0769;
  const app = createHarness([point('done', true), point('a'), point('b'), point('selected'), point('c')], 'selected', {
    rowHeight,
  });
  assert.equal(app.offset, rowHeight * 2, 'initial positioning also uses the measured preceding row');
  app.toggle();
  app.commit();
  assert.equal(app.scrollCalls[0].y, rowHeight);
  app.flushFrame();
  app.toggle();
  app.commit();
  assert.equal(app.scrollCalls.at(-1).y, rowHeight * 2);
});

test('unavailable row measurements fall back to the fixed row estimate', () => {
  const app = createHarness([point('done', true), point('a'), point('b'), point('selected'), point('c')], 'selected', {
    rowHeight: 103.0769,
    measureRow: () => undefined,
  });
  assert.equal(app.offset, 208);
  app.toggle();
  app.commit();
  assert.equal(app.scrollCalls[0].y, 104);
  app.flushFrame();
  app.toggle();
  app.commit();
  assert.equal(app.scrollCalls.at(-1).y, 208);
});

test('a measured zero position is retained rather than replaced by a nonzero estimate', () => {
  const app = createHarness([point('done', true), point('a'), point('b'), point('selected'), point('c')], 'selected', {
    // A zero measurement at a nonzero index makes a truthy fallback observably incorrect.
    measureRow: (index) => (index === 1 ? 0 : index * 104),
  });
  app.toggle();
  app.commit();
  assert.equal(app.scrollCalls[0].y, 0);
});
