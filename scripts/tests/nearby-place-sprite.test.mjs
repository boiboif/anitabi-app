import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

const h = { values: new Map(), files: new Map(), listeners: new Set(), fetch: null, download: null };
globalThis.__nearbySpriteTest = h;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const mocks = {
      'react-native-mmkv': 'sprite-test:mmkv',
      'expo/fetch': 'sprite-test:fetch',
      'expo-file-system': 'sprite-test:fs',
      '@/lib/map-storage': 'sprite-test:storage',
      '@/services/handlers': 'sprite-test:handlers',
    };
    return mocks[specifier] ? { url: mocks[specifier], shortCircuit: true } : next(specifier, context);
  },
  load(url, context, next) {
    const prefix = 'const h = globalThis.__nearbySpriteTest;';
    const modules = {
      'sprite-test:mmkv': `${prefix} export const createMMKV = () => ({ getString: k => h.values.get(k), set: (k,v) => h.values.set(k,v), remove: k => h.values.delete(k) });`,
      'sprite-test:fetch': `${prefix} export const fetch = (...args) => h.fetch(...args);`,
      'sprite-test:storage': `${prefix} export const subscribeMapCacheInvalidation = cb => { h.listeners.add(cb); return () => h.listeners.delete(cb); };`,
      'sprite-test:handlers': 'export const baseUrl = "https://www.anitabi.cn";',
      'sprite-test:fs': `${prefix}
        export const Paths = { document: 'document' };
        export class Directory {
          constructor(root, name) { this.uri = root + '/' + name; }
          get exists() { return true; } create() {}
          delete() { for (const key of h.files.keys()) if (key.startsWith(this.uri + '/')) h.files.delete(key); }
        }
        export class File {
          constructor(parent, name) { this.uri = typeof parent === 'string' ? parent : parent.uri + '/' + name; }
          get exists() { return h.files.has(this.uri); } async bytes() { return h.files.get(this.uri); }
          delete() { h.files.delete(this.uri); }
          static downloadFileAsync(url, file, options) { return h.download(url, file, options); }
        }`,
    };
    return url in modules ? { format: 'module', source: modules[url], shortCircuit: true } : next(url, context);
  },
});

const csv = 'fuel,352,742,32,32\npolice,548,902,32,32\n';
function png(width = 1024, height = 1082) {
  const result = new Uint8Array(24);
  result.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(result.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return result;
}
function reset() {
  h.values = new Map();
  h.files = new Map();
  h.listeners = new Set();
  h.fetches = [];
  h.downloads = [];
  h.fetch = async (url) => {
    h.fetches.push(url);
    return { ok: true, text: async () => csv };
  };
  h.download = async (url, file) => {
    h.downloads.push(url);
    h.files.set(file.uri, png());
    return file;
  };
}
async function waitFor(predicate) {
  for (let i = 0; i < 100 && !predicate(); i++) await new Promise((resolve) => setTimeout(resolve, 2));
  assert.ok(predicate(), 'timed out waiting for sprite');
}
let scope = 0;
async function service() {
  const url = new URL('../../src/services/nearby-place-sprite.ts', import.meta.url);
  url.searchParams.set('test', String(++scope));
  return import(url.href);
}

test('validates sprite rectangles and rejects damaged metadata', async () => {
  reset();
  const { parsePlaceSpriteIndex } = await service();
  assert.deepEqual(parsePlaceSpriteIndex(csv).get('police'), { x: 548, y: 902, width: 32, height: 32 });
  assert.throws(() => parsePlaceSpriteIndex('police,1020,0,32,32'));
  assert.throws(() => parsePlaceSpriteIndex('police,0,0,1,1\npolice,1,1,1,1'));
});

test('downloads a matching pair once and reuses the cached image and index offline', async () => {
  reset();
  const first = await service();
  const seen = [];
  const stop = first.observePlaceSprite((value) => seen.push(value));
  await waitFor(() => seen.some(Boolean));
  assert.equal(h.fetches.length, 1);
  assert.equal(h.downloads.length, 1);
  assert.equal(new URL(h.fetches[0]).search, new URL(h.downloads[0]).search);
  assert.equal(h.values.size, 1);
  stop();

  h.listeners = new Set();
  h.fetch = async () => {
    throw new Error('offline');
  };
  const reopened = await service();
  const cached = [];
  const stopCached = reopened.observePlaceSprite((value) => cached.push(value));
  assert.equal(cached.at(-1)?.icons.get('fuel')?.x, 352);
  assert.equal(h.downloads.length, 1);
  stopCached();
});

test('an invalid refreshed image does not replace the previous cached pair', async () => {
  reset();
  const filename = 'sprite-old.png';
  h.values.set('sprite-v1', JSON.stringify({ filename, csv, fetchedAt: 1 }));
  h.files.set('document/nearby-place-sprite/' + filename, png());
  const previous = h.values.get('sprite-v1');
  h.download = async (url, file) => {
    h.files.set(file.uri, png(10, 10));
    return file;
  };
  const { observePlaceSprite } = await service();
  const seen = [];
  const stop = observePlaceSprite((value) => seen.push(value));
  assert.ok(seen.at(-1));
  await waitFor(() => h.fetches.length === 1);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(h.values.get('sprite-v1'), previous);
  assert.equal(seen.filter(Boolean).length, 1);
  stop();
});

test('clearing cache prevents a late response from restoring data', async () => {
  reset();
  let finish;
  h.fetch = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const { observePlaceSprite } = await service();
  const seen = [];
  const stop = observePlaceSprite((value) => seen.push(value));
  await waitFor(() => !!finish);
  for (const listener of h.listeners) listener();
  finish({ ok: true, text: async () => csv });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(h.values.size, 0);
  assert.equal(h.files.size, 0);
  assert.ok(seen.every((value) => value === null));
  stop();
});

process.on('exit', () => hooks.deregister());
