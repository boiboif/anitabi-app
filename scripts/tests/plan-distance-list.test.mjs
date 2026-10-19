import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadSource(path, modules) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const context = vm.createContext({
    exports: {},
    require: (name) => {
      assert.ok(name in modules, `unexpected module: ${name}`);
      return modules[name];
    },
  });
  vm.runInContext(compiled, context);
  return context.exports;
}

const distances = loadSource('../../src/utils/plan-point-distances.ts', {});
const plain = (value) => JSON.parse(JSON.stringify(value));

function findNode(tree, predicate) {
  if (!tree) return undefined;
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
  } else if (typeof tree === 'object') {
    if (predicate(tree)) return tree;
    return findNode(tree.props?.children, predicate);
  }
  return undefined;
}

function legendListProps(props) {
  const jsx = {
    jsx: (type, nodeProps) => ({ type, props: nodeProps }),
    jsxs: (type, nodeProps) => ({ type, props: nodeProps }),
  };
  const StableReorderableList = loadSource('../../src/components/ui/stable-reorderable-list.tsx', {
    '@legendapp/list/react-native': { LegendList: 'LegendList' },
    react: {
      memo: (component) => component,
      useCallback: (callback) => callback,
      useLayoutEffect() {},
      useMemo: (factory) => factory(),
      useRef: (value) => ({ current: value }),
      useState: (value) => [value, () => {}],
    },
    'react/jsx-runtime': jsx,
    'react-native': { StyleSheet: { create: (styles) => styles }, View: 'View' },
    'react-native-gesture-handler': { GestureDetector: 'GestureDetector', usePanGesture: () => null },
    'react-native-reanimated': {
      __esModule: true,
      default: { View: 'Animated.View', ScrollView: 'Animated.ScrollView' },
      scrollTo() {},
      useAnimatedRef: () => () => {},
      useAnimatedStyle: () => ({}),
      useFrameCallback: () => ({ isActive: false, setActive() {} }),
      useSharedValue: (value) => ({ value }),
    },
    'react-native-worklets': { scheduleOnRN() {} },
  }).default;
  const list = findNode(StableReorderableList(props), (node) => node.type === 'LegendList');
  assert.ok(list, 'the wrapper renders LegendList');
  return list.props;
}

