import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/utils/map-text-contrast.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports });
const { getReadableMapTextColor } = module.exports;

function luminance(hex) {
  const linear = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function assertReadable(result, background) {
  assert.match(result, /^#[0-9a-f]{6}$/i);
  const a = luminance(result);
  const b = luminance(background);
  assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, `${result} must be readable on ${background}`);
}

test('satellite white labels become readable on a light card and stay white on a dark card', () => {
  for (const color of ['white', '#fff', '#ffffff', 'rgb(255, 255, 255)', 'hsl(0, 0%, 100%)']) {
    assertReadable(getReadableMapTextColor(color, '#ffffff'), '#ffffff');
    assert.equal(getReadableMapTextColor(color, '#121212'), color);
  }
});

test('already readable category colors retain their original spelling and hue', () => {
  for (const color of ['#3156A7', 'rgb(49, 86, 167)', 'hsl(221, 55%, 35%)', 'black']) {
    assert.equal(getReadableMapTextColor(color, '#ffffff'), color);
  }
  assert.equal(getReadableMapTextColor('#75D9C2', '#121212'), '#75D9C2');
});

test('insufficient category colors adjust to meet the threshold on light and dark backgrounds', () => {
  for (const background of ['#ffffff', '#121212', '#777777']) {
    for (const color of ['#777777', '#548c99', '#5d4277', '#ffffff', '#000000']) {
      assertReadable(getReadableMapTextColor(color, background), background);
    }
  }
  const green = getReadableMapTextColor('#75d9c2', '#ffffff');
  assert.ok(parseInt(green.slice(3, 5), 16) > parseInt(green.slice(1, 3), 16), 'adjustment preserves the green category');
});

test('transparent labels are composited against the card before contrast correction', () => {
  for (const color of ['#0008', '#00000080', 'rgba(0, 0, 0, 0.5)', 'rgb(0 0 0 / 50%)', 'hsla(0, 0%, 0%, .5)', 'transparent']) {
    assertReadable(getReadableMapTextColor(color, '#ffffff'), '#ffffff');
  }
});

test('chooses the smaller adjustment when both black and white can meet contrast', () => {
  const background = '#757575';
  const light = getReadableMapTextColor('#eeeeee', background);
  const dark = getReadableMapTextColor('#222222', background);
  assertReadable(light, background);
  assertReadable(dark, background);
  assert.ok(parseInt(light.slice(1, 3), 16) > 238, 'a pale label moves slightly toward white');
  assert.ok(parseInt(dark.slice(1, 3), 16) < 34, 'a dark label moves slightly toward black');
});

test('supports percentage RGB, CSS hue units, wrapping and opaque alpha', () => {
  assert.equal(getReadableMapTextColor('rgb(0% 0% 0% / 100%)', 'white'), 'rgb(0% 0% 0% / 100%)');
  for (const color of ['hsl(240deg 100% 20%)', 'hsl(.6666666667turn 100% 20%)', 'hsl(4.1887902rad 100% 20%)', 'hsl(266.6667grad 100% 20%)', 'hsl(-120 100% 20%)']) {
    assert.equal(getReadableMapTextColor(color, '#fff'), color);
  }
});

test('invalid or unsupported colors and non-opaque backgrounds return null for theme fallback', () => {
  for (const color of ['', '#12', '#ggg', 'rgb(1,2)', 'rgb(1,2,3 / .5)', 'rgb(1 2 3 4)', 'hsl(10,20,30)', 'hsl(1e308turn, 50%, 50%)', 'rgb(Infinity,0,0)', 'var(--label)', 'currentColor', 'red']) {
    assert.equal(getReadableMapTextColor(color, '#ffffff'), null, color);
  }
  assert.equal(getReadableMapTextColor('white', 'rgba(0,0,0,.5)'), null);
  assert.equal(getReadableMapTextColor('white', 'invalid'), null);
});
