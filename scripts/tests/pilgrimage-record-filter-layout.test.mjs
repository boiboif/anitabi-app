import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { jsx as reactJsx, jsxs as reactJsxs } from 'react/jsx-runtime';
import ts from 'typescript';

function loadSource(path, modules) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: false,
    },
  }).outputText;
  const context = vm.createContext({
    exports: {},
    console: modules.console ?? console,
    require(name) {
      assert.ok(name in modules, `unexpected import: ${name}`);
      return modules[name];
    },
  });
  vm.runInContext(compiled, context);
  return context.exports;
}

// React SSR supplies real context ancestry. Native views and hook state are stubbed;
// this verifies JS context, back subscriptions and lifecycle callbacks. Native
// sheet animation, system back dispatch and scrolling gestures still need device testing.
function createHarness() {
  const ScrollContext = React.createContext(null);
  const HeaderContext = React.createContext(false);
  const SheetPartContext = React.createContext(null);
  const PeekContext = React.createContext(false);
  const wrappers = new WeakMap();
  const frames = new Set();
  const observed = [];
  const backListeners = [];
  const pendingContentMounts = new Set();
  const pendingPresentations = new Set();
  const presentationRequests = [];
  const errors = [];
  const pendingEffects = [];
  let active;
  let dismissCalls = 0;
  const resizeCalls = [];
  let filteredRange;
  let pagePops = 0;
  let navigationDispatches = 0;
  let preventRemove;
  let renderVersion = 0;
  const sameDeps = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const points = [
    { key: '1:a', bangumiId: 1, snapshot: { bangumiName: 'First work' }, days: [{}] },
    { key: '2:b', bangumiId: 2, snapshot: { bangumiName: 'Second work' }, days: [{}] },
  ];
  const state = { points, loadError: null };
  const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((done, fail) => {
      resolve = done;
      reject = fail;
    });
    return { promise, resolve, reject };
  };
  const react = {
    useState(initial) {
      const frame = active;
      const index = frame.cursor++;
      if (!(index in frame.slots)) frame.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        frame.slots[index],
        (next) => {
          frame.slots[index] = typeof next === 'function' ? next(frame.slots[index]) : next;
        },
      ];
    },
    useRef(current) {
      const index = active.cursor++;
      return (active.slots[index] ??= { current });
    },
    useCallback(callback, deps) {
      const index = active.cursor++;
      if (!sameDeps(active.slots[index]?.deps, deps)) active.slots[index] = { value: callback, deps };
      return active.slots[index].value;
    },
    useEffect(run, deps) {
      const index = active.cursor++;
      const frame = active;
      if (!sameDeps(frame.slots[index]?.deps, deps)) {
        pendingEffects.push(() => {
          frame.slots[index]?.cleanup?.();
          frame.slots[index] = { deps, cleanup: run() };
        });
      }
    },
  };
  function tracked(type, key) {
    if (typeof type !== 'function') return type;
    if (!wrappers.has(type)) wrappers.set(type, new Map());
    const keyed = wrappers.get(type);
    const ownerKey = `${active?.id ?? 'root'}:${key ?? ''}`;
    if (!keyed.has(ownerKey)) {
      const frame = { id: frames.size, slots: [], cursor: 0, seen: 0, mounted: false };
      frames.add(frame);
      keyed.set(ownerKey, (props) => {
        const previous = active;
        frame.cursor = 0;
        frame.seen = renderVersion;
        frame.mounted = true;
        active = frame;
        try {
          return type(props);
        } finally {
          active = previous;
        }
      });
    }
    return keyed.get(ownerKey);
  }
  const jsx = (type, props, key) => reactJsx(tracked(type, key), props, key);
  const jsxs = (type, props, key) => reactJsxs(tracked(type, key), props, key);
  function observe(kind, props) {
    const entry = {
      kind,
      props,
      scrollContext: React.useContext(ScrollContext),
      inHeader: React.useContext(HeaderContext),
      sheetPart: React.useContext(SheetPartContext),
      inPeek: React.useContext(PeekContext),
    };
    observed.push(entry);
    return entry;
  }
  const ui = (kind) => (props) => {
    observe(kind, props);
    return React.createElement('div', null, props.children);
  };
  const nativeList = (kind) => (props) => {
    observe(kind, props);
    const header = React.createElement(HeaderContext.Provider, { value: true }, props.ListHeaderComponent);
    const rows = props.data.map((item, index) =>
      React.createElement(React.Fragment, { key: item.id ?? item.key }, props.renderItem({ item, index })),
    );
    return React.createElement(
      ScrollContext.Provider,
      { value: { horizontal: false } },
      header,
      rows,
      props.data.length ? null : props.ListEmptyComponent,
    );
  };
  function TrueSheet(props) {
    observe('TrueSheet', props);
    const instanceRef = react.useRef(null);
    if (!instanceRef.current) {
      const instance = {
        props,
        mounted: true,
        contentMounted: false,
        native: {
          async present(index = 0, animated = true) {
            const request = { instance, index, animated, mount: deferred(), animation: deferred(), started: false };
            presentationRequests.push(request);
            pendingContentMounts.add(request);
            // The real ref method waits for native onMount before presentByRef.
            // Keep that readiness separate from the animation's onDidPresent.
            await request.mount.promise;
            request.started = true;
            pendingPresentations.add(request);
            await request.animation.promise;
          },
          dismiss: () => dismissCalls++,
          resize: (...args) => {
            resizeCalls.push(args);
            return Promise.resolve();
          },
        },
      };
      instanceRef.current = instance;
    }
    const instance = instanceRef.current;
    instance.props = props;
    props.ref.current = instance.native;
    react.useEffect(() => {
      if (props.initialDetentIndex !== undefined && props.initialDetentIndex >= 0) {
        pendingPresentations.add({ instance, auto: true });
      }
      return () => {
        instance.mounted = false;
        for (const request of pendingContentMounts) {
          if (request.instance === instance) pendingContentMounts.delete(request);
        }
        for (const request of pendingPresentations) {
          if (request.instance === instance) pendingPresentations.delete(request);
        }
        if (props.ref.current === instance.native) props.ref.current = null;
      };
    }, []);
    // Native reparenting changes the view parent, not the React context parent.
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(SheetPartContext.Provider, { value: 'header' }, props.header),
      React.createElement(SheetPartContext.Provider, { value: 'content' }, props.children),
      React.createElement(SheetPartContext.Provider, { value: 'footer' }, props.footer),
    );
  }
  function TrueSheetPeek(props) {
    observe('Peek', props);
    return React.createElement(PeekContext.Provider, { value: true }, props.children);
  }
  function Calendar(props) {
    const mount = react.useRef({});
    observe('Calendar', { ...props, mount: mount.current });
    return null;
  }
  const theme = Object.fromEntries(['primary', 'color2', 'pageBackground'].map((key) => [key, { val: '#fff' }]));
  const navigation = {
    addListener: () => () => {},
    dispatch() {
      navigationDispatches++;
      pagePops++;
    },
  };
  const modules = {
    console: { error: (...args) => errors.push(args) },
    react,
    'react/jsx-runtime': { jsx, jsxs, Fragment: React.Fragment },
    'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
    'expo-router': {
      useIsFocused: () => true,
      useNavigation: () => navigation,
      useRouter: () => ({ push() {} }),
      usePreventRemove(enabled, callback) {
        react.useEffect(() => {
          if (!enabled) return;
          preventRemove = callback;
          return () => {
            if (preventRemove === callback) preventRemove = undefined;
          };
        }, [enabled, callback]);
      },
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    'react-native': {
      FlatList: nativeList('FlatList'),
      Pressable: ui('Pressable'),
      Platform: { OS: 'android' },
      BackHandler: {
        addEventListener(event, handler) {
          assert.equal(event, 'hardwareBackPress');
          backListeners.push(handler);
          return { remove: () => backListeners.splice(backListeners.indexOf(handler), 1) };
        },
      },
      Keyboard: { dismiss() {} },
      useWindowDimensions: () => ({ height: 800, fontScale: 1 }),
    },
    'react-native-gesture-handler': { GestureHandlerRootView: ui('GestureRoot'), ScrollView: ui('ScrollView') },
    '@lodev09/react-native-true-sheet': { TrueSheet, TrueSheetPeek },
    '@shopify/flash-list': { FlashList: nativeList('FlashList') },
    '@tamagui/lucide-icons-2': Object.fromEntries(
      ['Check', 'ChevronDown', 'Square', 'SquareCheckBig', 'X', 'CalendarDays'].map((key) => [key, ui(key)]),
    ),
    tamagui: { Text: ui('Text'), XStack: ui('XStack'), YStack: ui('YStack'), View: ui('View'), useTheme: () => theme },
    '@/components/ui/strict-button': { StrictButton: ui('Button') },
    '@/components/ui/theme-choice-chip': { ThemeChoiceChip: ui('ChoiceChip') },
    '@/components/ui/theme-input': { ThemeInput: ui('Input') },
    '@/components/pilgrimage-records/record-date-calendar': { RecordDateCalendar: Calendar },
    '@/components/pilgrimage-records/record-point-card': { RecordPointCard: ui('PointCard') },
    '@/components/ui/card-list-item': { default: ui('CardListItem') },
    '@/lib/pilgrimage-record-filter': { getPilgrimagePresetRange: () => ({ startDate: '', endDate: '' }) },
    '@/lib/pilgrimage-record-query': {
      isPilgrimageDateRangeValid: () => true,
      queryPilgrimagePoints: (data, range, bangumiIds) => {
        filteredRange = range;
        return data.filter((point) => !bangumiIds.length || bangumiIds.includes(String(point.bangumiId)));
      },
    },
    '@/store/use-pilgrimage-records': { usePilgrimageRecords: (select) => select(state) },
    '@/tamagui.config': { MaxContentWidth: 768, PageHorizontalInset: 12 },
  };
  modules['@/components/pilgrimage-records/record-filters'] = loadSource(
    '../../src/components/pilgrimage-records/record-filters.tsx',
    modules,
  );
  const Screen = loadSource('../../src/app/pilgrimage-records/index.tsx', modules).default;
  function render() {
    observed.length = 0;
    renderVersion++;
    renderToStaticMarkup(jsx(Screen, {}));
    for (const frame of frames) {
      if (frame.mounted && frame.seen !== renderVersion) {
        for (const slot of frame.slots) slot?.cleanup?.();
        frame.mounted = false;
      }
    }
    while (pendingEffects.length) pendingEffects.shift()();
    return observed;
  }
  function requestPop() {
    if (preventRemove) preventRemove({ data: { action: { type: 'POP' } } });
    else pagePops++;
  }
  function button(key) {
    return observed.find((entry) => entry.kind === 'Button' && entry.props.accessibilityLabel?.startsWith(key));
  }
  function actionButton(key) {
    const button = observed.find(
      (entry) =>
        entry.kind === 'Button' &&
        React.isValidElement(entry.props.children) &&
        entry.props.children.props.children === key,
    );
    assert.ok(button, `sheet action button exists: ${key}`);
    return button;
  }
  function bangumiRow(label) {
    const row = observed.find((entry) => entry.props.accessibilityLabel === label);
    assert.ok(row, `bangumi option exists: ${label}`);
    return row;
  }
  function choiceChip(label) {
    const chip = observed.find((entry) => entry.kind === 'ChoiceChip' && entry.props.label === label);
    assert.ok(chip, `date preset exists: ${label}`);
    return chip;
  }
  function recordKeys() {
    return Array.from(observed.find((entry) => entry.kind === 'FlashList').props.data, (point) => point.key);
  }
  function calendar() {
    const calendar = observed.find((entry) => entry.kind === 'Calendar');
    assert.ok(calendar, 'the date calendar remains mounted in both detents');
    return calendar;
  }
  function assertCalendarExpanded(expanded) {
    const wrapper = observed.find(
      (entry) => entry.kind === 'YStack' && entry.props.accessibilityElementsHidden !== undefined,
    );
    assert.ok(wrapper, 'calendar visibility has an accessibility boundary');
    assert.equal(wrapper.props.pointerEvents, expanded ? 'auto' : 'none');
    assert.equal(wrapper.props.accessibilityElementsHidden, !expanded);
    assert.equal(wrapper.props.importantForAccessibility, expanded ? 'auto' : 'no-hide-descendants');
  }
  async function mountContent() {
    for (const request of pendingContentMounts) {
      pendingContentMounts.delete(request);
      request.instance.contentMounted = true;
      request.mount.resolve();
    }
    await Promise.resolve();
  }
  function completePresentation(request) {
    pendingPresentations.delete(request);
    // A removed native host can no longer receive React Native lifecycle events.
    if (request.instance.mounted) {
      request.instance.props.onDidPresent?.({
        nativeEvent: { index: request.index ?? request.instance.props.initialDetentIndex ?? 0 },
      });
    }
    request.animation?.resolve();
  }
  return {
    render,
    button,
    actionButton,
    bangumiRow,
    choiceChip,
    recordKeys,
    calendar,
    assertCalendarExpanded,
    observed,
    mountContent,
    completePresentation,
    detent(index) {
      const sheet = observed.find((entry) => entry.kind === 'TrueSheet');
      assert.ok(sheet, 'a mounted sheet receives detent changes');
      sheet.props.onDetentChange?.({ nativeEvent: { index } });
    },
    async failPresentation(request, error) {
      assert.equal(request.started, true, 'only an issued native command can fail');
      pendingPresentations.delete(request);
      request.animation.reject(error);
      await Promise.resolve();
      await Promise.resolve();
    },
    async present() {
      await mountContent();
      for (const request of pendingPresentations) completePresentation(request);
      await Promise.resolve();
    },
    back() {
      for (const listener of [...backListeners].reverse()) if (listener()) return;
      requestPop();
    },
    requestPop,
    get pendingPresentations() {
      return pendingPresentations.size;
    },
    get pendingContentMounts() {
      return pendingContentMounts.size;
    },
    get presentationRequests() {
      return presentationRequests;
    },
    get errors() {
      return errors;
    },
    get guarded() {
      return !!preventRemove;
    },
    get backListenerCount() {
      return backListeners.length;
    },
    get pagePops() {
      return pagePops;
    },
    get navigationDispatches() {
      return navigationDispatches;
    },
    get dismissCalls() {
      return dismissCalls;
    },
    get resizeCalls() {
      return resizeCalls;
    },
    get filteredRange() {
      return filteredRange;
    },
  };
}
test('opening the bangumi filter keeps its virtual list outside the record list scroll context', async () => {
  const harness = createHarness();
  harness.render();
  const open = harness.button('pilgrimageRecordsBangumiFilter');
  assert.ok(open.inHeader, 'filter trigger stays in the scrolling list header');
  assert.equal(open.scrollContext.horizontal, false, 'header inherits the main list scroll context');
  open.props.onPress();
  harness.render();
  const sheet = harness.observed.find((entry) => entry.kind === 'TrueSheet');
  const list = harness.observed.find((entry) => entry.kind === 'FlatList');
  assert.ok(sheet, 'opening the filter mounts TrueSheet');
  await harness.present();
  assert.equal(sheet.scrollContext, null, 'native sheet has no ancestor main-list scroll context');
  assert.equal(list.scrollContext, null, 'the sheet list cannot trigger the nested VirtualizedList warning');
  assert.equal(list.inHeader, false);
  assert.equal(sheet.props.scrollable, true, 'the long bangumi list keeps native scroll coordination');
  assert.ok(sheet.props.footer, 'the long bangumi list retains its fixed native actions');
  assert.equal(harness.actionButton('pilgrimageRecordsFilterReset').sheetPart, 'footer');
  assert.equal(harness.actionButton('pilgrimageRecordsFilterConfirm').sheetPart, 'footer');
  assert.deepEqual(
    Array.from(list.props.data, (option) => option.name),
    ['First work', 'Second work'],
  );
  assert.ok(harness.button('pilgrimageRecordsBangumiFilter').inHeader);

  harness.observed.find((entry) => entry.props.accessibilityLabel === 'Second work').props.onPress();
  harness.render();
  harness.actionButton('pilgrimageRecordsFilterConfirm').props.onPress();
  harness.render();
  assert.equal(harness.dismissCalls, 1);
  const recordList = harness.observed.find((entry) => entry.kind === 'FlashList');
  assert.deepEqual(
    Array.from(recordList.props.data, (point) => point.key),
    ['2:b'],
  );
  assert.ok(harness.button('pilgrimageRecordsBangumiFilter').props.accessibilityLabel.endsWith('Second work'));

  harness.observed.find((entry) => entry.kind === 'TrueSheet').props.onDidDismiss();
  harness.render();
  harness.button('pilgrimageRecordsBangumiFilter').props.onPress();
  harness.render();
  await harness.present();
  harness.observed.find((entry) => entry.props.accessibilityLabel === 'First work').props.onPress();
  harness.render();
  harness.button('pilgrimageRecordsFilterClose').props.onPress();
  assert.equal(harness.dismissCalls, 2);
  harness.observed.find((entry) => entry.kind === 'TrueSheet').props.onDidDismiss();
  harness.render();
  assert.equal(
    harness.observed.some((entry) => entry.kind === 'TrueSheet'),
    false,
  );
  assert.deepEqual(
    Array.from(harness.observed.find((entry) => entry.kind === 'FlashList').props.data, (point) => point.key),
    ['2:b'],
    'closing the sheet discards the unconfirmed selection',
  );
});
test('bangumi multi-selection survives search and confirms all selected works', async () => {
  const harness = createHarness();
  harness.render();
  harness.button('pilgrimageRecordsBangumiFilter').props.onPress();
  harness.render();
  await harness.present();

  assert.equal(harness.bangumiRow('First work').props.accessibilityRole, 'checkbox');
  assert.equal(harness.bangumiRow('First work').props.accessibilityState.checked, false);
  harness.bangumiRow('First work').props.onPress();
  harness.render();
  assert.equal(harness.bangumiRow('First work').props.accessibilityState.checked, true);
  assert.equal(harness.bangumiRow('Second work').props.accessibilityState.checked, false);
  assert.equal(harness.bangumiRow('pilgrimageRecordsAllBangumi').props.accessibilityState.checked, false);

  harness.observed.find((entry) => entry.kind === 'Input').props.onChangeText('Second');
  harness.render();
  assert.deepEqual(
    Array.from(harness.observed.find((entry) => entry.kind === 'FlatList').props.data, (option) => option.name),
    ['Second work'],
  );
  harness.bangumiRow('Second work').props.onPress();
  harness.render();
  harness.observed.find((entry) => entry.kind === 'Input').props.onChangeText('');
  harness.render();
  assert.equal(harness.bangumiRow('First work').props.accessibilityState.checked, true);
  assert.equal(harness.bangumiRow('Second work').props.accessibilityState.checked, true);

  harness.actionButton('pilgrimageRecordsFilterConfirm').props.onPress();
  harness.render();
  harness.observed.find((entry) => entry.kind === 'TrueSheet').props.onDidDismiss();
  harness.render();
  assert.deepEqual(harness.recordKeys(), ['1:a', '2:b']);

  harness.button('pilgrimageRecordsBangumiFilter').props.onPress();
  harness.render();
  await harness.present();
  assert.equal(harness.bangumiRow('First work').props.accessibilityState.checked, true);
  assert.equal(harness.bangumiRow('Second work').props.accessibilityState.checked, true);
  harness.bangumiRow('First work').props.onPress();
  harness.render();
  assert.equal(harness.bangumiRow('First work').props.accessibilityState.checked, false);
  assert.equal(harness.bangumiRow('Second work').props.accessibilityState.checked, true);
  assert.deepEqual(harness.recordKeys(), ['1:a', '2:b'], 'draft changes do not filter records until confirmed');
  harness.actionButton('pilgrimageRecordsFilterConfirm').props.onPress();
  harness.render();
  assert.deepEqual(harness.recordKeys(), ['2:b']);
});
test('bangumi reset stays in the draft and confirming all bangumi removes the selection', async () => {
  const harness = createHarness();
  harness.render();
  harness.button('pilgrimageRecordsBangumiFilter').props.onPress();
  harness.render();
  await harness.present();
  harness.bangumiRow('Second work').props.onPress();
  harness.render();
  harness.actionButton('pilgrimageRecordsFilterConfirm').props.onPress();
  harness.render();
  harness.observed.find((entry) => entry.kind === 'TrueSheet').props.onDidDismiss();
  harness.render();
  assert.deepEqual(harness.recordKeys(), ['2:b']);

  harness.button('pilgrimageRecordsBangumiFilter').props.onPress();
  harness.render();
  await harness.present();
  harness.actionButton('pilgrimageRecordsFilterReset').props.onPress();
  harness.render();
  assert.equal(harness.bangumiRow('Second work').props.accessibilityState.checked, false);
  assert.equal(harness.bangumiRow('pilgrimageRecordsAllBangumi').props.accessibilityState.checked, true);
  assert.deepEqual(harness.recordKeys(), ['2:b']);
  harness.button('pilgrimageRecordsFilterClose').props.onPress();
  harness.observed.find((entry) => entry.kind === 'TrueSheet').props.onDidDismiss();
  harness.render();
  assert.deepEqual(harness.recordKeys(), ['2:b'], 'cancel discards the draft reset');

  harness.button('pilgrimageRecordsBangumiFilter').props.onPress();
  harness.render();
  await harness.present();
  assert.equal(harness.bangumiRow('Second work').props.accessibilityState.checked, true);
  harness.bangumiRow('First work').props.onPress();
  harness.render();
  harness.bangumiRow('pilgrimageRecordsAllBangumi').props.onPress();
  harness.render();
  assert.equal(harness.bangumiRow('First work').props.accessibilityState.checked, false);
  assert.equal(harness.bangumiRow('Second work').props.accessibilityState.checked, false);
  assert.equal(harness.bangumiRow('pilgrimageRecordsAllBangumi').props.accessibilityState.checked, true);
  harness.actionButton('pilgrimageRecordsFilterConfirm').props.onPress();
  harness.render();
  assert.deepEqual(harness.recordKeys(), ['1:a', '2:b']);
  assert.equal(
    harness.button('pilgrimageRecordsBangumiFilter').props.accessibilityLabel.endsWith('pilgrimageRecordsAllBangumi'),
    true,
  );
});
test('unchecking the last bangumi restores the unrestricted draft', async () => {
  const harness = createHarness();
  harness.render();
  harness.button('pilgrimageRecordsBangumiFilter').props.onPress();
  harness.render();
  await harness.present();
  harness.bangumiRow('First work').props.onPress();
  harness.render();
  harness.bangumiRow('First work').props.onPress();
  harness.render();
  assert.equal(harness.bangumiRow('First work').props.accessibilityState.checked, false);
  assert.equal(harness.bangumiRow('pilgrimageRecordsAllBangumi').props.accessibilityState.checked, true);
  harness.actionButton('pilgrimageRecordsFilterConfirm').props.onPress();
  harness.render();
  assert.deepEqual(harness.recordKeys(), ['1:a', '2:b']);
});
test('date presets resize between peek and auto without unmounting the calendar', async () => {
  const harness = createHarness();
  harness.render();
  harness.button('pilgrimageRecordsDateFilter').props.onPress();
  harness.render();
  await harness.present();
  harness.render();

  function assertDateStructure() {
    const sheet = harness.observed.find((entry) => entry.kind === 'TrueSheet');
    assert.deepEqual(Array.from(sheet.props.detents), ['peek', 'auto']);
    assert.equal(sheet.props.dimmedDetentIndex, 0, 'the quick-preset detent keeps the backdrop dimmed');
    assert.equal(sheet.props.scrollable, false);
    assert.ok(sheet.props.footer, 'actions use the same native footer at both detents');
    assert.equal(harness.actionButton('pilgrimageRecordsFilterReset').sheetPart, 'footer');
    assert.equal(harness.actionButton('pilgrimageRecordsFilterConfirm').sheetPart, 'footer');
    assert.equal(harness.choiceChip('pilgrimageRecordsFilterDateAll').inPeek, true);
    assert.equal(harness.calendar().inPeek, false, 'the larger detent includes the calendar below the peek boundary');
    assert.equal(
      harness.observed.some((entry) => ['GestureRoot', 'ScrollView', 'FlatList'].includes(entry.kind)),
      false,
      'date detents measure normal non-scrolling content',
    );
  }

  assertDateStructure();
  const calendarMount = harness.calendar().props.mount;
  harness.assertCalendarExpanded(false);
  assert.deepEqual(harness.resizeCalls, []);
  harness.choiceChip('pilgrimageRecordsFilterDateLast7').props.onPress();
  harness.render();
  assertDateStructure();
  assert.equal(harness.choiceChip('pilgrimageRecordsFilterDateLast7').props.selected, true);
  assert.deepEqual(harness.resizeCalls, [[0]]);
  assert.equal(harness.calendar().props.mount, calendarMount);
  assert.equal(
    harness.button('pilgrimageRecordsDateFilter').props.accessibilityLabel.endsWith('pilgrimageRecordsFilterDateAll'),
    true,
    'choosing a quick preset only changes the draft',
  );

  harness.choiceChip('pilgrimageRecordsFilterDateCustom').props.onPress();
  harness.render();
  assertDateStructure();
  assert.deepEqual(harness.resizeCalls, [[0], [1]]);
  harness.assertCalendarExpanded(false);
  harness.detent(1);
  harness.render();
  harness.assertCalendarExpanded(true);
  assert.equal(harness.calendar().props.mount, calendarMount);
  assert.equal(harness.actionButton('pilgrimageRecordsFilterConfirm').props.disabled, true);
  harness.calendar().props.onChange({ startDate: '2026-10-01', endDate: '2026-10-23' });
  harness.render();
  assert.equal(harness.actionButton('pilgrimageRecordsFilterConfirm').props.disabled, false);
  assert.deepEqual({ ...harness.filteredRange }, { startDate: '', endDate: '' });

  harness.actionButton('pilgrimageRecordsFilterReset').props.onPress();
  harness.render();
  assertDateStructure();
  assert.deepEqual(harness.resizeCalls, [[0], [1], [0]]);
  harness.detent(0);
  harness.render();
  harness.assertCalendarExpanded(false);
  assert.equal(harness.choiceChip('pilgrimageRecordsFilterDateAll').props.selected, true);
  assert.equal(harness.calendar().props.mount, calendarMount);
  assert.equal(harness.actionButton('pilgrimageRecordsFilterConfirm').props.disabled, false);
  assert.equal(harness.dismissCalls, 0, 'reset keeps the short form open without committing');
});
test('date footer confirms complete ranges, saved custom opens expanded and cancelling retains the saved range', async () => {
  const harness = createHarness();
  harness.render();
  harness.button('pilgrimageRecordsDateFilter').props.onPress();
  harness.render();
  await harness.present();
  harness.choiceChip('pilgrimageRecordsFilterDateCustom').props.onPress();
  harness.render();
  harness.detent(1);
  harness.render();

  const selectedRange = { startDate: '2026-10-01', endDate: '2026-10-23' };
  harness.observed.find((entry) => entry.kind === 'Calendar').props.onChange({ ...selectedRange, endDate: '' });
  harness.render();
  harness.actionButton('pilgrimageRecordsFilterConfirm').props.onPress();
  harness.render();
  assert.equal(harness.dismissCalls, 0, 'an incomplete custom range cannot be committed');
  assert.deepEqual({ ...harness.filteredRange }, { startDate: '', endDate: '' });

  harness.observed.find((entry) => entry.kind === 'Calendar').props.onChange(selectedRange);
  harness.render();
  harness.actionButton('pilgrimageRecordsFilterConfirm').props.onPress();
  harness.render();
  assert.equal(harness.dismissCalls, 1);
  assert.equal(harness.presentationRequests.length, 1, 'confirming a changed parent preset must not present again');
  assert.deepEqual({ ...harness.filteredRange }, selectedRange);
  harness.observed.find((entry) => entry.kind === 'TrueSheet').props.onDidDismiss();
  harness.render();

  harness.button('pilgrimageRecordsDateFilter').props.onPress();
  harness.render();
  assert.equal(harness.presentationRequests[1].index, 1, 'a saved custom filter opens at the calendar detent');
  await harness.present();
  harness.render();
  harness.assertCalendarExpanded(true);
  assert.deepEqual({ ...harness.observed.find((entry) => entry.kind === 'Calendar').props.range }, selectedRange);
  harness.actionButton('pilgrimageRecordsFilterReset').props.onPress();
  harness.render();
  harness.detent(0);
  harness.render();
  harness.assertCalendarExpanded(false);
  assert.ok(harness.calendar());
  assert.deepEqual({ ...harness.filteredRange }, selectedRange, 'reset remains a draft until confirmed');
  harness.back();
  harness.render();
  harness.observed.find((entry) => entry.kind === 'TrueSheet').props.onDidDismiss();
  harness.render();
  assert.equal(harness.pagePops, 0);
  assert.deepEqual({ ...harness.filteredRange }, selectedRange, 'back discards the draft reset');

  harness.button('pilgrimageRecordsDateFilter').props.onPress();
  harness.render();
  assert.equal(harness.presentationRequests[2].index, 1, 'cancelling reset preserves the saved custom opening detent');
  await harness.present();
  assert.deepEqual({ ...harness.observed.find((entry) => entry.kind === 'Calendar').props.range }, selectedRange);
  harness.actionButton('pilgrimageRecordsFilterReset').props.onPress();
  harness.render();
  harness.actionButton('pilgrimageRecordsFilterConfirm').props.onPress();
  harness.render();
  assert.equal(harness.presentationRequests.length, 3, 'confirming reset does not re-run the opening effect');
  assert.deepEqual({ ...harness.filteredRange }, { startDate: '', endDate: '' });
  assert.equal(
    harness.button('pilgrimageRecordsDateFilter').props.accessibilityLabel.endsWith('pilgrimageRecordsFilterDateAll'),
    true,
    'confirming reset removes the saved time filter',
  );
});

