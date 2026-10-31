import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function execute(source, dependencies = {}, globals = {}) {
  const exports = {};
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      assert.ok(name in dependencies, `Unexpected version test dependency: ${name}`);
      return dependencies[name];
    },
    console,
    ...globals,
  });
  return exports;
}

const { createAppVersionInfo } = execute(
  readFileSync(new URL('../../src/services/app-version.ts', import.meta.url), 'utf8'),
);
const oldOtaId = '01a18685-b2ca-7bb6-8788-59b772ce110a';
const nativeInput = {
  configuredVersion: '0.8.0',
  nativeVersion: '0.8.0',
  nativeBuild: '1026',
  updatesEnabled: true,
  isEmbeddedLaunch: true,
  isEmergencyLaunch: false,
  isDevelopment: false,
  channel: 'production',
};
const info = (overrides = {}) => createAppVersionInfo({ ...nativeInput, ...overrides });

test('a legacy bundled app without content metadata keeps its base version', () => {
  const version = info();
  assert.equal(version.displayVersion, '0.8.0');
  assert.equal(version.source, 'embedded');
  assert.equal(version.nativeBuild, '1026');
  assert.equal(version.contentRevision, null);
});

test('an older binary running an OTA identifies the content and keeps its installed build', () => {
  const version = info({ isEmbeddedLaunch: false, contentRevision: 'b2222222', updateId: oldOtaId });
  assert.equal(version.displayVersion, '0.8.0-b2222222');
  assert.equal(version.nativeVersion, '0.8.0');
  assert.equal(version.nativeBuild, '1026');
  assert.equal(version.source, 'hot-update');
  assert.equal(version.updateId, oldOtaId);
});

test('an OTA and its bundled installer share content version while retaining different origins and builds', () => {
  const ota = info({ isEmbeddedLaunch: false, contentRevision: 'b2222222', updateId: oldOtaId });
  const bundled = info({ nativeBuild: '1030', contentRevision: 'b2222222', updateId: 'embedded-id' });
  assert.equal(ota.displayVersion, bundled.displayVersion);
  assert.equal(ota.source, 'hot-update');
  assert.equal(bundled.source, 'embedded');
  assert.equal(ota.nativeBuild, '1026');
  assert.equal(bundled.nativeBuild, '1030');
  assert.equal(bundled.updateId, null, 'an embedded update UUID is not an OTA ID');
});

test('both installer generations show the same later OTA content without changing native builds', () => {
  const older = info({ nativeBuild: '1026', isEmbeddedLaunch: false, contentRevision: 'c3333333', updateId: oldOtaId });
  const newer = info({ nativeBuild: '1030', isEmbeddedLaunch: false, contentRevision: 'c3333333', updateId: oldOtaId });
  assert.equal(older.displayVersion, '0.8.0-c3333333');
  assert.equal(newer.displayVersion, older.displayVersion);
  assert.equal(older.nativeBuild, '1026');
  assert.equal(newer.nativeBuild, '1030');
});

test('an older OTA lacking revision metadata keeps its diagnostic update-ID suffix', () => {
  const version = info({ isEmbeddedLaunch: false, updateId: oldOtaId });
  assert.equal(version.displayVersion, '0.8.0-01a18685');
  assert.equal(version.updateId, oldOtaId);
});

test('emergency fallback describes bundled content and suppresses a stale remote update ID', () => {
  const version = info({
    isEmbeddedLaunch: false,
    isEmergencyLaunch: true,
    contentRevision: 'a1111111',
    updateId: oldOtaId,
  });
  assert.equal(version.displayVersion, '0.8.0-a1111111');
  assert.equal(version.source, 'emergency');
  assert.equal(version.updateId, null);
});

test('disabled updates do not turn a bundled package into an OTA just because flags or IDs are present', () => {
  const version = info({ updatesEnabled: false, isEmbeddedLaunch: false, updateId: oldOtaId });
  assert.equal(version.displayVersion, '0.8.0');
  assert.equal(version.source, 'embedded');
  assert.equal(version.updateId, null);
});

