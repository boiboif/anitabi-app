import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual screen's handlers, selection and navigation guards. Native
// gestures and the system confirmation still need device QA.
function createHarness({ startDate = '', endDate = '' } = {}) {
  const pointKey = '1:point';
  const photo = (id) => ({ id, fileName: `${id}.jpg`, width: 800, height: 600 });
  const state = {
    points: [
      {
        key: pointKey,
        bangumiId: 1,
        pointId: 'point',
        snapshot: { bangumiName: 'Work', pointName: 'Place' },
        days: [
          { dateKey: '2026-10-23', firstRecordedAt: 3, photos: [photo('photo-a'), photo('photo-b')] },
          { dateKey: '2026-10-22', firstRecordedAt: 2, photos: [photo('photo-c')] },
          { dateKey: '2026-10-21', firstRecordedAt: 1, photos: [] },
        ],
      },
    ],
    loadError: null,
  };
  const calls = { alerts: [], deletes: [], navigation: [] };
  const slots = [];
  const backListeners = new Set();
  let cursor = 0;
  let nodes = [];
  let deleteError;
  let deleteGate;
  let removeGuard;
  let focused = true;
  const equalDeps = (left, right) =>
    left && right && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next) => (slots[index] = typeof next === 'function' ? next(slots[index]) : next)];
    },
    useRef(initial) {
      const index = cursor++;
      return (slots[index] ??= { current: initial });
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!equalDeps(slots[index]?.deps, deps)) slots[index] = { callback, deps };
      return slots[index].callback;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!equalDeps(slots[index]?.deps, deps)) {
        slots[index]?.cleanup?.();
        slots[index] = { deps, cleanup: callback() };
      }
    },
  };
  const jsx = {
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props }),
    Fragment: 'Fragment',
  };
  class PilgrimagePhotoCleanupError extends Error {}
  function applySelection({ dateKeys, photoIds }) {
    const deletedDays = new Set(dateKeys);
    const deletedPhotos = new Set(photoIds);
    state.points = state.points.flatMap((point) => {
      if (point.key !== pointKey) return [point];
      const days = point.days
        .filter((day) => !deletedDays.has(day.dateKey))
        .map((day) => ({ ...day, photos: day.photos.filter((photo) => !deletedPhotos.has(photo.id)) }));
      return days.length ? [{ ...point, days }] : [];
    });
  }
  const navigation = {
    useIsFocused: () => focused,
    usePreventRemove: (enabled, callback) => {
      removeGuard = { enabled, callback };
    },
    useFocusEffect(callback) {
      react.useEffect(() => (focused ? callback() : undefined), [callback, focused]);
    },
  };
  const modules = {
    react,
    'react/jsx-runtime': jsx,
    'react-i18next': {
      useTranslation: () => ({ t: (key, values) => (values ? `${key}:${JSON.stringify(values)}` : key) }),
    },
    'react-native': {
      Alert: { alert: (...args) => calls.alerts.push(args) },
      Pressable: 'Pressable',
      BackHandler: {
        addEventListener(event, callback) {
          assert.equal(event, 'hardwareBackPress');
          backListeners.add(callback);
          return { remove: () => backListeners.delete(callback) };
        },
      },
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    tamagui: {
      Text: 'Text',
      View: 'View',
      XStack: 'XStack',
      YStack: 'YStack',
      useTheme: () => ({ pageBackground: { val: '#fff' }, color12: { val: '#111' }, primary: { val: '#e00' } }),
    },
    'expo-router': {
      ...navigation,
      Stack: { Screen: 'Screen' },
      useLocalSearchParams: () => ({ pointKey, startDate, endDate }),
      useRouter: () => ({ replace: (...args) => calls.navigation.push(args) }),
    },
    '@react-navigation/native': navigation,
    'expo-image': { Image: 'Image' },
    '@shopify/flash-list': { FlashList: 'FlashList' },
    '@tamagui/lucide-icons-2': new Proxy({}, { get: (_, name) => name }),
    '@/components/image-preview/image-preview': { __esModule: true, default: 'ImagePreview' },
    '@/components/ui/strict-button': { StrictButton: 'Button' },
    '@/lib/pilgrimage-record-files': {
      getPilgrimagePhotoUri: (photo) => `file:///app-records/${photo.fileName}`,
      PilgrimagePhotoCleanupError,
    },
    '@/lib/pilgrimage-record-query': {
      filterPilgrimageDays: (days, { startDate, endDate }) =>
        days
          .filter((day) => (!startDate || day.dateKey >= startDate) && (!endDate || day.dateKey <= endDate))
          .sort((a, b) => b.dateKey.localeCompare(a.dateKey)),
      isPilgrimageDateRangeValid: ({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate,
    },
    '@/lib/ui-sizes': { ICON_BUTTON_ICON_SIZE: 20 },
    '@/services/pilgrimage-records': {
      async deletePilgrimageSelection(key, selection) {
        calls.deletes.push({ pointKey: key, selection: JSON.parse(JSON.stringify(selection)) });
        if (deleteGate) await deleteGate;
        if (!deleteError || deleteError instanceof PilgrimagePhotoCleanupError) applySelection(selection);
        if (deleteError) throw deleteError;
      },
    },
    '@/store/use-pilgrimage-records': { usePilgrimageRecords: (select) => select(state) },
    '@/tamagui.config': { MaxContentWidth: 768, PageHorizontalInset: 12 },
  };
  const compiled = ts.transpileModule(
    readFileSync(new URL('../../src/app/pilgrimage-records/[pointKey].tsx', import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  const context = vm.createContext({
    exports: {},
    require(name) {
      assert.ok(name in modules, `unexpected import: ${name}`);
      return modules[name];
    },
  });
  vm.runInContext(compiled, context);
  const Screen = context.exports.default;
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object' || !node.props) return;
    nodes.push(node);
    if (node.type === 'Screen') visit(node.props.options.headerRight?.());
    if (node.type === 'FlashList') {
      visit(node.props.ListHeaderComponent);
      node.props.data.forEach((item, index) => visit(node.props.renderItem({ item, index })));
      if (!node.props.data.length) visit(node.props.ListEmptyComponent);
    }
    visit(node.props.children);
  }
  function render() {
    cursor = 0;
    nodes = [];
    visit(Screen());
    return nodes;
  }
  function byTestID(id) {
    const node = nodes.find((node) => node.props.testID === id);
    assert.ok(node, `control exists: ${id}`);
    return node;
  }
  function button(label) {
    const node = nodes.find(
      (node) =>
        node.type === 'Button' &&
        (node.props['aria-label'] === label ||
          node.props.accessibilityLabel === label ||
          node.props.children === label),
    );
    assert.ok(node, `button exists: ${label}`);
    return node;
  }
  const thumbnail = (id) => byTestID(`pilgrimage-record-photo-${id}`);
  const day = (date) => byTestID(`pilgrimage-record-day-${date}`);
  const preview = () => nodes.find((node) => node.type === 'ImagePreview');
  function confirmation() {
    const alert = calls.alerts.at(-1);
    assert.ok(
      alert?.[2]?.some((button) => button.style === 'destructive'),
      'a destructive confirmation is shown',
    );
    return alert;
  }
  function enterMode() {
    button('pilgrimageRecordsEdit').props.onPress();
    render();
    assert.ok(button('cancel'));
  }
  render();
  return {
    calls,
    state,
    pointKey,
    render,
    button,
    thumbnail,
    day,
    preview,
    enterMode,
    get nodes() {
      return nodes;
    },
    get list() {
      return nodes.find((node) => node.type === 'FlashList');
    },
    selectPhoto(id) {
      thumbnail(id).props.onPress();
      render();
    },
    selectDay(date) {
      day(date).props.onPress();
      render();
    },
    selectAll() {
      const label = nodes.some(
        (node) => node.type === 'Button' && node.props['aria-label'] === 'pilgrimageRecordsDeselectAll',
      )
        ? 'pilgrimageRecordsDeselectAll'
        : 'pilgrimageRecordsSelectAll';
      button(label).props.onPress();
      render();
    },
    requestDelete() {
      button('pilgrimageRecordsDeleteSelected').props.onPress();
      render();
      return confirmation();
    },
    cancelConfirmation() {
      confirmation()[2]
        .find((button) => button.style === 'cancel')
        ?.onPress?.();
      render();
    },
    confirm() {
      confirmation()[2]
        .find((button) => button.style === 'destructive')
        .onPress();
      render();
    },
    setDeleteError(error) {
      deleteError = error;
    },
    cleanupError() {
      return new PilgrimagePhotoCleanupError('remaining app-owned files');
    },
    blockDelete() {
      let release;
      deleteGate = new Promise((resolve) => {
        release = resolve;
      });
      return release;
    },
    back() {
      const handled = [...backListeners].reverse().some((callback) => callback());
      render();
      return handled;
    },
    remove() {
      const prevented = !!removeGuard?.enabled;
      if (prevented) removeGuard.callback({ data: { action: { type: 'GO_BACK' } } });
      else calls.navigation.push(['GO_BACK']);
      render();
      return prevented;
    },
    setFocused(value) {
      focused = value;
      render();
    },
    async settle() {
      await new Promise(setImmediate);
      render();
    },
  };
}

test('the edit icon directly enters selection mode without a sheet, explanation hint or confirmation', () => {
  const harness = createHarness();
  assert.equal(harness.thumbnail('photo-a').props.accessibilityRole, 'button');
  assert.equal(harness.day('2026-10-23').props.accessibilityRole, undefined);
  assert.equal(
    harness.nodes.some((node) => node.props['aria-label']?.startsWith('pilgrimageRecordsDelete')),
    false,
  );
  assert.ok(harness.button('pilgrimageRecordsEdit').props.icon);
  assert.notEqual(harness.button('pilgrimageRecordsEdit').props.children, 'pilgrimageRecordsEdit');
  harness.enterMode();
  assert.equal(harness.thumbnail('photo-a').props.accessibilityRole, 'checkbox');
  assert.equal(harness.day('2026-10-23').props.accessibilityRole, 'checkbox');
  assert.equal(
    harness.nodes.some((node) => node.type === 'ActionSheet'),
    false,
  );
  assert.equal(
    harness.nodes.some((node) => node.props.children === 'pilgrimageRecordsDeleteModeHint'),
    false,
  );
  assert.equal(harness.calls.alerts.length, 0, 'entering delete mode does not show a confirmation');
  assert.equal(harness.button('pilgrimageRecordsDeleteSelected').props.disabled, true);
  harness.button('cancel').props.onPress();
  harness.render();
  assert.equal(harness.thumbnail('photo-a').props.accessibilityRole, 'button');
  assert.equal(harness.button('pilgrimageRecordsEdit').props.disabled, false);
});

test('normal thumbnails preview images, while delete-mode thumbnails select stable IDs without previewing', async () => {
  const harness = createHarness();
  harness.thumbnail('photo-b').props.onPress();
  harness.render();
  assert.equal(harness.preview().props.images[harness.preview().props.initialIndex].id, 'photo-b');
  harness.button('pilgrimageRecordsEdit').props.onPress();
  harness.render();
  assert.equal(harness.thumbnail('photo-b').props.accessibilityRole, 'button', 'a preview blocks entering edit mode');
  assert.ok(harness.preview());
  assert.equal(harness.calls.alerts.length, 0);
  harness.preview().props.onClose();
  harness.render();
  harness.enterMode();
  const extraData = harness.list.props.extraData;
  harness.selectPhoto('photo-b');
  assert.notStrictEqual(harness.list.props.extraData, extraData, 'FlashList receives changed selection data');
  assert.equal(harness.thumbnail('photo-b').props.accessibilityState.checked, true);
  assert.equal(harness.preview(), undefined);
  harness.requestDelete();
  harness.state.points[0].days[0].photos.reverse();
  harness.render();
  harness.confirm();
  await harness.settle();
  assert.deepEqual(harness.calls.deletes, [
    { pointKey: harness.pointKey, selection: { dateKeys: [], photoIds: ['photo-b'] } },
  ]);
  assert.equal(harness.thumbnail('photo-a').props.accessibilityRole, 'button');
  assert.equal(harness.state.points[0].days[0].photos.length, 1);
});

test('selecting every photo stays mixed until the date is explicitly selected', async () => {
  const harness = createHarness();
  harness.enterMode();
  harness.selectPhoto('photo-a');
  harness.selectPhoto('photo-b');
  assert.equal(harness.day('2026-10-23').props.accessibilityState.checked, 'mixed');
  harness.requestDelete();
  harness.confirm();
  await harness.settle();
  assert.deepEqual(harness.calls.deletes, [
    { pointKey: harness.pointKey, selection: { dateKeys: [], photoIds: ['photo-a', 'photo-b'] } },
  ]);
  assert.ok(harness.state.points[0].days.some((day) => day.dateKey === '2026-10-23' && day.photos.length === 0));
});

test('explicit dates cover their photos and combine with individual photos in one deletion', async () => {
  const harness = createHarness();
  harness.enterMode();
  harness.selectPhoto('photo-a');
  harness.selectDay('2026-10-23');
  harness.selectPhoto('photo-c');
  assert.equal(harness.day('2026-10-23').props.accessibilityState.checked, true);
  assert.equal(harness.thumbnail('photo-a').props.accessibilityState.checked, true);
  assert.equal(harness.thumbnail('photo-b').props.accessibilityState.checked, true);
  const alert = harness.requestDelete();
  assert.match(alert[1], /^pilgrimageRecordsDeleteSelectionConfirm:/);
  assert.match(alert[1], /"days":1/);
  assert.match(alert[1], /"photos":3/);
  harness.confirm();
  await harness.settle();
  assert.deepEqual(harness.calls.deletes, [
    { pointKey: harness.pointKey, selection: { dateKeys: ['2026-10-23'], photoIds: ['photo-c'] } },
  ]);
  assert.equal(
    harness.state.points[0].days.some((day) => day.dateKey === '2026-10-23'),
    false,
  );
  assert.equal(harness.state.points[0].days.find((day) => day.dateKey === '2026-10-22').photos.length, 0);
});

test('deselecting one photo of an explicit date preserves only its other photos and keeps the date', async () => {
  const harness = createHarness();
  harness.enterMode();
  harness.selectDay('2026-10-23');
  harness.selectPhoto('photo-a');
  assert.equal(harness.day('2026-10-23').props.accessibilityState.checked, 'mixed');
  assert.equal(harness.thumbnail('photo-a').props.accessibilityState.checked, false);
  assert.equal(harness.thumbnail('photo-b').props.accessibilityState.checked, true);
  harness.requestDelete();
  harness.confirm();
  await harness.settle();
  assert.deepEqual(harness.calls.deletes, [
    { pointKey: harness.pointKey, selection: { dateKeys: [], photoIds: ['photo-b'] } },
  ]);
  assert.equal(harness.state.points[0].days.find((day) => day.dateKey === '2026-10-23').photos[0].id, 'photo-a');
});

test('select all covers only visible dates, including zero-photo dates, and toggles back to no selection', async () => {
  const harness = createHarness({ startDate: '2026-10-21', endDate: '2026-10-22' });
  harness.enterMode();
  harness.selectAll();
  assert.equal(harness.day('2026-10-21').props.accessibilityState.checked, true);
  assert.equal(harness.day('2026-10-22').props.accessibilityState.checked, true);
  assert.equal(
    harness.nodes.some((node) => node.props.testID === 'pilgrimage-record-day-2026-10-23'),
    false,
  );
  harness.selectAll();
  assert.equal(harness.day('2026-10-21').props.accessibilityState.checked, false);
  assert.equal(harness.thumbnail('photo-c').props.accessibilityState.checked, false);
  assert.equal(harness.button('pilgrimageRecordsDeleteSelected').props.disabled, true);
  harness.selectAll();
  harness.requestDelete();
  harness.confirm();
  await harness.settle();
  const [{ selection }] = harness.calls.deletes;
  assert.deepEqual(selection.dateKeys.sort(), ['2026-10-21', '2026-10-22']);
  assert.deepEqual(selection.photoIds, []);
  assert.deepEqual(
    harness.state.points[0].days.map((day) => day.dateKey),
    ['2026-10-23'],
  );
});

test('cancelling confirmation preserves selection; cancelling mode clears it before the next entry', () => {
  const harness = createHarness();
  harness.enterMode();
  harness.selectPhoto('photo-b');
  harness.requestDelete();
  harness.cancelConfirmation();
  assert.deepEqual(harness.calls.deletes, []);
  assert.equal(harness.thumbnail('photo-b').props.accessibilityState.checked, true);
  harness.button('cancel').props.onPress();
  harness.render();
  harness.enterMode();
  assert.equal(harness.thumbnail('photo-b').props.accessibilityState.checked, false);
  assert.equal(harness.button('pilgrimageRecordsDeleteSelected').props.disabled, true);
});

test('clearing the date filter leaves delete mode and clears the filtered selection', () => {
  const harness = createHarness({ startDate: '2026-10-22', endDate: '2026-10-22' });
  harness.enterMode();
  harness.selectPhoto('photo-c');
  harness.button('pilgrimageRecordsClearFilters').props.onPress();
  harness.render();
  assert.equal(harness.thumbnail('photo-c').props.accessibilityRole, 'button');
  assert.equal(harness.thumbnail('photo-a').props.accessibilityRole, 'button');
  harness.enterMode();
  assert.equal(harness.thumbnail('photo-c').props.accessibilityState.checked, false);
  assert.equal(harness.button('pilgrimageRecordsDeleteSelected').props.disabled, true);
  assert.deepEqual(harness.calls.deletes, []);
});

for (const cleanup of [false, true]) {
  test(`${cleanup ? 'file cleanup' : 'metadata'} failure ${cleanup ? 'exits' : 'preserves'} delete mode`, async () => {
    const harness = createHarness();
    harness.setDeleteError(cleanup ? harness.cleanupError() : new Error('storage write failed'));
    harness.enterMode();
    harness.selectPhoto('photo-b');
    harness.requestDelete();
    harness.confirm();
    await harness.settle();
    const expected = cleanup ? 'pilgrimageRecordsSelectionCleanupFailed' : 'pilgrimageRecordsDeleteFailed';
    assert.equal(harness.calls.alerts.at(-1)[0], expected);
    assert.equal(harness.calls.alerts.at(-1)[1], `${expected}Hint`);
    assert.equal(harness.thumbnail('photo-a').props.disabled, false);
    if (cleanup) {
      assert.equal(harness.thumbnail('photo-a').props.accessibilityRole, 'button');
      assert.equal(
        harness.nodes.some((node) => node.props.testID === 'pilgrimage-record-photo-photo-b'),
        false,
      );
      assert.equal(harness.button('pilgrimageRecordsEdit').props.disabled, false);
    } else {
      assert.equal(harness.thumbnail('photo-b').props.accessibilityState.checked, true);
      assert.equal(harness.button('cancel').props.disabled, false);
      assert.equal(harness.button('pilgrimageRecordsDeleteSelected').props.disabled, false);
    }
    assert.equal(harness.calls.deletes.length, 1);
  });
}

test('busy deletion locks selection, select all, cancel, further confirmation and navigation', async () => {
  const harness = createHarness();
  const release = harness.blockDelete();
  harness.enterMode();
  harness.selectPhoto('photo-b');
  harness.requestDelete();
  harness.confirm();
  assert.equal(harness.thumbnail('photo-a').props.disabled, true);
  assert.equal(harness.day('2026-10-23').props.disabled, true);
  assert.equal(harness.button('cancel').props.disabled, true);
  assert.equal(harness.button('pilgrimageRecordsSelectAll').props.disabled, true);
  assert.equal(harness.button('pilgrimageRecordsDeleteSelected').props.disabled, true);
  const alerts = harness.calls.alerts.length;
  harness.thumbnail('photo-a').props.onPress();
  harness.day('2026-10-23').props.onPress();
  harness.button('pilgrimageRecordsSelectAll').props.onPress();
  harness.button('cancel').props.onPress();
  harness.button('pilgrimageRecordsDeleteSelected').props.onPress();
  assert.equal(harness.back(), true);
  assert.equal(harness.remove(), true);
  assert.equal(harness.thumbnail('photo-a').props.accessibilityState.checked, false);
  assert.equal(harness.thumbnail('photo-b').props.accessibilityState.checked, true);
  assert.equal(harness.calls.deletes.length, 1, 'busy callbacks do not start another service call');
  assert.equal(harness.calls.alerts.length, alerts);
  assert.deepEqual(harness.calls.navigation, []);
  assert.equal(harness.preview(), undefined);
  release();
  await harness.settle();
  assert.equal(harness.thumbnail('photo-a').props.accessibilityRole, 'button');
  assert.equal(harness.thumbnail('photo-a').props.disabled, false);
});

test('hardware and navigation back each consume delete mode once without popping the page', () => {
  const harness = createHarness();
  harness.enterMode();
  harness.selectPhoto('photo-b');
  assert.equal(harness.back(), true);
  assert.equal(harness.thumbnail('photo-b').props.accessibilityRole, 'button');
  assert.deepEqual(harness.calls.navigation, []);
  assert.equal(harness.back(), false);
  harness.enterMode();
  assert.equal(harness.thumbnail('photo-b').props.accessibilityState.checked, false);
  assert.equal(harness.remove(), true);
  assert.equal(harness.thumbnail('photo-b').props.accessibilityRole, 'button');
  assert.deepEqual(harness.calls.navigation, []);
  assert.equal(harness.remove(), false);
  assert.deepEqual(harness.calls.navigation, [['GO_BACK']]);
});

test("an unfocused detail page does not consume another screen's back action", () => {
  const harness = createHarness();
  harness.enterMode();
  harness.setFocused(false);
  assert.equal(harness.back(), false);
  assert.equal(harness.remove(), false);
  harness.setFocused(true);
  assert.equal(harness.back(), true);
  assert.equal(harness.thumbnail('photo-a').props.accessibilityRole, 'button');
});