test('native collapse preserves an incomplete custom draft and never commits or changes its preset', async () => {
  const harness = createHarness();
  harness.render();
  harness.button('pilgrimageRecordsDateFilter').props.onPress();
  harness.render();
  await harness.present();
  harness.choiceChip('pilgrimageRecordsFilterDateCustom').props.onPress();
  harness.render();
  harness.detent(1);
  harness.render();
  const mount = harness.calendar().props.mount;
  const partial = { startDate: '2026-10-01', endDate: '' };
  harness.calendar().props.onChange(partial);
  harness.render();
  const requestedResizes = harness.resizeCalls.length;

  harness.detent(0);
  harness.render();
  harness.assertCalendarExpanded(false);
  assert.equal(harness.choiceChip('pilgrimageRecordsFilterDateCustom').props.selected, true);
  assert.deepEqual({ ...harness.calendar().props.range }, partial);
  assert.equal(harness.calendar().props.mount, mount);
  assert.equal(harness.actionButton('pilgrimageRecordsFilterConfirm').props.disabled, true);
  harness.actionButton('pilgrimageRecordsFilterConfirm').props.onPress();
  harness.render();
  assert.deepEqual({ ...harness.filteredRange }, { startDate: '', endDate: '' });
  assert.equal(harness.dismissCalls, 0);
  assert.equal(harness.presentationRequests.length, 1);
  assert.equal(
    harness.resizeCalls.length,
    requestedResizes,
    'native position events update visibility without requesting another resize',
  );

  harness.detent(1);
  harness.render();
  harness.assertCalendarExpanded(true);
  assert.equal(harness.calendar().props.mount, mount);
  assert.deepEqual({ ...harness.calendar().props.range }, partial);
  assert.equal(harness.choiceChip('pilgrimageRecordsFilterDateCustom').props.selected, true);
});

