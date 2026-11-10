import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/utils/nearby-place-appearance.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { getNearbyPlaceColor } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

function luminance(hex) {
  const channels = hex.match(/[\da-f]{2}/gi).map((part) => parseInt(part, 16) / 255);
  const [r, g, b] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('distinguishes fuel and police and prioritizes the specific icon over the broad class', () => {
  assert.equal(getNearbyPlaceColor('fuel', 'motorist', 'light'), '#147A68');
  assert.equal(getNearbyPlaceColor('police', 'commercial_services', 'light'), '#3156A7');
  assert.notEqual(getNearbyPlaceColor('fuel', 'motorist', 'light'), getNearbyPlaceColor('police', undefined, 'light'));
});

test('accepts the same Maki size suffixes as the place icon renderer', () => {
  assert.equal(getNearbyPlaceColor('fuel-15', 'motorist', 'light'), getNearbyPlaceColor('fuel', undefined, 'light'));
  assert.equal(getNearbyPlaceColor(' POLICE-11 ', undefined, 'dark'), getNearbyPlaceColor('police', undefined, 'dark'));
  assert.equal(getNearbyPlaceColor('fuel-10', undefined, 'light'), null);
});

test('uses a known class when a specific icon is missing or unknown', () => {
  assert.equal(getNearbyPlaceColor(undefined, 'medical', 'light'), getNearbyPlaceColor('hospital', undefined, 'light'));
  assert.equal(getNearbyPlaceColor('unknown', 'park_like', 'dark'), getNearbyPlaceColor('park', undefined, 'dark'));
  assert.equal(getNearbyPlaceColor(' FUEL ', undefined, 'light'), getNearbyPlaceColor('fuel', undefined, 'light'));
});

test('unknown categories fall back to the card theme', () => {
  assert.equal(getNearbyPlaceColor(undefined, undefined, 'light'), null);
  assert.equal(getNearbyPlaceColor('missing', '__proto__', 'dark'), null);
});

test('recognized category colors remain legible on light and dark card backgrounds', () => {
  for (const category of ['police', 'fuel', 'park', 'hospital', 'restaurant', 'museum']) {
    const light = getNearbyPlaceColor(category, undefined, 'light');
    const dark = getNearbyPlaceColor(category, undefined, 'dark');
    assert.ok(contrast(light, '#FFFFFF') >= 4.5, `${category} light: ${light}`);
    assert.ok(contrast(dark, '#111111') >= 4.5, `${category} dark: ${dark}`);
  }
});