test('local development is explicitly distinguished from a remote OTA', () => {
  const version = info({ isDevelopment: true, isEmbeddedLaunch: false, updateId: oldOtaId });
  assert.equal(version.source, 'development');
  assert.equal(version.displayVersion, '0.8.0');
  assert.equal(version.updateId, null);
});

test('the running content version and native package version come from separate sources', () => {
  const version = info({ configuredVersion: '0.8.1', contentRevision: 'b2222222', isEmbeddedLaunch: false });
  assert.equal(version.baseVersion, '0.8.1');
  assert.equal(version.displayVersion, '0.8.1-b2222222');
  assert.equal(version.nativeVersion, '0.8.0');
  assert.equal(version.nativeBuild, '1026');
});

test('channel remains independently identifiable even when content revisions match', () => {
  const production = info({ contentRevision: 'b2222222' });
  const preview = info({ channel: 'preview', contentRevision: 'b2222222' });
  assert.equal(preview.displayVersion, production.displayVersion);
  assert.equal(preview.channel, 'preview');
  assert.equal(production.channel, 'production');
});

test('a test installer configured for production still runs bundled content', () => {
  const version = info({ channel: 'production', nativeBuild: '5602', contentRevision: 'a1111111' });
  assert.equal(version.source, 'embedded');
  assert.equal(version.channel, 'production');
  assert.equal(version.displayVersion, '0.8.0-a1111111');
});

for (const [name, contentRevision] of [
  ['absent', undefined],
  ['null', null],
  ['empty', ''],
  ['whitespace', '  '],
  ['non-string', 12345678],
  ['too short', 'abcdef'],
  ['too long', 'a'.repeat(41)],
  ['non-hex', 'revision-z'],
]) {
  test(`a ${name} content revision safely falls back to the active OTA ID`, () => {
    const version = info({ isEmbeddedLaunch: false, updateId: oldOtaId, contentRevision });
    assert.equal(version.contentRevision, null);
    assert.equal(version.displayVersion, '0.8.0-01a18685');
  });
}

test('revision normalization accepts full Git SHAs while keeping the visible suffix compact', () => {
  const revision = `ABCDEF12${'3'.repeat(32)}`;
  const version = info({ contentRevision: ` ${revision} ` });
  assert.equal(version.contentRevision, revision.toLowerCase());
  assert.equal(version.displayVersion, '0.8.0-abcdef12');
});

test('a seven-character Git revision remains valid without adding padding', () => {
  assert.equal(info({ contentRevision: 'abcdef1' }).displayVersion, '0.8.0-abcdef1');
});

test('missing native fields stay unknown instead of inheriting OTA-supplied binary metadata', () => {
  const version = info({ nativeVersion: null, nativeBuild: null, contentRevision: 'a1111111' });
  assert.equal(version.displayVersion, '0.8.0-a1111111');
  assert.equal(version.nativeVersion, null);
  assert.equal(version.nativeBuild, null);
});

test('iOS build strings retain their original representation', () => {
  assert.equal(info({ nativeBuild: '2026.10.31' }).nativeBuild, '2026.10.31');
});

test('a blank content version falls back to the native version', () => {
  assert.equal(info({ configuredVersion: '  ', nativeVersion: '0.7.0' }).displayVersion, '0.7.0');
});

test('fully missing version metadata uses the supplied localized unknown label', () => {
  const version = info({ configuredVersion: null, nativeVersion: null, nativeBuild: null, unknownVersion: 'Unknown' });
  assert.equal(version.displayVersion, 'Unknown');
  assert.equal(version.nativeVersion, null);
  assert.equal(version.nativeBuild, null);
  assert.ok(!version.displayVersion.includes('undefined'));
});

test('an OTA without an update ID still has a safe version and accurate source', () => {
  const version = info({ isEmbeddedLaunch: false, updateId: '  ' });
  assert.equal(version.displayVersion, '0.8.0');
  assert.equal(version.updateId, null);
  assert.equal(version.source, 'hot-update');
});

