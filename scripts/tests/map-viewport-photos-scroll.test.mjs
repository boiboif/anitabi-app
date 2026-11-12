import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/components/map/map-viewport-photos.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

const makeItem = (id, bangumiId = 10) => ({ bangumi: { id: bangumiId }, point: { id, geo: [35, 139], image: id } });
const items = (...ids) => ids.map((id) => makeItem(id));
const reference = (pointId, bangumiId = 10) => ({ bangumiId, pointId });

function find(node, type) {
  if (!node || typeof node !== 'object') return;
  if (node.type === type) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, type);
    if (result) return result;
  }
}

// Exercise the real component's committed effects and FlashList callbacks.
// Native layout, rendering and animation are not modelled by this harness.
function createHarness(initialItems, initialSelection = null) {
  const slots = [];
  const frames = new Map();
  const timers = new Map();
  const calls = [];
  let cursor = 0;
  let frameId = 0;
  let timerId = 0;
  let effects = [];
  let dirty = false;
  let tree;
  let list;
  let currentItems = initialItems;
  let currentViewport = { items: currentItems };
  let selectedMapPoint = initialSelection;
  let filteredBangumiId = null;
  let selectedBangumiIds = [];
  let nativeOffset = 0;
  let nativeWidth = 250;
  let layoutsReady = true;
  const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const memo = (calculate, deps) => {
    const index = cursor++;
    if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { value: calculate(), deps };
    return slots[index].value;
  };
  const effect = (run, deps, layout) => {
    const index = cursor++;
    if (!sameDeps(slots[index]?.deps, deps)) effects.push({ index, run, deps, layout });
  };
  const react = {
    use: () => 0,
    useRef(value) { return (slots[cursor++] ??= { current: value }); },
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (value) => {
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; }
      }];
    },
    useMemo: memo,
    useCallback: (callback, deps) => memo(() => callback, deps),
    useEffect: (run, deps) => effect(run, deps, false),
    useLayoutEffect: (run, deps) => effect(run, deps, true),
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const useMapBrowse = (selector) => selector({ selectedMapPoint, filteredBangumiId, openedBangumiDetailsId: null });
  useMapBrowse.getState = () => ({ selectedMapPoint, filteredBangumiId, openedBangumiDetailsId: null });
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-i18next': { useTranslation: () => ({ i18n: { resolvedLanguage: 'zh-CN' } }) },
    'react-native': {},
    '@shopify/flash-list': { FlashList: 'FlashList' },
    tamagui: { View: 'View', styled: () => 'Photo' },
    'expo-image': { Image: 'Image' },
    '@/components/app-tab-bar-inset': { AppTabBarInsetContext: {} },
    '@/lib/constants': { MAP_CONTROL_SIZE: 40 },
    '@/lib/localized-data': { getBangumiTitle: () => '', getPointTitle: () => '' },
    '@/services/handlers': { buildImageUrl: (image) => image },
    '@/store/use-map-browse': { useMapBrowse },
    '@/store/use-map-bangumi-filter': { useMapBangumiFilter: (selector) => selector({ selectedBangumiIds }) },
    '@/utils/map-viewport-points': { findViewportImagePoints: (_, viewport) => viewport.items },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
      return modules[name];
    },
    requestAnimationFrame: (run) => { frames.set(++frameId, run); return frameId; },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (run) => { timers.set(++timerId, run); return timerId; },
    clearTimeout: (id) => timers.delete(id),
  });
  const nativeList = {
    scrollToOffset: (command) => { calls.push({ ...command }); nativeOffset = command.offset; },
    scrollToIndex: (command) => calls.push({ ...command }),
    getLayout: (index) => layoutsReady ? { x: index * 86, y: 0, width: 80, height: 54 } : undefined,
    getFirstItemOffset: () => 12,
    getAbsoluteLastScrollOffset: () => nativeOffset,
    getWindowSize: () => ({ width: nativeWidth, height: 54 }),
  };
  function render() {
    let attempts = 0;
    do {
      assert.ok(++attempts < 20, 'render stabilizes');
      cursor = 0;
      dirty = false;
      effects = [];
      tree = module.exports.default({ bangumis: [], viewport: currentViewport, onSelect() {} });
      list = find(tree, 'FlashList');
      if (list?.props.ref && typeof list.props.ref !== 'function') list.props.ref.current = nativeList;
      for (const pending of effects.sort((a, b) => Number(b.layout) - Number(a.layout))) {
        slots[pending.index]?.cleanup?.();
        slots[pending.index] = { deps: pending.deps, cleanup: pending.run() };
      }
    } while (dirty);
  }
  function invoke(callback, ...args) {
    callback?.(...args);
    if (dirty) render();
  }
  function event(offset, width = 250) {
    return { nativeEvent: { contentOffset: { x: offset, y: 0 }, layoutMeasurement: { width, height: 54 }, contentSize: { width: currentItems.length * 86 + 18, height: 54 } } };
  }
  function flushFrames() {
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach((run) => run());
    if (dirty) render();
  }
  render();
  return {
    get list() { return list; }, calls,
    update(nextItems, nextSelection = selectedMapPoint) { currentItems = nextItems; currentViewport = { items: currentItems }; selectedMapPoint = nextSelection; render(); },
    rerender() { render(); },
    scroll(offset, width = 250) { nativeOffset = offset; nativeWidth = width; invoke(list?.props.onScroll, event(offset, width)); },
    beginDrag() { invoke(list?.props.onScrollBeginDrag, event(0)); },
    endDrag(offset, width = 250) { nativeOffset = offset; invoke(list?.props.onScrollEndDrag, event(offset, width)); },
    beginMomentum() { invoke(list?.props.onMomentumScrollBegin, event(nativeOffset)); },
    endMomentum() { invoke(list?.props.onMomentumScrollEnd, event(nativeOffset)); },
    layout(width = 250) {
      nativeWidth = width;
      invoke(tree?.props.onLayout, { nativeEvent: { layout: { x: 0, y: 0, width, height: 54 } } });
      invoke(list?.props.onContentSizeChange, currentItems.length * 86 + 18, 54);
    },
    content(width) { invoke(list?.props.onContentSizeChange, width, 54); },
    commitList() { invoke(list?.props.onCommitLayoutEffect); },
    setLayoutsReady(value) { layoutsReady = value; },
    load() { invoke(list?.props.onLoad, { elapsedTimeInMs: 1 }); },
    flushFrames,
    flushTimers() { const queued = [...timers.values()]; timers.clear(); queued.forEach((run) => run()); if (dirty) render(); },
    clear() { calls.length = 0; },
  };
}