function createHarness() {
  const params = { planId: 'plan' };
  let dirty = true;
  let tree;
  let cursor = 0;
  let effects = [];
  let isFocused = true;
  let locationEnabled = false;
  let locationFix = { latitude: 35, longitude: 139 };
  let locationErrorHandler;
  const slots = [];
  const contexts = [];
  const planSubscribers = new Set();
  const calls = { reorder: [], toggle: [], remove: [], navigate: [], writes: [], alerts: [], toasts: [], settings: 0, distanceSorts: 0 };
  const geo = { far: [36, 139], near: [35.001, 139], completed: [35, 139], invalid: [0, 0] };
  const plan = {
    id: 'plan',
    title: 'My plan',
    items: ['far', 'near', 'completed', 'snapshot', 'invalid'].map((id, index) => ({
      key: `1:${id}`,
      pointId: id,
      bangumiId: 1,
      completed: id === 'completed',
      snapshot: { pointName: id, bangumiName: 'Work', geo: id === 'snapshot' ? [35.002, 139] : [35, 139] },
      addedAt: index,
    })),
  };
  const work = {
    id: 1,
    title: 'Work',
    points: Object.entries(geo).map(([id, coordinates]) => ({ id, geo: coordinates })),
  };
  const mapState = { data: { data: { bangumis: [work] } } };
  let planState;
  const planStore = loadSource('../../src/store/use-plans.ts', {
    '@/lib/plan-storage': {
      getPlans: () => [plan],
      getPlanListSortOrder: () => 'desc',
      setPlans: (plans) => calls.writes.push(plans),
    },
    '@/lib/localized-data': { getBangumiTitle: (work) => work.title, getPointTitle: (point) => point.id },
    '@/i18n': { default: { t: (_, options) => options.defaultValue } },
    zustand: {
      create: (initialize) => {
        planState = initialize(
          (patch) => {
            planState = { ...planState, ...patch };
            dirty = true;
            for (const subscriber of planSubscribers) subscriber();
          },
          () => planState,
        );
        return { getState: () => planState };
      },
    },
  }).usePlans;
  const planActions = {
    togglePoint: (...args) => {
      calls.toggle.push(args);
      planState.togglePoint(...args);
    },
    reorderPoints: (...args) => {
      calls.reorder.push(args);
      planState.reorderPoints(...args);
    },
    removePoints: (...args) => {
      calls.remove.push(args);
      planState.removePoints(...args);
    },
  };
  const usePlans = (selector) => selector({ ...planState, ...planActions });
  usePlans.getState = planStore.getState;
  usePlans.subscribe = (subscriber) => {
    planSubscribers.add(subscriber);
    return () => planSubscribers.delete(subscriber);
  };
  const router = {
    navigate(destination) {
      calls.navigate.push(destination);
    },
    back() {},
  };
  const react = {
    createContext(value) {
      const context = { value, Provider: Symbol('Context.Provider') };
      contexts.push(context);
      return context;
    },
    useContext(context) {
      return context.value;
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [
        slots[index].value,
        (next) => {
          const value = typeof next === 'function' ? next(slots[index].value) : next;
          if (!Object.is(value, slots[index].value)) {
            slots[index].value = value;
            dirty = true;
          }
        },
      ];
    },
    useRef(current) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current };
      return slots[index];
    },
    useMemo(factory, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        slots[index] = { value: factory(), dependencies };
      }
      return slots[index].value;
    },
    useCallback(callback, dependencies) {
      return react.useMemo(() => callback, dependencies);
    },
    useEffect(run, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { dependencies, cleanup: run() };
        });
      }
    },
    useLayoutEffect(run, dependencies) {
      react.useEffect(run, dependencies);
    },
    startTransition(update) {
      update();
    },
  };
  const theme = { primary: { val: '#123' }, color8: { val: '#456' }, background: { val: '#fff' } };
  const jsx = {
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props }),
    Fragment: 'Fragment',
  };
  const i18n = { useTranslation: () => ({ t: (key) => key, i18n: { resolvedLanguage: 'zh' } }) };
  const tamagui = { Text: 'Text', View: 'View', XStack: 'XStack', YStack: 'YStack', useTheme: () => theme };
  theme.color2 = { val: '#eee' };
  const SettingsSheet = loadSource('../../src/components/plan/plan-list-settings-sheet.tsx', {
    react: { forwardRef: (render) => render },
    'react/jsx-runtime': jsx,
    'react-i18next': i18n,
    tamagui,
    '@lodev09/react-native-true-sheet': { TrueSheet: 'TrueSheet' },
    '@/components/ui/theme-switch': { ThemeSwitch: 'ThemeSwitch' },
  }).default;
  const component = loadSource('../../src/app/plans/[planId].tsx', {
    react,
    'react/jsx-runtime': jsx,
    'react-i18next': i18n,
    'react-native': { Alert: { alert: (...args) => calls.alerts.push(args) }, Linking: {}, Pressable: 'Pressable' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    tamagui,
    'expo-router': { Stack: { Screen: 'Screen' }, useIsFocused: () => isFocused, useLocalSearchParams: () => params, useRouter: () => router },
    '@boiboif/react-native-toast': { Toast: { show: (message) => calls.toasts.push(message) } },
    '@tamagui/lucide-icons-2': { Square: 'Square', SquareCheckBig: 'SquareCheckBig' },
    '@/components/ui/action-sheet': { ActionSheet: 'ActionSheet' },
    '@/components/point/point-list-card': { __esModule: true, default: 'PointListCard' },
    '@/components/plan/plan-list-settings-sheet': { __esModule: true, default: 'PlanListSettingsSheet' },
    '@/components/ui/stable-reorderable-list': { __esModule: true, default: 'StableReorderableList' },
    '@/components/ui/strict-button': { StrictButton: 'Button' },
    '@/hooks/use-plan-distance-location': {
      usePlanDistanceLocation: (enabled, onError) => {
        locationEnabled = enabled;
        locationErrorHandler = onError;
        return {
          location: enabled && isFocused ? locationFix : null,
          error: null,
          isLocating: enabled && isFocused && locationFix === null,
          retry() {},
        };
      },
    },
    '@/lib/localized-data': { getPointTitle: (point) => point.id, getBangumiTitle: () => 'Work' },
    '@/lib/plan-share-files': {},
    '@/lib/plan-sharing': {},
    '@/lib/ui-sizes': {},
    '@/services/handlers': { buildImageUrl: () => undefined },
    '@/store/use-map-data': { useMapData: (selector) => selector(mapState) },
    '@/store/use-plans': { usePlans },
    '@/utils/plan-point-distances': {
      ...distances,
      sortPlanPointsByDistance: (...args) => {
        calls.distanceSorts++;
        return distances.sortPlanPointsByDistance(...args);
      },
    },
  }).default;
  const render = () => {
    let iterations = 0;
    while (dirty) {
      assert.ok(++iterations < 20, 'render state converges');
      dirty = false;
      cursor = 0;
      effects = [];
      tree = component();
      if (dirty) continue; // React abandons this render after a render-phase state adjustment.
      for (const context of contexts) {
        const provider = findNode(tree, (node) => node.type === context.Provider);
        if (provider) context.value = provider.props.value;
      }
      const settings = findNode(tree, (node) => node.type === 'PlanListSettingsSheet');
      if (settings)
        settings.props.ref.current = {
          present: () => {
            calls.settings++;
          },
        };
      for (const effect of effects) effect();
    }
    return tree;
  };
  render();
  return {
    calls,
    get plan() {
      return planState.plans[0];
    },
    render,
    get locationEnabled() {
      return locationEnabled;
    },
    get locationActive() {
      return locationEnabled && isFocused;
    },
    setFocused(focused) {
      isFocused = focused;
      if (!focused) locationFix = null;
      dirty = true;
      render();
    },
    setLocationFix(fix) {
      locationFix = fix;
      dirty = true;
      render();
    },
    failLocation(error) {
      assert.equal(locationEnabled, true, 'distance mode must be active before location fails');
      locationFix = null;
      locationErrorHandler(error);
      render();
    },
    get list() {
      return findNode(render(), (node) => node.type === 'StableReorderableList');
    },
    get toggle() {
      return this.settingToggle('planSortByDistance');
    },
    settingToggle(label) {
      const sheet = findNode(render(), (node) => node.type === 'PlanListSettingsSheet');
      return findNode(SettingsSheet(sheet.props), (node) => node.props?.accessibilityLabel === label);
    },
    button(label) {
      return findNode(render(), (node) => node.type === 'Button' && node.props?.accessibilityLabel === label);
    },
    headerButton(label) {
      const screen = findNode(render(), (node) => node.type === 'Screen');
      return findNode(screen.props.options.headerRight(), (node) => node.props?.['aria-label'] === label);
    },
    rerender() {
      dirty = true;
      render();
    },
    replaceItems(items) {
      planState = { ...planState, plans: [{ ...planState.plans[0], items }] };
      dirty = true;
      for (const subscriber of planSubscribers) subscriber();
      render();
    },
    select(id) {
      this.checkbox(id).props.onPress({ stopPropagation() {} });
      render();
    },
    checkbox(id) {
      const checkbox = this.card(id).props.leading;
      return checkbox.type(checkbox.props);
    },
    card(id) {
      const list = findNode(render(), (node) => node.type === 'StableReorderableList');
      const item = list.props.data.find((row) => row.id === `1:${id}`);
      const row = list.props.renderItem({ item });
      return row.type(row.props);
    },
  };
}

