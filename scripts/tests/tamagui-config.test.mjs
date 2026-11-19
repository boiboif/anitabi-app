import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const core = require('@tamagui/core');
const source = readFileSync(new URL('../../src/tamagui.config.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const module = { exports: {} };
const nativeModules = {
  tamagui: core,
  'react-native': { Platform: { select: ({ android, default: fallback }) => android ?? fallback } },
  '@tamagui/config/animations-reanimated': { animations: { animations: {} } },
};
vm.runInNewContext(outputText, {
  module,
  exports: module.exports,
  require: (name) => nativeModules[name] ?? require(name),
});
const { default: config, PageBackground, PageHorizontalInset } = module.exports;

test('Config v6 resolves the app spacing, compact typography and brand tokens', () => {
  assert.equal(core.getTokenValue('4', 'space'), 16);
  assert.equal(core.getTokenValue('pageHorizontalInset', 'space'), PageHorizontalInset);
  assert.equal(core.getTokenValue('primary', 'color'), '#FB7299');
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