test('dragging open the calendar keeps the quick preset until a calendar edit creates a custom draft', async () => {
  const harness = createHarness();
  harness.render();
  harness.button('pilgrimageRecordsDateFilter').props.onPress();
  harness.render();
  await harness.present();
  harness.choiceChip('pilgrimageRecordsFilterDateLast7').props.onPress();
  harness.render();
  const mount = harness.calendar().props.mount;

  harness.detent(1);
  harness.render();
  harness.assertCalendarExpanded(true);
  assert.equal(harness.choiceChip('pilgrimageRecordsFilterDateLast7').props.selected, true);
  assert.equal(harness.choiceChip('pilgrimageRecordsFilterDateCustom').props.selected, false);
  assert.deepEqual({ ...harness.filteredRange }, { startDate: '', endDate: '' });

  const selected = { startDate: '2026-10-01', endDate: '2026-10-23' };
  harness.calendar().props.onChange(selected);
  harness.render();
  assert.equal(harness.choiceChip('pilgrimageRecordsFilterDateCustom').props.selected, true);
  assert.equal(harness.choiceChip('pilgrimageRecordsFilterDateLast7').props.selected, false);
  assert.deepEqual({ ...harness.calendar().props.range }, selected);
  assert.equal(harness.calendar().props.mount, mount);
  assert.equal(harness.actionButton('pilgrimageRecordsFilterConfirm').props.disabled, false);

  harness.detent(0);
  harness.render();
  harness.assertCalendarExpanded(false);
  assert.equal(harness.choiceChip('pilgrimageRecordsFilterDateCustom').props.selected, true);
  assert.deepEqual(
    { ...harness.filteredRange },
    { startDate: '', endDate: '' },
    'folding a complete draft does not commit it',
  );
  assert.equal(harness.actionButton('pilgrimageRecordsFilterConfirm').props.disabled, false);
  harness.actionButton('pilgrimageRecordsFilterConfirm').props.onPress();
  harness.render();
  assert.deepEqual({ ...harness.filteredRange }, selected);
  assert.equal(harness.presentationRequests.length, 1);
  assert.equal(harness.dismissCalls, 1);
});