test('a reordered viewport preserves the existing offset when the selected image is already fully visible', () => {
  const h = createHarness(items('a', 'b', 'c', 'd', 'e', 'f'), reference('b'));
  h.layout();
  h.scroll(70);
  h.clear();
  h.update(items('a', 'c', 'b', 'd', 'e', 'f'));
  h.commitList();
  h.flushFrames();
  assert.deepEqual(h.calls, [], 'a selected image inside the visible viewport needs no scroll');
});

test('a new viewport brings an offscreen selected image into view even when item order is unchanged', () => {
  const original = items('a', 'b', 'c', 'd', 'e', 'f', 'g');
  const h = createHarness(original, reference('c'));
  h.layout();
  h.commitList();
  h.scroll(300);
  h.clear();
  h.update(items('a', 'b', 'c', 'd', 'e', 'f', 'g'));
  h.commitList();
  h.flushFrames();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].offset, 184);
});

test('a rerender without a new viewport does not undo the user scrolling away', () => {
  const h = createHarness(items('a', 'b', 'c', 'd', 'e', 'f', 'g'), reference('c'));
  h.layout();
  h.commitList();
  h.scroll(300);
  h.clear();
  h.rerender();
  h.commitList();
  h.flushFrames();
  assert.deepEqual(h.calls, []);
});

