import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const WORLD = '250616-world-lite-fixed';
const CHINA = '250617-china-provine-fixed';
const names = [WORLD, CHINA, '250616-ddfk-outline'];
const harness = {
  values: new Map(),
  listeners: new Set(),
  fetches: [],
  fetch: null,
};
globalThis.__administrativeRegionTest = harness;

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react-native-mmkv') return { url: 'admin-test:mmkv', shortCircuit: true };
    if (specifier === 'expo/fetch') return { url: 'admin-test:fetch', shortCircuit: true };
    if (specifier === '@/lib/map-storage') return { url: 'admin-test:storage', shortCircuit: true };
    if (specifier === '@/services/handlers') return { url: 'admin-test:handlers', shortCircuit: true };
    if (specifier === '@/utils/administrative-boundaries') {
      return { url: new URL('../../src/utils/administrative-boundaries.ts', import.meta.url).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    const prefix = 'const h = globalThis.__administrativeRegionTest;';
    const modules = {
      'admin-test:mmkv': `${prefix} export const createMMKV = () => ({ getString: key => h.values.get(key), set: (key, value) => h.values.set(key, value), remove: key => h.values.delete(key) });`,
      'admin-test:fetch': `${prefix} export const fetch = (...args) => h.fetch(...args);`,
      'admin-test:storage': `${prefix} export const subscribeMapCacheInvalidation = listener => { h.listeners.add(listener); return () => h.listeners.delete(listener); };`,
      'admin-test:handlers': 'export const baseUrl = "https://www.anitabi.cn";',
    };
    if (url in modules) return { format: 'module', source: modules[url], shortCircuit: true };
    return next(url, context);
  },
});

function topology(name, properties) {
  return { type: 'Topology', arcs: [[[100, 20], [110, 20], [110, 30], [100, 30], [100, 20]]],
    objects: { [name]: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', properties, arcs: [[0]] }] } } };
}
const fixtures = { [WORLD]: topology(WORLD, { n: '中国' }), [CHINA]: topology(CHINA, { p: '广东省' }) };
function response(value) { return { ok: true, json: async () => value }; }
async function waitFor(predicate) {
  for (let i = 0; i < 100 && !predicate(); i++) await new Promise((resolve) => setTimeout(resolve, 2));
  assert.ok(predicate(), 'timed out waiting for boundary lookup');
}
let scope = 0;
async function loadService() {
  const url = new URL('../../src/services/administrative-region.ts', import.meta.url);
  url.searchParams.set('test', String(++scope));
  return import(url.href);
}
function reset() {
  harness.values = new Map();
  harness.listeners = new Set();
  harness.fetches = [];
  harness.fetch = async (url) => {
    const name = names.find((item) => url.includes(item));
    harness.fetches.push(name);
    return response(fixtures[name]);
  };
}

test('downloads each needed boundary once, caches, and reuses it offline', async () => {
  reset();
  const { observeAdministrativeRegion } = await loadService();
  const results = [];
  const stop = observeAdministrativeRegion([25, 105], (value) => results.push(value));
  await waitFor(() => results.includes('中国 广东省'));
  assert.deepEqual(harness.fetches, [WORLD, CHINA]);
  assert.equal(harness.values.size, 2);
  stop();

  harness.listeners = new Set();
  harness.fetches = [];
  harness.fetch = async () => { throw new Error('offline'); };
  const restarted = await loadService();
  const cached = [];
  const stopCached = restarted.observeAdministrativeRegion([25, 105], (value) => cached.push(value));
  await waitFor(() => cached.includes('中国 广东省'));
  assert.equal(harness.fetches.length, 0, 'fresh cache requires no request');
  stopCached();
});

test('failed background refresh keeps older valid cached data', async () => {
  reset();
  for (const name of [WORLD, CHINA]) harness.values.set(name, JSON.stringify({ fetchedAt: 1, topology: fixtures[name] }));
  harness.fetch = async (url) => { harness.fetches.push(url); throw new Error('offline'); };
  const { observeAdministrativeRegion } = await loadService();
  const results = [];
  const stop = observeAdministrativeRegion([25, 105], (value) => results.push(value));
  await waitFor(() => results.includes('中国 广东省') && harness.fetches.length === 2);
  assert.equal(harness.values.size, 2);
  stop();
});

test('invalid refreshed topology does not overwrite cached boundaries', async () => {
  reset();
  for (const name of [WORLD, CHINA]) harness.values.set(name, JSON.stringify({ fetchedAt: 1, topology: fixtures[name] }));
  const before = new Map(harness.values);
  harness.fetch = async (url) => { harness.fetches.push(url); return response({ type: 'Topology', arcs: [], objects: {} }); };
  const { observeAdministrativeRegion } = await loadService();
  const results = [];
  const stop = observeAdministrativeRegion([25, 105], (value) => results.push(value));
  await waitFor(() => results.includes('中国 广东省') && harness.fetches.length === 2);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(harness.values, before);
  stop();
});

test('clearing cache cancels an in-flight response and prevents stale writes', async () => {
  reset();
  let finish;
  harness.fetch = () => new Promise((resolve) => { finish = resolve; });
  const { observeAdministrativeRegion } = await loadService();
  const results = [];
  const stop = observeAdministrativeRegion([25, 105], (value) => results.push(value));
  await waitFor(() => typeof finish === 'function');
  for (const listener of harness.listeners) listener();
  finish(response(fixtures[WORLD]));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(harness.values.size, 0);
  assert.deepEqual(results, []);
  stop();
});

process.on('exit', () => hooks.deregister());