for (const filter of ['pilgrimageRecordsBangumiFilter', 'pilgrimageRecordsDateFilter']) {
  test(`${filter}: measured native footer reserves matching bottom space in its content`, async () => {
    const harness = createHarness();
    harness.render();
    harness.button(filter).props.onPress();
    harness.render();
    await harness.present();
    harness.render();

    function measureFooter(height) {
      const footer = harness.observed.find(
        (entry) =>
          entry.kind === 'XStack' && entry.sheetPart === 'footer' && typeof entry.props.onLayout === 'function',
      );
      assert.ok(footer, 'the native footer reports its natural measured height');
      footer.props.onLayout({ nativeEvent: { layout: { height } } });
      harness.render();
      if (filter === 'pilgrimageRecordsBangumiFilter') {
        return harness.observed.find((entry) => entry.kind === 'FlatList').props.contentContainerStyle.paddingBottom;
      }
      const content = harness.observed.find(
        (entry) => entry.kind === 'YStack' && entry.sheetPart === 'content' && entry.props.pb >= height,
      );
      assert.ok(content, 'the complete date body reserves space under the measured native footer');
      return content.props.pb;
    }

    const firstPadding = measureFooter(72);
    const secondPadding = measureFooter(108);
    assert.ok(firstPadding >= 72);
    assert.ok(secondPadding >= 108);
    assert.equal(secondPadding - firstPadding, 36, 'content follows footer height instead of using a fixed estimate');
    assert.equal(harness.actionButton('pilgrimageRecordsFilterConfirm').sheetPart, 'footer');
    assert.equal(harness.dismissCalls, 0, 'footer measurement leaves the current draft open');
    assert.equal(harness.pagePops, 0);
  });
}