test('a selected image moved beyond the viewport is brought just into view after sorting', () => {
  const h = createHarness(items('a', 'b', 'c', 'd', 'g', 'e', 'f', 'h'), reference('g'));
  h.layout();
  h.scroll(250);
  h.clear();
  h.update(items('a', 'b', 'c', 'd', 'e', 'f', 'h', 'g'));
  h.commitList();
  h.flushFrames();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].offset, 444, 'scroll only far enough to bring the selected image fully into view');
});

test('a selected image moved before the viewport is brought just into view after sorting', () => {
  const h = createHarness(items('a', 'b', 'c', 'd', 'g', 'e', 'f', 'h'), reference('g'));
  h.layout();
  h.scroll(250);
  h.clear();
  h.update(items('g', 'a', 'b', 'c', 'd', 'e', 'f', 'h'));
  h.commitList();
  h.flushFrames();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].offset, 12);
});

test('when the selected point is absent from the new viewport the list falls back to the first item', () => {
  const h = createHarness(items('a', 'b', 'c', 'd', 'e', 'f'), reference('c'));
  h.layout();
  h.scroll(180);
  h.clear();
  h.update(items('d', 'e', 'f', 'g'));
  h.commitList();
  h.flushFrames();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].offset, 0);
});

test('a list update never takes over while the user is dragging the pictures', () => {
  const h = createHarness(items('a', 'b', 'c', 'd', 'g', 'e', 'f', 'h'), reference('g'));
  h.layout();
  h.scroll(250);
  h.beginDrag();
  h.clear();
  h.update(items('a', 'b', 'c', 'd', 'e', 'f', 'h', 'g'));
  h.commitList();
  h.flushFrames();
  assert.deepEqual(h.calls, []);
  h.endDrag(300);
  h.commitList();
  h.flushFrames();
  assert.deepEqual(h.calls, [], 'ending a manual drag does not pull the selection back');
});

test('matching point IDs from another work do not count as the current selection', () => {
  const h = createHarness(items('a', 'b', 'c', 'd', 'e', 'f'), reference('c'));
  h.layout();
  h.scroll(180);
  h.clear();
  h.update([makeItem('c', 20), ...items('a', 'b', 'd', 'e')]);
  h.commitList();
  h.flushFrames();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].offset, 0, 'point identity includes both the work and the point');
});

test('a delayed layout callback cannot override a user drag that began meanwhile', () => {
  const h = createHarness(items('a', 'b', 'c', 'd', 'g', 'e', 'f', 'h'), reference('g'));
  h.layout();
  h.scroll(250);
  h.update(items('a', 'b', 'c', 'd', 'e', 'f', 'h', 'g'));
  const oldCommit = h.list.props.onCommitLayoutEffect;
  h.beginDrag();
  h.clear();
  oldCommit?.();
  h.flushFrames();
  assert.deepEqual(h.calls, []);
});

test('without a selected point a new viewport returns to the nearest item', () => {
  const h = createHarness(items('a', 'b', 'c', 'd', 'e', 'f'));
  h.layout();
  h.scroll(180);
  h.clear();
  h.update(items('b', 'a', 'c', 'd', 'e', 'f'));
  h.commitList();
  h.flushFrames();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].offset, 0);
});

test('an expanded list waits for a large enough native content size before revealing its selection', () => {
  const h = createHarness(items('a', 'b', 'c', 'd', 'e'), reference('c'));
  h.layout();
  h.scroll(100);
  h.clear();
  h.update(items('a', 'b', 'd', 'e', 'f', 'g', 'h', 'i', 'c'));
  h.commitList();
  h.flushFrames();
  assert.deepEqual(h.calls, [], 'an offset beyond the old native content would be clamped');
  h.content(9 * 86 + 18);
  h.flushFrames();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].offset, 530);
});

