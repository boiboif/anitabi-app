import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/app/_layout.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: false,
  },
}).outputText;

function createHarness() {
  const frames = [];
  const timers = [];
  const effects = [];
  const lifecycle = [];
  const events = [];
  let cleanups = [];
  let resolveSplash;
  let rejectSplash;
  const splash = new Promise((resolve, reject) => {
    resolveSplash = resolve;
    rejectSplash = reject;
  });
  const appState = { currentState: 'active' };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    '@/components/plan/plan-picker-provider': { default: 'PlanPickerProvider' },
    '@/hooks/use-app-update-manager': { AppUpdateManagerContext: { Provider: 'AppUpdateManagerProvider' } },
    '@/hooks/use-app-updates': { useAppUpdates: () => ({}) },
    '@/i18n': { default: { changeLanguage() {} }, resolveLanguagePreference: () => 'en' },
    '@/services/sentry': { Sentry: { wrap: (component) => component, captureException() {} } },
    '@/store/use-language-preference': { useLanguagePreference: (select) => select({ preference: 'en' }) },
    '@/store/use-theme-preference': { useThemePreference: (select) => select({ preference: 'light' }) },
    '@/store/use-map-data': {
      useMapData: (select) => select({ initialize: () => events.push('map') }),
      startMapDataRefreshLifecycle(value) {
        assert.equal(value, appState);
        lifecycle.push('attach');
        return () => lifecycle.push('detach');
      },
    },
    '@/store/use-plans': { usePlans: (select) => select({ initializeFirstInstallDemo: () => events.push('demo') }) },
    '@/tamagui.config': { default: {}, PageBackground: { light: '#fff', dark: '#000' } },
    '@boiboif/react-native-toast': { Toast: { config() {} } },
    '@lodev09/react-native-true-sheet': { TrueSheetProvider: 'TrueSheetProvider' },
    '@rnmapbox/maps': { default: { setAccessToken() {} } },
    'expo-constants': { default: { expoConfig: { extra: { mapboxAccessToken: 'test-token' } } } },
    'expo-localization': { useLocales: () => [{ languageTag: 'en' }] },
    'expo-router': {
      DarkTheme: { colors: {} },
      DefaultTheme: { colors: {} },
      Stack: { Screen: 'Screen' },
      ThemeProvider: 'ThemeProvider',
    },
    'expo-splash-screen': {
      hideAsync: () => {
        events.push('hide');
        return splash;
      },
    },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    react: {
      lazy: () => 'AppUpdateOverlay',
      Suspense: 'Suspense',
      useEffect: (setup) => effects.push(setup),
      useRef: (value) => ({ current: value }),
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-i18next': { useTranslation: () => ({ t: (key, options) => options?.defaultValue ?? key }) },
    'react-native': { AppState: appState, useColorScheme: () => 'light' },
    'react-native-gesture-handler': { GestureHandlerRootView: 'RootView' },
    'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider' },
    tamagui: { TamaguiProvider: 'TamaguiProvider' },
  };
  const context = vm.createContext({
    exports: {},
    require(name) {
      assert.ok(name in modules, `Unexpected import ${name}`);
      return modules[name];
    },
    requestAnimationFrame: (callback) => frames.push(callback),
    setTimeout: (callback) => timers.push(callback),
  });
  vm.runInContext(compiled, context);
  const tree = context.exports.default();
  const root = tree.props.children;
  return {
    frames,
    timers,
    lifecycle,
    events,
    layout: () => root.props.onLayout(),
    attach() {
      cleanups = effects.map((setup) => setup());
    },
    detach() {
      for (const cleanup of cleanups) cleanup?.();
      cleanups = [];
    },
    async settleSplash(rejected = false) {
      if (rejected) rejectSplash(new Error('Native splash hide failed'));
      else resolveSplash();
      await Promise.resolve();
      await Promise.resolve();
    },
    runFrame() {
      frames.shift()?.();
    },
    runTimer() {
      timers.shift()?.();
    },
  };
}

test('startup attaches lifecycle and defers map/cache initialization until splash hide, frame and timer', async () => {
  const harness = createHarness();
  harness.attach();
  harness.layout();
  harness.layout();
  assert.deepEqual(harness.events, ['hide']);
  assert.equal(harness.frames.length, 0);
  await harness.settleSplash();
  assert.equal(harness.frames.length, 1);
  assert.equal(harness.timers.length, 0);
  harness.runFrame();
  assert.deepEqual(harness.events, ['hide']);
  assert.equal(harness.timers.length, 1);
  harness.runTimer();
  assert.deepEqual(harness.events, ['hide', 'map', 'demo']);
  harness.detach();
  assert.deepEqual(harness.lifecycle, ['attach', 'detach']);
});

for (const stage of ['splash', 'frame', 'timer']) {
  test(`unmount while awaiting ${stage} prevents late startup from initializing data`, async () => {
    const harness = createHarness();
    harness.attach();
    harness.layout();
    if (stage !== 'splash') await harness.settleSplash();
    if (stage === 'timer') harness.runFrame();
    harness.detach();
    if (stage === 'splash') await harness.settleSplash();
    harness.runFrame();
    harness.runTimer();
    assert.deepEqual(harness.events, ['hide']);
    assert.deepEqual(harness.lifecycle, ['attach', 'detach']);
  });
}

test('Strict Mode effect cleanup and setup retain the pending one-time startup', async () => {
  const harness = createHarness();
  harness.attach();
  harness.layout();
  harness.detach();
  harness.attach();
  harness.layout();
  await harness.settleSplash();
  harness.runFrame();
  harness.runTimer();
  assert.deepEqual(harness.events, ['hide', 'map', 'demo']);
  assert.deepEqual(harness.lifecycle, ['attach', 'detach', 'attach']);
  harness.detach();
});

test('a rejected splash hide still initializes after deferral while mounted', async () => {
  const harness = createHarness();
  harness.attach();
  harness.layout();
  await harness.settleSplash(true);
  harness.runFrame();
  harness.runTimer();
  assert.deepEqual(harness.events, ['hide', 'map', 'demo']);
  harness.detach();
});
