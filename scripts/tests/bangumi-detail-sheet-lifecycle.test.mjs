import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the production hook with controlled commits and native callbacks.
// This verifies lifecycle ordering, not React Native rendering or animation.
const source = readFileSync(new URL('../../src/components/map/bangumi-detail-sheet.tsx', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('sheet.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const hook = parsed.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'useBangumiDetailSheet',
);
assert.ok(hook, 'detail sheet lifecycle hook exists');
const compiled = ts.transpileModule(hook.getText(parsed), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function createHarness(platform = 'android') {
  const slots = [];
  let cursor = 0;
  let dirty = false;
  let effects = [];
  let requested;
  let focused = true;
  let committedFocus = true;
  let isRendering = false;
  let openedId = null;
  let dismissCalls = 0;
  let clearCalls = 0;
  const restoredOffsets = [];
  const nativeSheet = {
    dismiss: async () => {
      dismissCalls++;
    },
  };
  const list = { scrollToOffset: ({ offset }) => restoredOffsets.push(offset) };
  const sameDeps = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const effect = (run, deps, layout) => {
    const index = cursor++;
    if (!sameDeps(slots[index]?.deps, deps)) effects.push({ index, run, deps, layout });
  };
  const context = vm.createContext({
    console,
    Platform: { OS: platform },
    DEFAULT_BANGUMI_DETAIL_DETENT_INDEX: 1,
    BANGUMI_DETAIL_SHEET_DETENTS: [0.25, 0.8],
    useMapBrowse: { getState: () => ({ openedBangumiDetailsId: openedId }) },
    useIsFocused: () => focused,
    useNavigation: () => ({
      isFocused: () => {
        assert.equal(isRendering, false, 'render must read focus from useIsFocused');
        return committedFocus;
      },
    }),
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
    useCallback: (callback, deps) => {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { value: callback, deps };
      return slots[index].value;
    },
    useLayoutEffect: (run, deps) => effect(run, deps, true),
    useEffect: (run, deps) => effect(run, deps, false),
  });
  vm.runInContext(compiled, context);

  function render() {
    let result;
    let passes = 0;
    do {
      assert.ok(++passes < 20, 'render reaches a stable session');
      dirty = false;
      cursor = 0;
      effects = [];
      isRendering = true;
      try {
        result = context.useBangumiDetailSheet(requested, () => {
          clearCalls++;
          openedId = null;
          requested = undefined;
          dirty = true;
        });
      } finally {
        isRendering = false;
      }
      if (dirty) continue;
      // The imperative navigation snapshot updates after render, unlike the hook.
      committedFocus = focused;
      result.sheetRef.current = result.shouldRenderSheet ? nativeSheet : null;
      result.flashListRef.current = result.shouldRenderSheet ? list : null;
      for (const pending of effects.sort((a, b) => Number(b.layout) - Number(a.layout))) {
        slots[pending.index]?.cleanup?.();
        slots[pending.index] = { deps: pending.deps, cleanup: pending.run() };
      }
    } while (dirty);
    return result;
  }

  return {
    render,
    select(work) {
      requested = work;
      openedId = work?.id ?? null;
      return render();
    },
    focus(value) {
      focused = value;
      return render();
    },
    setNavigationFocus(value) {
      committedFocus = value;
    },
    get openedId() {
      return openedId;
    },
    get dismissCalls() {
      return dismissCalls;
    },
    get clearCalls() {
      return clearCalls;
    },
    restoredOffsets,
  };
}

const workA = { id: 10, title: 'A', points: [] };
const workB = { id: 20, title: 'B', points: [] };

test('returning to a selected work opens using render focus before navigation commits', () => {
  const app = createHarness();
  app.focus(false);
  assert.equal(app.select(workA).shouldRenderSheet, false);
  const opened = app.focus(true);
  assert.equal(opened.shouldRenderSheet, true);
  assert.equal(opened.selectedBangumi, workA);
});

test('native opening checks live navigation focus before the next hook render', () => {
  const app = createHarness();
  const opened = app.select(workA);
  app.setNavigationFocus(false);
  opened.handleSheetWillPresent();
  assert.equal(app.dismissCalls, 1);
  assert.equal(app.clearCalls, 0);
  assert.equal(app.openedId, workA.id);
});

test('X keeps the work mounted until native dismissal finishes', () => {
  const app = createHarness();
  const opened = app.select(workA);
  opened.handleSheetPresent();
  const closing = app.select(undefined);
  assert.equal(closing.shouldRenderSheet, true);
  assert.equal(closing.selectedBangumi, workA);
  assert.equal(app.dismissCalls, 1);
  app.render();
  assert.equal(app.dismissCalls, 1);
  closing.handleSheetDismiss();
  assert.equal(app.render().shouldRenderSheet, false);
});

test('Android close interrupts opening before did-present and retains the content until closed', () => {
  const app = createHarness();
  const opened = app.select(workA);
  opened.handleSheetWillPresent();
  const closing = app.select(undefined);
  assert.equal(app.dismissCalls, 1);
  assert.equal(closing.selectedBangumi, workA);
  assert.equal(closing.shouldRenderSheet, true);
  // A late opening-completion event must not restore content or dismiss twice.
  opened.handleSheetPresent();
  assert.equal(app.dismissCalls, 1);
  opened.handleSheetDismiss();
  assert.equal(app.render().shouldRenderSheet, false);
});

test('Android close before native opening starts executes at will-present instead of did-present', () => {
  const app = createHarness();
  const opened = app.select(workA);
  app.select(undefined);
  assert.equal(app.dismissCalls, 0);
  opened.handleSheetWillPresent();
  assert.equal(app.dismissCalls, 1);
  opened.handleSheetDismiss();
  assert.equal(app.render().shouldRenderSheet, false);
});

test('route blur preserves selection, detent and scroll position for a new mount', () => {
  const app = createHarness();
  let opened = app.select(workA);
  opened.handleSheetPresent();
  opened.handleDetentChange({ nativeEvent: { index: 0 } });
  opened.handleListScroll({ nativeEvent: { contentOffset: { y: 275 } } });
  opened = app.render();
  const closing = app.focus(false);
  assert.equal(closing.selectedBangumi, workA);
  assert.equal(closing.shouldRenderSheet, true);
  assert.equal(app.dismissCalls, 1);
  closing.handleSheetDismiss();
  assert.equal(app.render().shouldRenderSheet, false);
  assert.equal(app.openedId, workA.id);
  const reopened = app.focus(true);
  assert.notEqual(reopened.sheetKey, opened.sheetKey);
  assert.equal(reopened.initialDetentIndex, 0);
  reopened.handleListLoad();
  reopened.handleSheetPresent();
  assert.deepEqual(app.restoredOffsets, [275]);
});

test('returning during dismissal reopens without clearing the preserved work', () => {
  const app = createHarness();
  const opened = app.select(workA);
  opened.handleSheetPresent();
  const closing = app.focus(false);
  app.focus(true);
  closing.handleSheetDismiss();
  const reopened = app.render();
  assert.equal(app.clearCalls, 0);
  assert.equal(app.openedId, workA.id);
  assert.notEqual(reopened.sheetKey, opened.sheetKey);
  opened.handleSheetDismiss();
  assert.equal(app.render().sheetKey, reopened.sheetKey);
  assert.equal(app.openedId, workA.id);
});

test('opening a different work waits for the old animation and rejects its stale events', () => {
  const app = createHarness();
  const opened = app.select(workA);
  opened.handleSheetPresent();
  const closing = app.select(workB);
  assert.equal(closing.selectedBangumi, workA);
  assert.equal(app.dismissCalls, 1);
  closing.handleSheetDismiss();
  const next = app.render();
  assert.equal(next.selectedBangumi, workB);
  assert.notEqual(next.sheetKey, opened.sheetKey);
  opened.handleSheetDismiss();
  assert.equal(app.openedId, workB.id);
  assert.equal(app.clearCalls, 0);
});

test('native back or drag clears the selection only after dismissal and resets the next visit', () => {
  const app = createHarness();
  const opened = app.select(workA);
  opened.handleSheetPresent();
  opened.handleDetentChange({ nativeEvent: { index: 0 } });
  opened.handleListScroll({ nativeEvent: { contentOffset: { y: 100 } } });
  opened.handleSheetWillDismiss();
  assert.equal(app.openedId, workA.id);
  opened.handleSheetDismiss();
  assert.equal(app.render().shouldRenderSheet, false);
  assert.equal(app.clearCalls, 1);
  const reopened = app.select(workA);
  assert.equal(reopened.initialDetentIndex, 1);
  reopened.handleListLoad();
  reopened.handleSheetPresent();
  assert.deepEqual(app.restoredOffsets, []);
});

test('Android route blur immediately closes during opening and retains the work', () => {
  const app = createHarness();
  const opened = app.select(workA);
  opened.handleSheetWillPresent();
  app.focus(false);
  assert.equal(app.dismissCalls, 1);
  opened.handleSheetDismiss();
  assert.equal(app.render().shouldRenderSheet, false);
  assert.equal(app.openedId, workA.id);
});

test('iOS v3 waits for did-present because native dismiss rejects in-flight presentation', () => {
  const app = createHarness('ios');
  const opened = app.select(workA);
  opened.handleSheetWillPresent();
  app.select(undefined);
  assert.equal(app.dismissCalls, 0);
  opened.handleSheetPresent();
  assert.equal(app.dismissCalls, 1);
  opened.handleSheetDismiss();
  assert.equal(app.render().shouldRenderSheet, false);
});

test('refreshing data for the same work updates content without replacing the sheet', () => {
  const app = createHarness();
  const opened = app.select(workA);
  opened.handleSheetPresent();
  const updatedWork = { ...workA, title: 'Updated' };
  const updated = app.select(updatedWork);
  assert.equal(updated.selectedBangumi, updatedWork);
  assert.equal(updated.sheetKey, opened.sheetKey);
  assert.equal(app.dismissCalls, 0);
});

test('iOS navigation completion via blur releases the old mount without a dismiss event', () => {
  const app = createHarness();
  const opened = app.select(workA);
  opened.handleSheetPresent();
  const closing = app.focus(false);
  closing.handleSheetBlur();
  assert.equal(app.render().shouldRenderSheet, false);
  assert.equal(app.openedId, workA.id);
  assert.equal(app.clearCalls, 0);
  const reopened = app.focus(true);
  assert.notEqual(reopened.sheetKey, opened.sheetKey);
});

test('a child sheet blurring the detail sheet while home is focused retains its content', () => {
  const app = createHarness();
  const opened = app.select(workA);
  opened.handleSheetPresent();
  opened.handleSheetBlur();
  const current = app.render();
  assert.equal(current.shouldRenderSheet, true);
  assert.equal(current.sheetKey, opened.sheetKey);
  assert.equal(app.openedId, workA.id);
});
