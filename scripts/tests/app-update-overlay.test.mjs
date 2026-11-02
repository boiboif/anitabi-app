import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(
  readFileSync(new URL('../../src/components/app-update-overlay.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
const jsx = (type, props) => ({ type, props });
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

// Exercise the actual rendered content and actions; native layout needs device validation.
function render(platform, overrides = {}) {
  const calls = [];
  const manager = {
    binaryUpdate: { version: '0.9.0', releaseNotesHistory: [{}] },
    isBinaryUpdateVisible: true,
    hotUpdateReady: false,
    isDownloadingBinary: false,
    isBinaryDownloaded: false,
    binaryProgress: null,
    downloadBinaryUpdateInBrowser: () => calls.push('browser'),
    installBinaryUpdate: () => calls.push('install'),
    reloadForHotUpdate: () => calls.push('reload'),
    dismissBinaryUpdate: () => calls.push('dismiss'),
    dismissHotUpdate: () => calls.push('dismiss-hot'),
    ...overrides,
  };
  const modules = {
    '@/components/ui/strict-button': { StrictButton: 'Button' },
    '@/services/app-update': {
      getBinaryUpdateDisplayVersion: () => '0.9.0',
      getCurrentAppDisplayVersion: () => '0.8.0',
      isMandatoryUpdate: () => false,
    },
    '@/services/release-notes': {
      getApplicableReleaseNotes: () => [{ version: '0.9.0', displayVersion: '0.9.0', notes: 'New features' }],
    },
    'expo-application': { nativeApplicationVersion: '0.8.0', nativeBuildVersion: '1026' },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-i18next': { useTranslation: () => ({ t: (_key, options) => options.defaultValue }) },
    'react-native': { Platform: { OS: platform }, Modal: 'Modal', ScrollView: 'ScrollView' },
    tamagui: { Text: 'Text', View: 'View', XStack: 'XStack', YStack: 'YStack', Progress: 'Progress' },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      assert.ok(name in modules, `Unexpected import: ${name}`);
      return modules[name];
    },
  });
  const rendered = nodes(exports.AppUpdateOverlay({ manager }));
  return { calls, rendered, buttons: rendered.filter((node) => node.type === 'Button') };
}

test('iOS shows sideload instructions alongside release notes and opens the download page', () => {
  const { calls, rendered, buttons } = render('ios', { binaryDownloadError: 'Cannot open browser' });
  const text = rendered.filter((node) => node.type === 'Text').map((node) => node.props.children);
  assert.ok(text.includes('New features'));
  assert.ok(text.some((value) => typeof value === 'string' && value.includes('重新签名侧载')));
  assert.ok(text.includes('Cannot open browser'));
  assert.deepEqual(
    buttons.map((node) => node.props.children),
    ['稍后', '前往下载页'],
  );
  buttons[1].props.onPress();
  buttons[0].props.onPress();
  assert.deepEqual(calls, ['browser', 'dismiss']);
  assert.ok(rendered.every((node) => node.type !== 'Progress'));
});

test('Android retains APK browser download and installation actions', () => {
  const { calls, buttons } = render('android');
  assert.deepEqual(
    buttons.map((node) => node.props.children),
    ['稍后', '浏览器下载', '立即更新'],
  );
  buttons[2].props.onPress();
  assert.deepEqual(calls, ['install']);
});

test('iOS OTA updates retain restart action without sideload instructions', () => {
  const { calls, rendered, buttons } = render('ios', {
    binaryUpdate: null,
    isBinaryUpdateVisible: false,
    hotUpdateReady: true,
  });
  assert.deepEqual(
    buttons.map((node) => node.props.children),
    ['稍后', '重启更新'],
  );
  assert.ok(rendered.every((node) => typeof node.props.children !== 'string' || !node.props.children.includes('侧载')));
  buttons[1].props.onPress();
  assert.deepEqual(calls, ['reload']);
});