test('page distance toggle composes with incomplete filtering without saving order or renumbering cards', () => {
  const page = createHarness();
  const originalIds = page.plan.items.map((item) => item.key);
  assert.equal(page.locationEnabled, false);
  page.toggle.props.onCheckedChange(true);
  assert.deepEqual(plain(page.list.props.data.map((item) => item.id)), [
    '1:completed',
    '1:near',
    '1:snapshot',
    '1:far',
    '1:invalid',
  ]);
  assert.equal(page.locationEnabled, true);
  page.settingToggle('showIncompleteLocationsOnly').props.onCheckedChange(true);
  assert.deepEqual(plain(page.list.props.data.map((item) => item.id)), ['1:near', '1:snapshot', '1:far', '1:invalid']);
  assert.deepEqual(plain(page.list.props.data.map((item) => item.sequenceNumber)), [2, 4, 1, 5]);
  assert.equal(page.list.props.enabled, false);
  assert.equal(page.calls.reorder.length, 0);
  assert.deepEqual(
    page.plan.items.map((item) => item.key),
    originalIds,
  );
});

test('distance mode retains the saved order and locating labels until the first fix arrives', () => {
  const page = createHarness();
  page.setLocationFix(null);
  const originalIds = page.plan.items.map((item) => item.key);
  page.toggle.props.onCheckedChange(true);

  assert.equal(page.toggle.props.checked, true);
  assert.equal(page.locationEnabled, true);
  assert.deepEqual(plain(page.list.props.data.map((item) => item.id)), originalIds);
  for (const id of ['far', 'near', 'completed', 'snapshot', 'invalid']) {
    assert.equal(page.card(id).props.meta, 'planDistanceLocating');
  }
  assert.equal(page.calls.writes.length, 0);

  page.setLocationFix({ latitude: 35, longitude: 139 });
  assert.deepEqual(plain(page.list.props.data.map((item) => item.id)), [
    '1:completed', '1:near', '1:snapshot', '1:far', '1:invalid',
  ]);
  assert.equal(page.card('near').props.meta, 'planDistanceMeters');
  assert.equal(page.card('invalid').props.meta, 'planDistanceUnknown');
  assert.deepEqual(page.plan.items.map((item) => item.key), originalIds);
  assert.equal(page.calls.writes.length, 0);
});

