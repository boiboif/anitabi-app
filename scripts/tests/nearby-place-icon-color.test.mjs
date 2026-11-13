import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../../src/components/map/nearby-place-icon.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const jsx = (type, props) => ({ type, props });
const modules = {
  'react/jsx-runtime': { jsx, jsxs: jsx },
  tamagui: { View: 'View' },
  'expo-image': { Image: 'Image' },
  '@tamagui/lucide-icons-2': { Shield: 'Shield', Fuel: 'Fuel' },
};
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, require(name) {
  assert.ok(name in modules, `A prepared icon must not subscribe to loading state: ${name}`);
  return modules[name];
} });
const Icon = module.exports.default;

test('the initial icon frame contains the decoded source without a temporary fallback or color callback', () => {
  const source = { nativeRef: 'police' };
  const asset = { source, color: '#536ace', width: 16, height: 16 };
  const icon = Icon({ name: 'police', color: '#536ace', asset });
  const image = icon.props.children;
  assert.equal(image.type, 'Image');
  assert.equal(image.props.source, source);
  assert.equal(image.props.transition, 0);
  assert.equal(image.props.onLoad, undefined);
  assert.equal(image.props.tintColor, undefined, 'white artwork remains intact');
  assert.equal(icon.props.width, 16);
});

test('switching icons renders only the new decoded source; a failed preparation uses the final fallback immediately', () => {
  const police = { source: { nativeRef: 'police' }, color: '#536ace', width: 16, height: 16 };
  const fuel = { source: { nativeRef: 'fuel' }, color: '#18949a', width: 16, height: 16 };
  assert.equal(Icon({ name: 'police', color: police.color, asset: police }).props.children.props.source, police.source);
  assert.equal(Icon({ name: 'fuel', color: fuel.color, asset: fuel }).props.children.props.source, fuel.source);
  const fallback = Icon({ name: 'unknown', fallbackName: 'police', color: '#123456', asset: null });
  assert.equal(fallback.type, 'Shield');
  assert.equal(fallback.props.color, '#123456');
  assert.equal(Icon({ name: 'unknown', color: '#123456', asset: null }), null);
});
