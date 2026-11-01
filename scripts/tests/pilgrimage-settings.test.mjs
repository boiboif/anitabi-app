import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as navigation from '../../src/lib/pilgrimage-navigation.ts';

function loadModule(path, modules) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      assert.ok(name in modules, `Unexpected module: ${name}`);
      return modules[name];
    },
  });
  return exports;
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

function settingsHarness(platform) {
  let saved;
  const writes = [];
  function mount() {
    const { usePilgrimagePreferences } = loadModule('../../src/store/use-pilgrimage-preferences.ts', {
      '@/lib/pilgrimage-navigation': navigation,
      '@/lib/storage': {
        getNavigationMapPreference: () => saved,
        setNavigationMapPreference: (value) => {
          saved = value;
          writes.push(value);
        },
      },
      'react-native': { Platform: { OS: platform } },
      zustand: {
        create(initialize) {
          let state = initialize((patch) => {
            state = { ...state, ...patch };
          });
          return (select) => select(state);
        },
      },
    });
    const jsx = (type, props) => ({ type, props });
    const Screen = loadModule('../../src/app/pilgrimage-settings.tsx', {
      '@/components/ui/settings/setting-cell': { SettingCell: 'SettingCell' },
      '@/components/ui/settings/settings-section': { SettingsSection: 'SettingsSection' },
      '@/lib/pilgrimage-navigation': navigation,
      '@/store/use-pilgrimage-preferences': { usePilgrimagePreferences },
      '@/tamagui.config': { MaxContentWidth: 800 },
      '@tamagui/lucide-icons-2': { Check: 'Check' },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
      'react-native': { Platform: { OS: platform }, ScrollView: 'ScrollView' },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
      tamagui: { Text: 'Text', YStack: 'YStack', useTheme: () => ({ pageBackground: { val: 'white' } }) },
    }).default;
    return () => nodes(Screen()).filter((node) => node.type === 'SettingCell');
  }
  return { mount, writes };
}

for (const [platform, expectedMaps] of [
  ['android', ['googleMaps', 'amap', 'baiduMaps']],
  ['ios', ['googleMaps', 'amap', 'baiduMaps', 'appleMaps']],
]) {
  test(`${platform} settings offers only its supported map choices and persists selection across mounts`, () => {
    const h = settingsHarness(platform);
    const renderRows = h.mount();
    const rows = renderRows();
    assert.deepEqual(
      rows.map((row) => row.props.title),
      expectedMaps,
      'the settings screen contains only map options, without an image-cache entry',
    );
    assert.equal(rows.find((row) => row.props.accessibilityState.checked).props.title, 'googleMaps');
    assert.equal(h.writes.length, 0, 'opening the screen keeps the saved preference untouched');
    const selectedMap = expectedMaps.at(-1);
    rows.find((row) => row.props.title === selectedMap).props.onPress();
    assert.deepEqual(h.writes, [selectedMap]);
    assert.equal(renderRows().find((row) => row.props.accessibilityState.checked).props.title, selectedMap);
    assert.equal(
      h
        .mount()()
        .find((row) => row.props.accessibilityState.checked).props.title,
      selectedMap,
    );
  });
}