test('distance state refreshes mounted LegendList rows while their item data reference stays stable', () => {
  const page = createHarness();
  page.setLocationFix(null);
  const before = legendListProps(page.list.props);

  page.toggle.props.onCheckedChange(true);
  const locating = legendListProps(page.list.props);
  assert.equal(locating.data, before.data, 'locating does not replace the saved-order list data');
  assert.notEqual(locating.extraData, before.extraData, 'mounted rows must observe the distance toggle');

  page.failLocation('unavailable');
  const failed = legendListProps(page.list.props);
  assert.equal(failed.data, before.data);
  assert.equal(failed.extraData, before.extraData, 'failure restores the ordinary row state');
  assert.equal(page.calls.toasts.at(-1), 'planDistanceLocationFailed');
});

test('add navigation keeps the last distance projection during blur, then refocus waits for a new fix', () => {
  const page = createHarness();
  page.toggle.props.onCheckedChange(true);
  const sortedBeforeBlur = page.list.props.data;
  const sortsBeforeBlur = page.calls.distanceSorts;
  const nearDistance = page.card('near').props.meta;
  assert.equal(nearDistance, 'planDistanceMeters');

  page.headerButton('addLocations').props.onPress();
  assert.deepEqual(plain(page.calls.navigate), [
    { pathname: '/plans/[planId]/add', params: { planId: 'plan' } },
  ]);
  page.setFocused(false);
  assert.equal(page.locationActive, false);
  assert.equal(page.toggle.props.checked, true);
  assert.equal(page.list.props.data, sortedBeforeBlur, 'blur does not clone or resort unchanged list data');
  assert.equal(page.calls.distanceSorts, sortsBeforeBlur);
  assert.equal(page.card('near').props.meta, nearDistance);

  const added = { ...page.plan.items[0], key: '1:far-copy', addedAt: 999 };
  page.replaceItems([added, ...page.plan.items]);
  assert.equal(page.calls.distanceSorts, sortsBeforeBlur + 1, 'a blurred store update uses the last valid location');
  assert.deepEqual(plain(page.list.props.data.map((item) => item.id)), [
    '1:completed', '1:near', '1:snapshot', '1:far-copy', '1:far', '1:invalid',
  ]);
  assert.equal(page.card('near').props.meta, nearDistance, 'blurred store updates retain distance labels');

  page.setFocused(true);
  assert.equal(page.locationActive, true);
  assert.deepEqual(plain(page.list.props.data.map((item) => item.id)), [
    '1:far-copy', '1:far', '1:near', '1:completed', '1:snapshot', '1:invalid',
  ]);
  assert.equal(page.card('near').props.meta, 'planDistanceLocating');
  assert.equal(page.calls.distanceSorts, sortsBeforeBlur + 1);

  const waitingList = page.list.props.data;
  page.setFocused(false);
  assert.equal(page.list.props.data, waitingList, 'leaving again before a new fix stays in the waiting state');
  assert.equal(page.card('near').props.meta, 'planDistanceLocating');
  page.setFocused(true);

  page.setLocationFix({ latitude: 36, longitude: 139 });
  assert.deepEqual(plain(page.list.props.data.map((item) => item.id).slice(0, 2)), ['1:far-copy', '1:far']);
  assert.equal(page.card('far').props.meta, 'planDistanceMeters');
  assert.equal(page.card('invalid').props.meta, 'planDistanceUnknown');
  assert.equal(page.calls.reorder.length, 0);
  assert.equal(page.calls.writes.length, 0);
});