// Execute the installed SDK 58 Constants getter to verify that an embedded
// app.config and a running OTA's expoClient.extra are different metadata sources.
function expoConstants(embeddedConfig, nativeUpdates) {
  return execute(readFileSync(new URL('../../node_modules/expo-constants/src/Constants.ts', import.meta.url), 'utf8'), {
    'expo-modules-core': {
      requireOptionalNativeModule: () => nativeUpdates,
      CodedError: class extends Error {},
    },
    'react-native': { Platform: { OS: 'android' }, NativeModules: {} },
    './ExponentConstants': {
      __esModule: true,
      default: { manifest: JSON.stringify(embeddedConfig), executionEnvironment: 'standalone' },
    },
    './Constants.types': {
      ExecutionEnvironment: { Bare: 'bare', StoreClient: 'storeClient', Standalone: 'standalone' },
    },
  }).default;
}

function otaManifest(contentRevision, id = oldOtaId) {
  return { id, metadata: {}, extra: { expoClient: { version: '0.8.0', extra: { contentRevision } } } };
}

test('SDK 58 Constants reads embedded content metadata from the binary app.config', () => {
  const embedded = { version: '0.8.0', extra: { contentRevision: 'a1111111' } };
  const constants = expoConstants(embedded, { isEmbeddedLaunch: true, manifest: { id: 'embedded-id' } });
  assert.equal(constants.expoConfig.extra.contentRevision, 'a1111111');
  assert.equal(info({ contentRevision: constants.expoConfig.extra.contentRevision }).displayVersion, '0.8.0-a1111111');
});

test('SDK 58 Constants reads applied OTA content metadata from manifest.extra.expoClient.extra', () => {
  const embedded = { version: '0.8.0', extra: { contentRevision: 'a1111111' }, android: { versionCode: 1030 } };
  const constants = expoConstants(embedded, { isEmbeddedLaunch: false, manifest: otaManifest('b2222222') });
  const version = info({
    configuredVersion: constants.expoConfig.version,
    contentRevision: constants.expoConfig.extra.contentRevision,
    isEmbeddedLaunch: false,
  });
  assert.equal(version.displayVersion, '0.8.0-b2222222');
  assert.equal(version.nativeBuild, '1026');
});

test('downloaded candidate metadata cannot replace the running version until a new JS runtime starts', () => {
  const embedded = { version: '0.8.0', extra: { contentRevision: 'a1111111' } };
  const nativeUpdates = { isEmbeddedLaunch: false, manifestString: JSON.stringify(otaManifest('b2222222')) };
  const running = expoConstants(embedded, nativeUpdates);
  const candidate = otaManifest('c3333333', 'next-ota-id');
  // Even a newer native manifest value is not the module's captured running manifest.
  nativeUpdates.manifestString = JSON.stringify(candidate);
  assert.equal(running.expoConfig.extra.contentRevision, 'b2222222');
  const reloaded = expoConstants(embedded, nativeUpdates);
  assert.equal(reloaded.expoConfig.extra.contentRevision, 'c3333333');
});

