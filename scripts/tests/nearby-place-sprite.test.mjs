import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { encode } from 'fast-png';

const h = { values: new Map(), files: new Map(), listeners: new Set(), fetch: null, download: null };
globalThis.__nearbySpriteTest = h;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const mocks = {
      'react-native-mmkv': 'sprite-test:mmkv',
      'expo/fetch': 'sprite-test:fetch',
      'expo-file-system': 'sprite-test:fs',
      'expo-image-manipulator': 'sprite-test:manipulator',
      'expo-image': 'sprite-test:image',
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
      'sprite-test:manipulator': `${prefix} export const SaveFormat = { PNG: 'png' }; export const ImageManipulator = { manipulate: (...args) => h.manipulate(...args) };`,
      'sprite-test:image': `${prefix} export const Image = { loadAsync: (...args) => h.load(...args) };`,
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
  h.crops = [];
  h.releases = [];
  h.cropBytes = null;
  h.loads = [];
  h.load = async (uri) => {
    h.loads.push(uri);
    return { uri, release() { h.releases.push('decoded'); } };
  };
  h.manipulate = (uri) => ({
    crop(rect) { h.crops.push({ uri, rect }); },
    async renderAsync() {
      return {
        async saveAsync(options) {
          assert.deepEqual(options, { format: 'png', compress: 1 });
          const uri = `cache/crop-${h.crops.length}.png`;
          h.files.set(uri, h.cropBytes ?? png(32, 32));
          return { uri };
        },
        release() { h.releases.push('image'); },
      };
    },
    release() { h.releases.push('context'); },
  });
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

test('town-hall icon is cropped at source pixels before resizing and shares pending work', async () => {
  reset();
  const { getPlaceSpriteIcon } = await service();
  const sprite = { uri: 'document/sprite.png', icons: new Map(), fetchedAt: 1 };
  const rect = { x: 844, y: 934, width: 32, height: 32 };
  const first = getPlaceSpriteIcon(sprite, rect);
  assert.equal(getPlaceSpriteIcon(sprite, { ...rect }), first);
  const uri = await first;
  assert.deepEqual(h.crops, [{ uri: sprite.uri, rect: { originX: 844, originY: 934, width: 32, height: 32 } }]);
  assert.notEqual(uri, sprite.uri);
  assert.deepEqual(h.releases, ['image', 'context']);
  for (const listener of h.listeners) listener();
  await Promise.resolve();
  assert.equal(h.files.has(uri), false);
});

test('a failed crop releases its context and can be retried', async () => {
  reset();
  const { getPlaceSpriteIcon } = await service();
  const sprite = { uri: 'document/sprite.png', icons: new Map(), fetchedAt: 1 };
  const rect = { x: 0, y: 0, width: 32, height: 32 };
  const workingManipulator = h.manipulate;
  h.manipulate = () => ({ crop() {}, renderAsync: async () => { throw new Error('crop failed'); }, release() { h.releases.push('context'); } });
  await assert.rejects(getPlaceSpriteIcon(sprite, rect), /crop failed/);
  assert.deepEqual(h.releases, ['context']);
  h.manipulate = workingManipulator;
  assert.match(await getPlaceSpriteIcon(sprite, rect), /crop-1/);
});

test('clearing cache during a crop removes the late file', async () => {
  reset();
  const { getPlaceSpriteIcon } = await service();
  let finish;
  h.manipulate = () => ({
    crop() {},
    renderAsync: async () => ({
      saveAsync: () => new Promise((resolve) => { finish = resolve; }),
      release() {},
    }),
    release() {},
  });
  const task = getPlaceSpriteIcon({ uri: 'sprite.png', icons: new Map(), fetchedAt: 1 }, { x: 0, y: 0, width: 32, height: 32 });
  await waitFor(() => !!finish);
  for (const listener of h.listeners) listener();
  h.files.set('late.png', png(32, 32));
  finish({ uri: 'late.png' });
  await assert.rejects(task, /invalidated/);
  assert.equal(h.files.has('late.png'), false);
});

function iconPixels(color) {
  const data = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const offset = (y * 32 + x) * 4;
    // Transparent pixels carry unrelated RGB; white interior artwork occupies most of the icon.
    const rgba = x < 2 || x > 29 || y < 2 || y > 29
      ? [255, 0, 0, 0]
      : x > 5 && x < 26 && y > 5 && y < 26 ? [255, 255, 255, 255] : [...color, 255];
    data.set(rgba, offset);
  }
  return data;
}