for (const [name, navigate] of [
  ['map button', (page) => page.headerButton('mapMode').props.onPress()],
  ['point card', (page) => page.card('near').props.onPress()],
]) {
  test(`${name} navigation keeps distance rows stable during blur`, () => {
    const page = createHarness();
    page.toggle.props.onCheckedChange(true);
    const sortedBeforeBlur = page.list.props.data;
    navigate(page);
    assert.equal(page.calls.navigate.at(-1).pathname, '/plans/[planId]/map');

    page.setFocused(false);
    assert.equal(page.locationActive, false);
    assert.equal(page.list.props.data, sortedBeforeBlur);
    assert.equal(page.card('near').props.meta, 'planDistanceMeters');
    assert.equal(page.toggle.props.checked, true);
  });
}

test('only a point without valid coordinates shows unknown distance after location succeeds', () => {
  const page = createHarness();
  page.toggle.props.onCheckedChange(true);

  assert.equal(page.list.props.data.at(-1).id, '1:invalid');
  assert.equal(page.card('invalid').props.meta, 'planDistanceUnknown');
  assert.equal(page.card('snapshot').props.meta, 'planDistanceMeters');
  assert.equal(page.card('far').props.meta, 'planDistanceKilometers');
});

for (const [error, toast] of [
  ['permission', 'planDistancePermissionRequired'],
  ['services', 'planDistanceServicesDisabled'],
  ['unavailable', 'planDistanceLocationFailed'],
]) {
  test(`location ${error} turns distance mode off and shows the existing Toast`, () => {
    const page = createHarness();
    page.setLocationFix(null);
    const originalIds = page.plan.items.map((item) => item.key);
    page.toggle.props.onCheckedChange(true);
    assert.equal(page.card('near').props.meta, 'planDistanceLocating');

    page.failLocation(error);
    assert.equal(page.toggle.props.checked, false);
    assert.equal(page.locationEnabled, false);
    assert.deepEqual(plain(page.list.props.data.map((item) => item.id)), originalIds);
    assert.equal(page.card('near').props.meta, undefined);
    assert.deepEqual(page.calls.toasts, [toast]);
    assert.equal(page.calls.writes.length, 0);
  });
}

test('manual sorting closes distance mode and restores the complete saved order before any explicit reorder', () => {
  const page = createHarness();
  page.toggle.props.onCheckedChange(true);
  page.settingToggle('showIncompleteLocationsOnly').props.onCheckedChange(true);
  page.render();
  page.headerButton('reorderLocations').props.onPress();
  assert.equal(page.list.props.enabled, true);
  assert.equal(page.toggle.props.checked, false);
  assert.equal(page.toggle.props.disabled, true);
  assert.equal(page.locationEnabled, false);
  assert.deepEqual(
    plain(page.list.props.data.map((item) => item.id)),
    page.plan.items.map((item) => item.key),
  );
  assert.equal(page.calls.reorder.length, 0);
  page.list.props.onReorder(['1:near', '1:far', '1:completed', '1:snapshot', '1:invalid']);
  assert.deepEqual(page.calls.reorder, [['plan', ['1:near', '1:far', '1:completed', '1:snapshot', '1:invalid']]]);
});