test('a user drag takes priority over a deferred native content-size update', () => {
  const h = createHarness(items('a', 'b', 'c', 'd', 'e'), reference('c'));
  h.layout();
  h.scroll(100);
  h.clear();
  h.update(items('a', 'b', 'd', 'e', 'f', 'g', 'h', 'i', 'c'));
  h.commitList();
  h.beginDrag();
  h.content(9 * 86 + 18);
  h.flushFrames();
  assert.deepEqual(h.calls, []);
  h.endDrag(150);
  h.commitList();
  h.flushFrames();
  assert.deepEqual(h.calls, []);
});

test('a deferred content update cannot override a drag that already finished', () => {
  const h = createHarness(items('a', 'b', 'c', 'd', 'e'), reference('c'));
  h.layout();
  h.scroll(100);
  h.clear();
  h.update(items('a', 'b', 'd', 'e', 'f', 'g', 'h', 'i', 'c'));
  h.commitList();
  h.beginDrag();
  h.endDrag(150);
  h.content(9 * 86 + 18);
  h.commitList();
  assert.deepEqual(h.calls, [], 'once the user dragged, the old pending correction stays cancelled');
});

test('a pending correction is cancelled when the picture list starts momentum scrolling', () => {
  const h = createHarness(items('a', 'b', 'c', 'd', 'e'), reference('c'));
  h.layout();
  h.scroll(100);
  h.clear();
  h.update(items('a', 'b', 'd', 'e', 'f', 'g', 'h', 'i', 'c'));
  h.commitList();
  h.beginMomentum();
  h.endMomentum();
  h.content(9 * 86 + 18);
  h.commitList();
  assert.deepEqual(h.calls, [], 'a completed fling also cancels the pending correction');
});

test('a later viewport or filter change supersedes a deferred scroll to an old ordering', () => {
  const h = createHarness(items('a', 'b', 'c', 'd', 'e'), reference('c'));
  h.layout();
  h.scroll(100);
  h.clear();
  h.update(items('a', 'b', 'd', 'e', 'f', 'g', 'h', 'i', 'c'));
  h.commitList();
  const oldContentChange = h.list.props.onContentSizeChange;
  assert.deepEqual(h.calls, []);
  h.update(items('a', 'b', 'c', 'd', 'f'));
  h.commitList();
  oldContentChange?.(9 * 86 + 18, 54);
  h.flushFrames();
  assert.deepEqual(h.calls, [], 'an old content-size event cannot restore an obsolete list order');
});

test('a stale larger content event cannot make a newer expanded list scroll before native layout is ready', () => {
  const h = createHarness(items('a', 'b', 'c', 'd', 'e'), reference('c'));
  h.layout();
  h.scroll(100);
  const staleContentChange = h.list.props.onContentSizeChange;
  h.clear();
  h.update(items('a', 'b', 'd', 'e', 'f', 'g', 'h', 'i', 'c'));
  h.commitList();
  staleContentChange?.(9 * 86 + 18, 54);
  h.commitList();
  assert.deepEqual(h.calls, [], 'the old callback cannot report the new content as ready');
  h.content(9 * 86 + 18);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].offset, 530);
});

test('a stale smaller content event cannot prevent a later valid visibility adjustment', () => {
  const h = createHarness(items('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'), reference('c'));
  h.layout();
  h.scroll(100);
  const staleContentChange = h.list.props.onContentSizeChange;
  h.clear();
  h.update(items('a', 'b', 'c', 'd', 'f', 'e', 'g', 'h', 'i'));
  h.commitList();
  staleContentChange?.(5 * 86 + 18, 54);
  h.update(items('a', 'b', 'd', 'e', 'f', 'g', 'h', 'i', 'c'));
  h.commitList();
  assert.equal(h.calls.length, 1, 'stale dimensions must not hide the usable current native content');
  assert.equal(h.calls[0].offset, 530);
});