function renderScreens(versionInfo, language = 'zh', updateManager = {}) {
  const messages = execute(
    readFileSync(new URL(`../../src/i18n/translations/${language}.ts`, import.meta.url), 'utf8'),
  ).default;
  const alerts = [];
  let now = 10_000;
  class Clock extends Date {
    static now() {
      return now;
    }
  }
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    '@/components/ui/settings/setting-cell': { SettingCell: 'SettingCell' },
    '@/components/ui/settings/settings-section': { SettingsSection: 'SettingsSection' },
    '@/lib/app-cache': { clearAppCache: async () => {} },
    '@/hooks/use-app-update-manager': { useAppUpdateManager: () => updateManager },
    '@/i18n/messages': { translateMessage: (_t, value) => value.defaultValue },
    '@/services/app-update': {
      areAppUpdatesEnabled: () => true,
      getBinaryUpdateDisplayVersion: () => '0.9.0',
      getCurrentAppDisplayVersion: () => versionInfo.displayVersion,
      getCurrentAppVersionInfo: () => versionInfo,
    },
    '@/tamagui.config': { BottomTabInset: 0, MaxContentWidth: 600, TopLevelPageTopPadding: 12 },
    'expo-router/react-navigation': { HeaderTitle: 'HeaderTitle' },
    '@tamagui/lucide-icons-2': new Proxy({}, { get: (_target, name) => name }),
    'expo-linking': { openURL: async () => {} },
    'expo-router': { router: { navigate() {} }, Stack: { Screen: 'Stack.Screen' } },
    react: { useState: (initial) => [initial, () => {}], useRef: (initial) => ({ current: initial }) },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-i18next': {
      useTranslation: () => ({
        i18n: { resolvedLanguage: language },
        t(key, options = {}) {
          const value = messages[key] ?? options.defaultValue ?? key;
          return value.replace(/\{\{(\w+)\}\}/g, (_match, name) => String(options[name] ?? ''));
        },
      }),
    },
    'react-native': {
      Alert: { alert: (...args) => alerts.push(args) },
      Platform: { select: (values) => values.android },
      Pressable: 'Pressable',
      ScrollView: 'ScrollView',
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) },
    tamagui: { Text: 'Text', View: 'View', useTheme: () => ({}) },
  };
  const render = (file) =>
    execute(readFileSync(new URL(`../../src/app/${file}`, import.meta.url), 'utf8'), dependencies, {
      Date: Clock,
    }).default();
  function nodes(node) {
    if (node == null || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  const profile = nodes(render('(tabs)/profile.tsx'));
  const about = nodes(render('about.tsx'));
  return {
    profile: profile.filter((node) => node.type === 'SettingCell').map((node) => node.props),
    about: about.filter((node) => node.type === 'SettingCell').map((node) => node.props),
    messages,
    alerts,
    advanceTime: (milliseconds) => {
      now += milliseconds;
    },
    tapTitle() {
      const screen = about.find((node) => node.type === 'Stack.Screen');
      assert.equal(typeof screen?.props.options.headerTitle, 'function', 'About has an interactive header title');
      const title = screen.props.options.headerTitle({ children: messages.about, tintColor: '#123456' });
      const pressable = nodes(title).find((node) => typeof node.props?.onPress === 'function');
      assert.ok(pressable, 'the header title exposes a press handler');
      pressable.props.onPress();
    },
  };
}

function tapTitleRepeatedly(screens, count = 5, interval = 200) {
  for (let index = 0; index < count; index += 1) {
    screens.tapTitle();
    screens.advanceTime(interval);
  }
}

function lastVersionAlert(screens) {
  assert.ok(screens.alerts.length > 0, 'the title gesture opens the version dialog');
  return screens.alerts.at(-1).slice(0, 2).join('\n');
}

test('Profile and About show the same content version without exposing diagnostic details on the page', () => {
  const version = info({ contentRevision: 'b2222222', isEmbeddedLaunch: false, updateId: oldOtaId });
  const screens = renderScreens(version);
  const profile = screens.profile.find((cell) => cell.title === '关于');
  const about = screens.about.find((cell) => cell.title === '检查更新');
  assert.equal(profile.value, 'v0.8.0-b2222222');
  assert.equal(about.value, profile.value);
  assert.equal(about.description, screens.messages.checkForTheLatestVersion);
  assert.ok(!about.description.includes('运行来源'));
  assert.ok(!about.description.includes('1026'));
  assert.ok(!about.description.includes(oldOtaId));
  assert.equal(screens.alerts.length, 0);
});

test('five consecutive title taps reveal the current content version and real OTA/native identity', () => {
  const screens = renderScreens(info({ contentRevision: 'b2222222', isEmbeddedLaunch: false, updateId: oldOtaId }));
  tapTitleRepeatedly(screens, 4);
  assert.equal(screens.alerts.length, 0, 'the first four taps keep diagnostics hidden');
  screens.tapTitle();
  assert.equal(screens.alerts.length, 1);
  const details = lastVersionAlert(screens);
  assert.ok(details.includes('0.8.0-b2222222'));
  assert.match(details, /运行来源：热更新/);
  assert.match(details, /安装包：0\.8\.0（构建 1026）/);
  assert.ok(details.includes(`OTA ID：${oldOtaId}`));
});

test('the hidden dialog reports a bundled installer build without labelling its UUID as an OTA', () => {
  const screens = renderScreens(info({ contentRevision: 'b2222222', nativeBuild: '1030', updateId: 'embedded-id' }));
  const about = screens.about.find((cell) => cell.title === '检查更新');
  assert.equal(about.description, screens.messages.checkForTheLatestVersion);
  tapTitleRepeatedly(screens);
  const details = lastVersionAlert(screens);
  assert.match(details, /运行来源：整包内置/);
  assert.match(details, /构建 1030/);
  assert.ok(!details.includes('OTA ID'));
  assert.ok(!details.includes('embedded-id'));
});

for (const language of ['en', 'ja']) {
  test(`the hidden About dialog translates version origin and binary details in ${language}`, () => {
    const screens = renderScreens(
      info({ contentRevision: 'b2222222', isEmbeddedLaunch: false, updateId: oldOtaId }),
      language,
    );
    const about = screens.about.find((cell) => cell.title === screens.messages.checkForUpdates);
    assert.equal(about.description, screens.messages.checkForTheLatestVersion);
    tapTitleRepeatedly(screens);
    const details = lastVersionAlert(screens);
    assert.equal(screens.alerts[0][0], screens.messages.about);
    assert.ok(details.includes(screens.messages.currentVersionVVersion.replace('{{version}}', '0.8.0-b2222222')));
    assert.ok(details.includes(screens.messages.versionSourceHotUpdate));
    assert.ok(details.includes('1026'));
    assert.ok(details.includes(oldOtaId));
    assert.ok(!details.includes('运行来源'));
  });
}

for (const [source, overrides] of [
  ['Emergency', { isEmergencyLaunch: true, isEmbeddedLaunch: false }],
  ['Development', { isDevelopment: true }],
]) {
  test(`the hidden About dialog accurately identifies the ${source.toLowerCase()} source`, () => {
    const screens = renderScreens(info({ contentRevision: 'a1111111', updateId: oldOtaId, ...overrides }));
    tapTitleRepeatedly(screens);
    const details = lastVersionAlert(screens);
    assert.ok(details.includes(screens.messages[`versionSource${source}`]));
    assert.ok(!details.includes(oldOtaId));
  });
}

test('a gap longer than one second resets the consecutive title taps', () => {
  const screens = renderScreens(info({ contentRevision: 'a1111111' }));
  tapTitleRepeatedly(screens, 4);
  screens.advanceTime(1_001);
  tapTitleRepeatedly(screens, 4);
  assert.equal(screens.alerts.length, 0, 'four old taps cannot combine with four taps after a timeout');
  screens.tapTitle();
  assert.equal(screens.alerts.length, 1);
});

test('title taps exactly one second apart still form a consecutive gesture', () => {
  const screens = renderScreens(info());
  tapTitleRepeatedly(screens, 5, 1_000);
  assert.equal(screens.alerts.length, 1);
});

test('revealing version details resets the title gesture before another dialog can open', () => {
  const screens = renderScreens(info());
  tapTitleRepeatedly(screens);
  assert.equal(screens.alerts.length, 1);
  tapTitleRepeatedly(screens, 4);
  assert.equal(screens.alerts.length, 1);
  screens.tapTitle();
  assert.equal(screens.alerts.length, 2);
});

test('About preserves the existing binary-update action while hiding diagnostics from its description', () => {
  let binaryDialogs = 0;
  const screens = renderScreens(info({ contentRevision: 'a1111111' }), 'zh', {
    binaryUpdate: { version: '0.9.0' },
    showBinaryUpdate: () => binaryDialogs++,
  });
  const about = screens.about.find((cell) => cell.title === '检查更新');
  assert.equal(about.value, '可更新');
  assert.ok(about.description.includes('发现新版本 v0.9.0'));
  assert.ok(!about.description.includes('构建 1026'));
  assert.ok(!about.description.includes('运行来源'));
  assert.equal(typeof about.onPress, 'function');
  about.onPress();
  assert.equal(binaryDialogs, 1);
  assert.equal(screens.alerts.length, 0, 'the update row retains its update action');
});