test('list settings contains both independent switches and opening it does not request location', () => {
  const page = createHarness();
  assert.equal(
    findNode(page.render(), (node) => node.type === 'ThemeSwitch'),
    undefined,
    'no standalone switch',
  );
  page.headerButton('planListSettings').props.onPress();
  assert.equal(page.calls.settings, 1);
  assert.equal(page.toggle.props.checked, false);
  assert.equal(page.settingToggle('showIncompleteLocationsOnly').props.checked, false);
  page.settingToggle('showIncompleteLocationsOnly').props.onCheckedChange(true);
  page.rerender();
  assert.equal(page.locationEnabled, false);
  assert.equal(page.toggle.props.checked, false);
  page.toggle.props.onCheckedChange(true);
  page.rerender();
  assert.equal(page.toggle.props.checked, true);
  assert.equal(page.settingToggle('showIncompleteLocationsOnly').props.checked, true);
  assert.equal(page.locationEnabled, true);
  page.toggle.props.onCheckedChange(false);
  page.rerender();
  assert.equal(page.locationEnabled, false);
  assert.equal(page.settingToggle('showIncompleteLocationsOnly').props.checked, true);
  assert.equal(page.calls.writes.length, 0);
});

test('distance cards preserve existing completion and map actions; snapshot-only data does not enable live actions', () => {
  const page = createHarness();
  page.toggle.props.onCheckedChange(true);
  const near = page.card('near');
  assert.equal(near.props.meta, 'planDistanceMeters');
  assert.equal(near.props.sequenceNumber, 2);
  near.props.onPress();
  assert.deepEqual(plain(page.calls.navigate), [
    { pathname: '/plans/[planId]/map', params: { planId: 'plan', bangumiId: 1, pointId: 'near' } },
  ]);
  near.props.statusAction.props.onPress({ stopPropagation() {} });
  assert.deepEqual(page.calls.toggle, [['plan', '1:near']]);
  const snapshot = page.card('snapshot');
  assert.equal(snapshot.props.meta, 'planDistanceMeters');
  assert.equal(snapshot.props.disabled, true);
  assert.equal(snapshot.props.showNavigation, false);
  assert.equal(snapshot.props.showCamera, false);
  assert.equal(page.card('invalid').props.meta, 'planDistanceUnknown');
});

test('sorting selection is separate from completion, and cancelling batch delete writes nothing', () => {
  const page = createHarness();
  page.headerButton('reorderLocations').props.onPress();
  page.select('near');
  page.select('completed');
  assert.equal(page.checkbox('near').props.accessibilityState.checked, true);
  assert.equal(page.checkbox('completed').props.accessibilityState.checked, true);
  assert.equal(page.card('near').props.statusAction, null);
  assert.equal(page.calls.toggle.length, 0);
  assert.equal(page.calls.writes.length, 0);
  page.button('planDeleteSelectedLocations').props.onPress();
  assert.equal(page.calls.alerts.length, 1);
  const cancel = page.calls.alerts[0][2].find((action) => action.style === 'cancel');
  cancel.onPress?.();
  assert.equal(page.calls.remove.length, 0);
  assert.equal(page.calls.writes.length, 0);
  assert.equal(page.plan.items.length, 5);
  assert.equal(page.checkbox('near').props.accessibilityState.checked, true);
});