for (const filter of ['pilgrimageRecordsBangumiFilter', 'pilgrimageRecordsDateFilter']) {
  test(`${filter}: back during opening cancels the sheet without removing the page`, async () => {
    const harness = createHarness();
    harness.render();
    harness.button(filter).props.onPress();
    harness.render();
    assert.equal(harness.guarded, true);
    assert.equal(harness.backListenerCount, 1);
    assert.equal(harness.pendingContentMounts + harness.pendingPresentations, 1);

    harness.back();
    harness.render();
    assert.equal(harness.pagePops, 0);
    assert.equal(harness.dismissCalls, 0, 'an unpresented sheet is unmounted instead of dismissed');
    assert.equal(harness.pendingContentMounts, 0, 'unmount cancels a date sheet waiting for native content');
    assert.equal(harness.pendingPresentations, 0, 'unmount cancels a pending native presentation');
    await harness.present();
    assert.equal(
      harness.observed.some((entry) => entry.kind === 'TrueSheet'),
      false,
    );
    assert.equal(harness.guarded, false);
    assert.equal(harness.backListenerCount, 0);

    harness.back();
    assert.equal(harness.pagePops, 1, 'back navigates normally after sheet cancellation');
  });
}

for (const origin of ['hardware', 'native navigation']) {
  test(`${origin} back closes only the sheet and guards repeated back until didDismiss`, async () => {
    const harness = createHarness();
    harness.render();
    harness.button('pilgrimageRecordsBangumiFilter').props.onPress();
    harness.render();
    await harness.present();
    harness.observed.find((entry) => entry.props.accessibilityLabel === 'Second work').props.onPress();
    harness.render();

    if (origin === 'hardware') harness.back();
    else harness.requestPop();
    harness.render();
    assert.equal(harness.dismissCalls, 1);
    assert.equal(harness.guarded, true, 'guard remains while the sheet dismissal animates');
    assert.ok(harness.observed.some((entry) => entry.kind === 'TrueSheet'));
    harness.back();
    harness.requestPop();
    harness.render();
    assert.ok(harness.dismissCalls >= 1);
    assert.equal(harness.pagePops, 0);
    assert.equal(harness.navigationDispatches, 0, 'the blocked navigation action is never replayed');
    assert.equal(harness.guarded, true);
    assert.equal(harness.backListenerCount, 1);

    harness.observed.find((entry) => entry.kind === 'TrueSheet').props.onDidDismiss();
    harness.render();
    assert.equal(harness.guarded, false);
    assert.equal(harness.backListenerCount, 0);
    assert.equal(
      harness.button('pilgrimageRecordsBangumiFilter').props.accessibilityLabel.endsWith('pilgrimageRecordsAllBangumi'),
      true,
    );
    harness.back();
    assert.equal(harness.pagePops, 1);
  });
}
test('native preventRemove cancels a sheet still opening instead of replaying the page pop', async () => {
  const harness = createHarness();
  harness.render();
  harness.button('pilgrimageRecordsDateFilter').props.onPress();
  harness.render();
  harness.requestPop();
  harness.render();
  assert.equal(harness.pendingPresentations, 0);
  assert.equal(harness.pagePops, 0);
  assert.equal(harness.navigationDispatches, 0);
  assert.equal(harness.guarded, false);
  harness.requestPop();
  assert.equal(harness.pagePops, 1);
});

