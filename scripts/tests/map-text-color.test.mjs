import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/services/map-text-color.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const styleURL = 'mapbox://styles/mapbox/streets-v12';
const point = (properties = {}) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [139, 35] }, properties });
const style = (colors) => ({ version: 8, layers: Object.entries(colors).map(([id, color]) => ({ id, type: 'symbol', paint: { 'text-color': color } })) });

function harness(values = new Map()) {
  const h = { values, now: 1000000000, calls: [], listeners: [], token: 'test-public-token' };
  h.fetch = async () => ({ ok: true, json: async () => style({ 'poi-label': ['match', ['get', 'class'], 'medical', 'hsl(0, 70%, 58%)', 'hsl(210, 20%, 46%)'] }) });
  const modules = {
    '@/lib/map-storage': { subscribeMapCacheInvalidation: (fn) => h.listeners.push(fn) },
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { get mapboxAccessToken() { return h.token; } } } } },
    'expo/fetch': { fetch: (...args) => { h.calls.push(args); return h.fetch(...args); } },
    'react-native-mmkv': { createMMKV: () => ({ getString: (key) => values.get(key), set: (key, value) => values.set(key, value), clearAll: () => values.clear() }) },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, require: (name) => {
      if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
      return modules[name];
    }, AbortController, setTimeout, clearTimeout,
    Date: class extends Date { static now() { return h.now; } },
  });
  return { ...module.exports, h };
}

test('evaluates actual class/network/constant color forms from all five current Mapbox styles', () => {
  const { evaluateMapTextColor: color } = harness();
  // Inspected via Styles API on 2026-11-11. All four supported label layers use
  // constants or match/get; class/network fallbacks must preserve native semantics.
  const streets = ['match', ['get', 'class'], 'food_and_drink', 'hsl(40, 95%, 43%)',
    'park_like', 'hsl(110, 70%, 28%)', 'medical', 'hsl(0, 70%, 58%)',
    ['store_like', 'food_and_drink_stores'], 'hsl(210, 70%, 58%)', 'hsl(210, 20%, 46%)'];
  assert.equal(color(streets, point({ class: 'food_and_drink_stores' }), 17), 'hsl(210, 70%, 58%)');
  assert.equal(color(streets, point({ class: 'medical' }), 17), 'hsl(0, 70%, 58%)');
  assert.equal(color(streets, point(), 17), 'hsl(210, 20%, 46%)');
  const outdoorsTransit = ['match', ['get', 'network'], 'tokyo-metro', 'hsl(180, 30%, 30%)',
    ['barcelona-metro', 'osaka-subway'], 'hsl(0, 57%, 47%)', 'hsl(230, 50%, 60%)'];
  assert.equal(color(outdoorsTransit, point({ network: 'osaka-subway' }), 17), 'hsl(0, 57%, 47%)');
  const satellite = ['match', ['get', 'class'], 'park_like', 'hsl(110, 100%, 85%)', 'hsl(0, 0%, 100%)'];
  assert.equal(color(satellite, point(), 17), 'hsl(0, 0%, 100%)');
  assert.equal(color('hsl(0, 0%, 53%)', point(), 17), 'hsl(0, 0%, 53%)');
  assert.equal(color('hsl(220, 1%, 62%)', point(), 17), 'hsl(220, 1%, 62%)');
});

test('uses zoom and feature properties; unsupported or malformed expressions never guess a color', () => {
  const { evaluateMapTextColor: color } = harness();
  const expression = ['step', ['zoom'], '#123456', 15, ['case', ['==', ['get', 'class'], 'medical'], '#FF0000', '#00FF00']];
  assert.equal(color(expression, point({ class: 'medical' }), 14), '#123456');
  assert.equal(color(expression, point({ class: 'medical' }), 15), '#FF0000');
  assert.equal(color(['coalesce', ['get', 'color'], '#112233'], point(), 15), '#112233');
  for (const bad of [['unknown', '#123456'], ['match'], ['step', ['zoom'], '#123', 20, '#234', 10, '#345'], 'garbage', 123]) {
    assert.equal(color(bad, point(), 15), null);
  }
});

test('prefetch and concurrent color reads deduplicate requests; caches persist without credentials', async () => {
  const first = harness();
  first.prefetchMapStyle(styleURL);
  const result = await Promise.all([
    first.getMapTextColor(styleURL, 'poi-label', point({ class: 'medical' }), 16),
    first.getMapTextColor(styleURL, 'poi-label', point(), 16),
  ]);
  assert.deepEqual(result, ['hsl(0, 70%, 58%)', 'hsl(210, 20%, 46%)']);
  assert.equal(first.h.calls.length, 1);
  assert.equal(new URL(first.h.calls[0][0]).pathname, '/styles/v1/mapbox/streets-v12');
  assert.ok([...first.h.values.values()].every((value) => !value.includes('test-public-token')));
  const restored = harness(first.h.values);
  restored.h.fetch = () => { throw new Error('offline'); };
  assert.equal(await restored.getMapTextColor(styleURL, 'poi-label', point(), 16), result[1]);
  assert.equal(restored.h.calls.length, 0);
});