test('cached checkbox consumers update selection without recreating list data or writing the plan', () => {
  const page = createHarness();
  page.headerButton('reorderLocations').props.onPress();
  const listData = page.list.props.data;
  const renderItem = page.list.props.renderItem;
  // LegendList retains this element when item data and extraData are unchanged.
  // Re-evaluate only its context consumer, never the latest list renderItem.
  const cachedCheckbox = page.card('near').props.leading;
  const readCheckbox = (element = cachedCheckbox) => {
    page.render();
    return element.type(element.props);
  };
  assert.equal(readCheckbox().props.accessibilityState.checked, false);
  assert.ok(findNode(readCheckbox(), (node) => node.type === 'Square'));
  readCheckbox().props.onPress({ stopPropagation() {} });
  assert.equal(readCheckbox().props.accessibilityState.checked, true);
  assert.ok(findNode(readCheckbox(), (node) => node.type === 'SquareCheckBig'));
  assert.equal(page.list.props.data, listData, 'selection does not reset the list or its drag data');
  assert.equal(page.list.props.renderItem, renderItem);

  const recycledCheckbox = {
    ...cachedCheckbox,
    props: { ...cachedCheckbox.props, item: page.plan.items.find((item) => item.key === '1:completed') },
  };
  assert.equal(readCheckbox(recycledCheckbox).props.accessibilityState.checked, false);
  page.button('planDeleteSelectedLocations').props.onPress();
  page.calls.alerts[0][2].find((action) => action.style === 'cancel').onPress?.();
  assert.equal(readCheckbox().props.accessibilityState.checked, true);
  readCheckbox().props.onPress({ stopPropagation() {} });
  assert.equal(readCheckbox().props.accessibilityState.checked, false);
  page.button('planSelectAllLocations').props.onPress();
  assert.equal(readCheckbox().props.accessibilityState.checked, true);
  assert.equal(readCheckbox(recycledCheckbox).props.accessibilityState.checked, true);
  page.button('planDeselectAllLocations').props.onPress();
  assert.equal(readCheckbox().props.accessibilityState.checked, false);
  assert.equal(page.list.props.data, listData);
  assert.equal(page.plan.items.filter((item) => item.completed).length, 1);
  assert.equal(page.calls.writes.length, 0);
  assert.equal(page.calls.reorder.length, 0);
});

test('batch delete confirms one captured selection against the latest plan without overwriting concurrent changes', () => {
  const page = createHarness();
  page.headerButton('reorderLocations').props.onPress();
  page.select('far');
  page.select('near');
  page.button('planDeleteSelectedLocations').props.onPress();
  const confirm = page.calls.alerts[0][2].find((action) => action.style === 'destructive');
  const retained = { ...page.plan.items[2], completed: false };
  const readded = { ...page.plan.items[1], addedAt: 999 };
  const added = { ...page.plan.items[0], key: '2:new', pointId: 'new', bangumiId: 2, addedAt: 999 };
  page.replaceItems([retained, readded, page.plan.items[0], added, ...page.plan.items.slice(3)]);
  confirm.onPress();
  assert.equal(page.calls.remove.length, 1);
  assert.equal(page.calls.writes.length, 1);
  assert.deepEqual(plain(page.plan.items.map((item) => item.key)), [
    '1:completed',
    '1:near',
    '2:new',
    '1:snapshot',
    '1:invalid',
  ]);
  assert.equal(page.plan.items[0], retained);
  assert.equal(page.plan.items[1], readded, 'same point re-added after confirmation opened is retained');
  assert.equal(page.plan.items[2], added);
  assert.equal(page.list.props.enabled, true);
  assert.equal(page.button('planDeleteSelectedLocations').props.disabled, true);
});

test('select all and clear selection do not write; leaving sorting clears selection and keeps dragging available', () => {
  const page = createHarness();
  page.headerButton('reorderLocations').props.onPress();
  page.button('planSelectAllLocations').props.onPress();
  assert.equal(page.checkbox('completed').props.accessibilityState.checked, true);
  assert.equal(page.checkbox('snapshot').props.accessibilityState.checked, true);
  page.button('planDeselectAllLocations').props.onPress();
  assert.equal(page.button('planDeleteSelectedLocations').props.disabled, true);
  page.select('near');
  assert.equal(page.list.props.enabled, true);
  const item = page.list.props.data[0];
  const row = page.list.props.renderItem({ item, dragHandle: 'handle' });
  assert.equal(row.type(row.props).props.trailing, 'handle');
  page.headerButton('finishReordering').props.onPress();
  page.render();
  page.headerButton('reorderLocations').props.onPress();
  assert.equal(page.button('planDeleteSelectedLocations').props.disabled, true);
  assert.equal(page.calls.writes.length, 0);
});

test('confirming removal of every selected item saves once and exits sorting on the empty plan', () => {
  const page = createHarness();
  page.headerButton('reorderLocations').props.onPress();
  page.button('planSelectAllLocations').props.onPress();
  page.button('planDeleteSelectedLocations').props.onPress();
  page.calls.alerts[0][2].find((action) => action.style === 'destructive').onPress();
  page.render();
  assert.equal(page.plan.items.length, 0);
  assert.equal(page.calls.writes.length, 1);
  assert.equal(page.list, undefined);
  assert.equal(page.headerButton('reorderLocations').props.disabled, true);
});