test('town-hall and police fills keep their actual color without white artwork or transparent neighbors', async () => {
  reset();
  const { getSpritePngColor } = await service();
  // These are the dominant opaque RGBs in the upstream town-hall and police sprites.
  for (const [rgb, expected] of [[[126, 148, 170], '#7e94aa'], [[83, 106, 206], '#536ace']]) {
    const data = iconPixels(rgb);
    const original = data.slice();
    assert.equal(getSpritePngColor(encode({ width: 32, height: 32, data, channels: 4, depth: 8 })), expected);
    assert.deepEqual(data, original, 'extracting the color must not tint away the icon artwork');
  }
});

test('dark and gray fills are retained, while empty and all-white icons have no dominant color', async () => {
  reset();
  const { getSpritePngColor } = await service();
  for (const [rgba, expected] of [[[0, 0, 0, 255], '#000000'], [[128, 128, 128, 255], '#808080'], [[255, 255, 255, 255], null], [[20, 50, 90, 0], null]]) {
    assert.equal(getSpritePngColor(encode({ width: 1, height: 1, channels: 4, data: new Uint8Array(rgba) })), expected);
  }
});

test('PNG palette transparency, 16-bit samples, corrupt CRC and invalid bounds are handled', async () => {
  reset();
  const { getSpritePngColor } = await service();
  const palette = encode({ width: 3, height: 1, channels: 1, depth: 8, data: new Uint8Array([0, 1, 2]), palette: [[255, 0, 0, 0], [255, 255, 255, 255], [126, 148, 170, 255]] });
  assert.equal(getSpritePngColor(palette), '#7e94aa');
  assert.equal(getSpritePngColor(encode({ width: 1, height: 1, channels: 4, depth: 16, data: new Uint16Array([83 * 257, 106 * 257, 206 * 257, 65535]) })), '#536ace');
  const corrupt = palette.slice();
  corrupt[29] ^= 255;
  assert.equal(getSpritePngColor(corrupt), null);
  assert.equal(getSpritePngColor(new Uint8Array([137, 80, 78])), null);
  assert.equal(getSpritePngColor(png(200000, 200000)), null);
});

test('color extraction shares cropped pixels and clearing the cache invalidates its result', async () => {
  reset();
  h.cropBytes = encode({ width: 32, height: 32, channels: 4, data: iconPixels([126, 148, 170]) });
  const { getPlaceSpriteIconColor } = await service();
  const sprite = { uri: 'atlas.png', icons: new Map(), fetchedAt: 1 };
  const rect = { x: 844, y: 934, width: 32, height: 32 };
  const first = getPlaceSpriteIconColor(sprite, rect);
  assert.equal(getPlaceSpriteIconColor(sprite, rect), first);
  assert.equal(await first, '#7e94aa');
  assert.equal(h.crops.length, 1);
  for (const listener of h.listeners) listener();
  await Promise.resolve();
  const next = getPlaceSpriteIconColor(sprite, rect);
  assert.notEqual(next, first);
  assert.equal(await next, '#7e94aa');
  assert.equal(h.crops.length, 2);
});

for (const requester of ['image', 'color']) {
  test(`${requester} requests recreate an evicted temporary crop and refresh its color cache`, async () => {
    reset();
    h.cropBytes = encode({ width: 32, height: 32, channels: 4, data: iconPixels([126, 148, 170]) });
    const { getPlaceSpriteIcon, getPlaceSpriteIconColor } = await service();
    const sprite = { uri: 'persisted-atlas.png', icons: new Map(), fetchedAt: 1 };
    const rect = { x: 844, y: 934, width: 32, height: 32 };
    const originalColor = getPlaceSpriteIconColor(sprite, rect);
    assert.equal(await originalColor, '#7e94aa');
    const oldUri = await getPlaceSpriteIcon(sprite, rect);
    h.files.delete(oldUri); // The OS may reclaim ImageManipulator's cache while JS remains alive.

    const initial = requester === 'image'
      ? getPlaceSpriteIcon(sprite, rect)
      : getPlaceSpriteIconColor(sprite, rect);
    const image = getPlaceSpriteIcon(sprite, rect);
    const color = getPlaceSpriteIconColor(sprite, rect);
    assert.equal(initial, requester === 'image' ? image : color, 'concurrent requests still share one crop');
    assert.notEqual(color, originalColor, 'do not reuse color from an evicted crop');
    const newUri = await image;
    assert.notEqual(newUri, oldUri);
    assert.ok(h.files.has(newUri));
    assert.equal(await color, '#7e94aa');
    assert.equal(h.crops.length, 2);
  });
}

