import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const core = require('@tamagui/core');

function loadSource(path, mocks) {
  const source = readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    require: (name) => mocks[name] ?? require(name),
  });
  return module.exports;
}

const {
  default: config,
  PageBackground,
  PageHorizontalInset,
} = loadSource('tamagui.config.ts', {
  tamagui: core,
  'react-native': { Platform: { select: ({ android, default: fallback }) => android ?? fallback } },
  '@tamagui/config/animations-reanimated': { animationsReanimated: { animations: {} } },
});

test('Config v6 resolves the app spacing, compact typography and brand tokens', () => {
  assert.equal(core.getTokenValue('4', 'space'), 16);
  assert.equal(core.getTokenValue('pageHorizontalInset', 'space'), PageHorizontalInset);
  assert.equal(core.getTokenValue('primary', 'color'), '#FB7299');
  assert.equal(core.getTokenValue('neutral-50', 'color'), require('@tamagui/themes').colorTokens['neutral-50']);
  assert.equal(core.getVariableValue(config.fonts.body.size.caption), 10);
  assert.equal(core.getVariableValue(config.fonts.body.size.body), 14);
  assert.equal(core.getVariableValue(config.fonts.heading.size.heading), 22);
});

test('root themes retain the app canvas, native tab indicator and classic colors', () => {
  const themes = core.getThemes();
  for (const [scheme, background, indicator] of [
    ['light', '#FFFFFF', '#FCE8EE'],
    ['dark', '#1C1C1C', '#492834'],
  ]) {
    const theme = themes[scheme];
    assert.equal(core.getVariableValue(theme.pageBackground), PageBackground[scheme]);
    assert.equal(core.getVariableValue(theme.background), background);
    assert.equal(core.getVariableValue(theme.tabBarIndicator), indicator);
    assert.equal(typeof core.getVariableValue(theme['color-12']), 'string');
  }
  assert.equal(core.getVariableValue(themes.dark['background-press']), '#2A2A2A');
});

test('SearchBox keeps its transparent background and ThemeInput disabled color in both themes', () => {
  const { ThemeInput } = loadSource('components/ui/theme-input.tsx', { tamagui: core });
  let scheme;
  let inputProps;
  const captureInput = (type, props) => {
    if (type === ThemeInput) inputProps = props;
    return null;
  };
  const { default: SearchBox } = loadSource('components/ui/search-box.tsx', {
    '@/components/icons': { Search: 'Search', X: 'X' },
    '@/components/ui/theme-input': { ThemeInput },
    'expo-blur': { BlurView: 'BlurView' },
    'expo-router': { useFocusEffect() {} },
    react: { useCallback: (callback) => callback, useRef: (current) => ({ current }) },
    'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
    'react/jsx-runtime': { jsx: captureInput, jsxs: captureInput },
    'react-native': { TouchableWithoutFeedback: 'TouchableWithoutFeedback' },
    tamagui: { useThemeName: () => scheme, View: 'View' },
  });

  // Capture JSX props without mounting native hosts, then run Tamagui's real style resolver.
  for (scheme of ['light', 'dark']) {
    const theme = core.getThemes()[scheme];
    for (const disabled of [false, true]) {
      inputProps = undefined;
      SearchBox({ disabled });
      assert.ok(inputProps);
      const { style } = core.getSplitStyles(
        inputProps,
        ThemeInput.staticConfig,
        theme,
        scheme,
        { unmounted: false, disabled },
        { isAnimated: false, noClass: true, resolveValues: 'value' },
      );
      assert.equal(style.backgroundColor, disabled ? core.getVariableValue(theme['color-3']) : 'transparent');
    }
  }
});