test('synchronous color reads never request or wait for a missing, stale or in-flight style', async () => {
  const api = harness();
  assert.equal(api.getCachedMapTextColor(styleURL, 'poi-label', point(), 16), null);
  assert.equal(api.h.calls.length, 0);
  let resolve;
  api.h.fetch = () => new Promise((done) => { resolve = done; });
  api.prefetchMapStyle(styleURL);
  assert.equal(api.getCachedMapTextColor(styleURL, 'poi-label', point(), 16), null);
  assert.equal(api.h.calls.length, 1);
  resolve({ ok: true, json: async () => style({ 'poi-label': '#123456' }) });
  await new Promise((done) => setImmediate(done));
  assert.equal(api.getCachedMapTextColor(styleURL, 'poi-label', point(), 16), '#123456');
  api.h.now += 25 * 60 * 60 * 1000;
  assert.equal(api.getCachedMapTextColor(styleURL, 'poi-label', point(), 16), '#123456');
  assert.equal(api.h.calls.length, 1, 'a synchronous stale read does not refresh');
});

test('synchronous reads hydrate persisted colors and honor cache invalidation without fetching', async () => {
  const first = harness();
  await first.getMapTextColor(styleURL, 'poi-label', point(), 16);
  const restored = harness(first.h.values);
  assert.equal(restored.getCachedMapTextColor(styleURL, 'poi-label', point({ class: 'medical' }), 16), 'hsl(0, 70%, 58%)');
  assert.equal(restored.getCachedMapTextColor(styleURL, 'transit-label', point(), 16), null);
  restored.h.listeners[0]();
  assert.equal(restored.getCachedMapTextColor(styleURL, 'poi-label', point(), 16), null);
  assert.equal(restored.h.calls.length, 0);
});

test('different styles and layers remain separate; absent layers return no color', async () => {
  const api = harness();
  api.h.fetch = async (url) => ({ ok: true, json: async () => style({
    'poi-label': url.includes('dark-v11') ? 'hsl(0, 0%, 53%)' : '#123456',
    'airport-label': '#234567',
  }) });
  assert.equal(await api.getMapTextColor(styleURL, 'poi-label', point(), 16), '#123456');
  assert.equal(await api.getMapTextColor(styleURL, 'airport-label', point(), 16), '#234567');
  assert.equal(await api.getMapTextColor('mapbox://styles/mapbox/dark-v11', 'poi-label', point(), 16), 'hsl(0, 0%, 53%)');
  assert.equal(await api.getMapTextColor(styleURL, 'transit-label', point(), 16), null);
  assert.equal(api.h.calls.length, 2);
});

test('failed or invalid stale refresh preserves cached data; subsequent retry can replace it', async () => {
  const api = harness();
  const original = await api.getMapTextColor(styleURL, 'poi-label', point(), 16);
  const persisted = [...api.h.values.values()][0];
  api.h.now += 25 * 60 * 60 * 1000;
  api.h.fetch = async () => ({ ok: true, json: async () => ({ version: 8, layers: [] }) });
  assert.equal(await api.getMapTextColor(styleURL, 'poi-label', point(), 16), original);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal([...api.h.values.values()][0], persisted);
  api.h.now += 61000;
  api.h.fetch = async () => ({ ok: true, json: async () => style({ 'poi-label': '#ABCDEF' }) });
  assert.equal(await api.getMapTextColor(styleURL, 'poi-label', point(), 16), original);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await api.getMapTextColor(styleURL, 'poi-label', point(), 16), '#ABCDEF');
});

test('clear cache aborts downloads and prevents late responses from restoring disk or returning colors', async () => {
  const api = harness();
  let resolve;
  api.h.fetch = () => new Promise((done) => { resolve = done; });
  const result = api.getMapTextColor(styleURL, 'poi-label', point(), 16);
  api.h.listeners[0]();
  assert.equal(api.h.calls[0][1].signal.aborted, true);
  resolve({ ok: true, json: async () => style({ 'poi-label': '#ABCDEF' }) });
  assert.equal(await result, null);
  assert.equal(api.h.values.size, 0);
});

test('missing credentials, unsupported style URLs and request errors fall back without throwing', async () => {
  const api = harness();
  api.h.token = undefined;
  assert.equal(await api.getMapTextColor(styleURL, 'poi-label', point(), 16), null);
  assert.equal(api.h.calls.length, 0);
  api.h.token = 'token';
  assert.equal(await api.getMapTextColor('https://untrusted.example/style', 'poi-label', point(), 16), null);
  api.h.fetch = async () => { throw new Error('offline'); };
  assert.equal(await api.getMapTextColor(styleURL, 'poi-label', point(), 16), null);
  assert.equal(await api.getMapTextColor(styleURL, 'poi-label', point(), 16), null);
  assert.equal(api.h.calls.length, 1, 'throttles repeated failures');
});