test('date presentation waits for native content and runs once per opening while bangumi still auto-presents', async () => {
  const harness = createHarness();
  harness.render();
  harness.button('pilgrimageRecordsDateFilter').props.onPress();
  harness.render();

  const sheet = harness.observed.find((entry) => entry.kind === 'TrueSheet');
  assert.equal(sheet.props.initialDetentIndex, undefined, 'auto-sized content must not present during host attachment');
  assert.equal(harness.presentationRequests.length, 1);
  const request = harness.presentationRequests[0];
  assert.equal(request.started, false);
  assert.equal(harness.pendingContentMounts, 1);
  assert.equal(harness.pendingPresentations, 0, 'the native presentation cannot begin before onMount');

  harness.choiceChip('pilgrimageRecordsFilterDateCustom').props.onPress();
  harness.render();
  harness.observed.find((entry) => entry.kind === 'Calendar').props.onChange({ startDate: '2026-10-01', endDate: '' });
  harness.render();
  harness.actionButton('pilgrimageRecordsFilterReset').props.onPress();
  harness.render();
  assert.equal(harness.presentationRequests.length, 1, 'changing draft content does not start a second presentation');

  await harness.mountContent();
  assert.equal(request.started, true);
  assert.equal(harness.pendingContentMounts, 0);
  assert.equal(harness.pendingPresentations, 1);
  harness.completePresentation(request);
  harness.back();
  harness.render();
  assert.equal(harness.dismissCalls, 1, 'back dismisses normally once native presentation completes');
  harness.observed.find((entry) => entry.kind === 'TrueSheet').props.onDidDismiss();
  harness.render();

  harness.button('pilgrimageRecordsBangumiFilter').props.onPress();
  harness.render();
  assert.equal(harness.observed.find((entry) => entry.kind === 'TrueSheet').props.initialDetentIndex, 0);
  assert.equal(harness.presentationRequests.length, 1, 'the fractional bangumi sheet does not call ref.present()');
  assert.equal(harness.pendingContentMounts, 0);
  assert.equal(harness.pendingPresentations, 1, 'the bangumi host retains its existing auto-presentation');
  await harness.present();
});