function seedAtlas(index = csv, fetchedAt = Date.now()) {
  h.values.set('sprite-v1', JSON.stringify({ filename: 'sprite-warm.png', csv: index, fetchedAt }));
  h.files.set('document/nearby-place-sprite/sprite-warm.png', png());
  h.cropBytes = encode({ width: 32, height: 32, channels: 4, data: iconPixels([83, 106, 206]) });
}

test('cold preparation starts a shared prefetch but never waits for the network', async () => {
  reset();
  let fail;
  h.fetch = (url) => {
    h.fetches.push(url);
    return new Promise((_, reject) => { fail = reject; });
  };
  const { preparePlaceIcon, prefetchPlaceSprite } = await service();
  assert.equal(await preparePlaceIcon('police'), null);
  prefetchPlaceSprite();
  assert.equal(h.fetches.length, 1);
  assert.equal(h.crops.length, 0);
  fail(new Error('offline'));
  await new Promise((resolve) => setTimeout(resolve, 5));
});

test('warm preparation shares the decoded image and complete color snapshot without network access', async () => {
  reset();
  seedAtlas();
  const { preparePlaceIcon } = await service();
  const pending = preparePlaceIcon('unknown', 'police-15');
  assert.equal(preparePlaceIcon('police'), pending);
  const ready = await pending;
  assert.equal(ready.color, '#536ace');
  assert.equal(ready.width, 16);
  assert.equal(ready.height, 16);
  assert.equal(ready.source.uri, h.loads[0]);
  assert.equal(preparePlaceIcon('police'), pending);
  assert.equal(h.loads.length, 1);
  assert.equal(h.fetches.length, 0);
  for (const listener of h.listeners) listener();
  await Promise.resolve();
  assert.ok(!h.releases.includes('decoded'), 'a visible card may still own the decoded reference after cache clear');
});

test('preparation waits for native decode and returns a fixed fallback on failure, with retry on next open', async () => {
  reset();
  seedAtlas();
  const { preparePlaceIcon } = await service();
  let fail;
  h.load = (uri) => {
    h.loads.push(uri);
    return new Promise((_, reject) => { fail = reject; });
  };
  let resolved = false;
  const request = preparePlaceIcon('police').then((value) => { resolved = true; return value; });
  await waitFor(() => !!fail);
  assert.equal(resolved, false);
  fail(new Error('native decode failed'));
  assert.equal(await request, null);
  h.load = async (uri) => ({ uri });
  assert.ok((await preparePlaceIcon('police')).source);
  assert.equal(h.crops.length, 1, 'a decode failure should not discard the valid cropped PNG');
});

for (const invalidate of ['clear', 'refresh']) {
  test(`${invalidate} invalidates an older native decode before it can become a prepared snapshot`, async () => {
    reset();
    seedAtlas(csv, invalidate === 'refresh' ? 1 : Date.now());
    let finishFetch;
    h.fetch = () => new Promise((resolve) => { finishFetch = resolve; });
    const { preparePlaceIcon } = await service();
    let finishDecode;
    h.load = () => new Promise((resolve) => { finishDecode = resolve; });
    const pending = preparePlaceIcon('police');
    await waitFor(() => !!finishDecode);
    if (invalidate === 'clear') {
      for (const listener of h.listeners) listener();
    } else {
      finishFetch({ ok: true, text: async () => csv });
      await waitFor(() => h.downloads.length > 0);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    finishDecode({ uri: 'old-decoded-image' });
    assert.equal(await pending, null);
    h.load = async (uri) => ({ uri });
    if (invalidate === 'clear') seedAtlas();
    const current = await preparePlaceIcon('police');
    assert.ok(current.source);
    assert.notEqual(current.source.uri, 'old-decoded-image');
  });
}

test('prepared image cache stays bounded and temporary-file eviction causes a fresh decode', async () => {
  reset();
  seedAtlas(Array.from({ length: 65 }, (_, i) => `symbol-${i},${i * 2},0,2,2`).join('\n'));
  const { preparePlaceIcon } = await service();
  const held = await preparePlaceIcon('symbol-0');
  for (let i = 1; i < 65; i++) await preparePlaceIcon(`symbol-${i}`);
  assert.equal(h.loads.length, 65);
  assert.notEqual((await preparePlaceIcon('symbol-0')).source, held.source);
  assert.equal(h.loads.length, 66);
  const current = await preparePlaceIcon('symbol-0');
  h.files.delete(current.source.uri);
  const recovered = await preparePlaceIcon('symbol-0');
  assert.notEqual(recovered.source.uri, current.source.uri);
  assert.equal(h.loads.length, 67);
  assert.ok(!h.releases.includes('decoded'));
});

process.on('exit', () => hooks.deregister());