test('cancelling a date sheet before native content is ready leaves its request inactive on the next opening', async () => {
  const harness = createHarness();
  harness.render();
  harness.button('pilgrimageRecordsDateFilter').props.onPress();
  harness.render();
  const cancelled = harness.presentationRequests[0];
  assert.equal(cancelled.started, false);
  harness.back();
  harness.render();
  assert.equal(harness.pendingContentMounts, 0);
  assert.equal(harness.guarded, false);

  harness.button('pilgrimageRecordsDateFilter').props.onPress();
  harness.render();
  const current = harness.presentationRequests[1];
  assert.notEqual(cancelled.instance, current.instance, 'a new opening has its own native sheet and drafts');
  await harness.mountContent();
  assert.equal(cancelled.started, false, 'the removed host never resumes its pending native command');
  assert.equal(current.started, true);
  harness.completePresentation(cancelled);
  harness.back();
  harness.render();
  assert.equal(harness.dismissCalls, 0, 'an old native event cannot mark the new opening as presented');
  assert.equal(harness.pendingPresentations, 0);
  assert.equal(harness.guarded, false);
  assert.equal(harness.pagePops, 0);
});

test('a late failed date presentation cannot close a newer opening or restore an old native callback', async () => {
  const harness = createHarness();
  harness.render();
  harness.button('pilgrimageRecordsDateFilter').props.onPress();
  harness.render();
  await harness.mountContent();
  const cancelled = harness.presentationRequests[0];
  harness.back();
  harness.render();

  harness.button('pilgrimageRecordsDateFilter').props.onPress();
  harness.render();
  await harness.failPresentation(cancelled, new Error('old native presentation failed after cancellation'));
  harness.completePresentation(cancelled);
  harness.render();
  assert.equal(harness.errors.length, 0, 'an inactive effect ignores rejection from its removed native host');
  assert.ok(harness.observed.some((entry) => entry.kind === 'TrueSheet'));
  assert.equal(harness.pendingContentMounts, 1, 'the new opening keeps its own pending mount');
  assert.equal(harness.guarded, true);

  harness.back();
  harness.render();
  assert.equal(
    harness.dismissCalls,
    0,
    'the new opening is still pending rather than marked presented by the old host',
  );
  assert.equal(harness.pagePops, 0);
  assert.equal(harness.guarded, false);
});

test('a failed active date presentation closes the pending sheet and releases its page guard', async () => {
  const harness = createHarness();
  harness.render();
  harness.button('pilgrimageRecordsDateFilter').props.onPress();
  harness.render();
  await harness.mountContent();
  await harness.failPresentation(harness.presentationRequests[0], new Error('native presentation failed'));
  harness.render();

  assert.equal(harness.errors.length, 1);
  assert.match(harness.errors[0][0], /Failed to open the pilgrimage date filter/);
  assert.equal(
    harness.observed.some((entry) => entry.kind === 'TrueSheet'),
    false,
  );
  assert.equal(harness.guarded, false);
  assert.equal(harness.backListenerCount, 0);
  assert.equal(harness.dismissCalls, 0);
  assert.equal(harness.pagePops, 0);
  harness.back();
  assert.equal(harness.pagePops, 1, 'ordinary navigation works after presentation failure');
});
