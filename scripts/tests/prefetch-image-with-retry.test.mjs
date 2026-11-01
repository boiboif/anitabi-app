import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createImageLoadController } from '../../src/utils/image-load-controller.ts';

const compiled = ts.transpileModule(
  readFileSync(new URL('../../src/utils/prefetch-image-with-retry.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;
const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness({ throwSynchronously = false } = {}) {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const delays = [];
  const requests = [];
  const modules = {
    '@/utils/image-load-controller': {
      createImageLoadController(options) {
        return createImageLoadController({
          ...options,
          schedule(callback, delay) {
            const id = ++nextId;
            delays.push(delay);
            timers.set(id, { at: now + delay, callback });
            return id;
          },
          cancel: (id) => timers.delete(id),
        });
      },
    },
    'expo-image': {
      Image: {
        prefetch(uri, cachePolicy) {
          const request = { uri, cachePolicy, at: now };
          requests.push(request);
          if (throwSynchronously) throw new Error('native method unavailable');
          return new Promise((resolve, reject) => Object.assign(request, { resolve, reject }));
        },
      },
    },
  };
  const context = vm.createContext({
    exports: {},
    require(name) {
      assert.ok(name in modules, `unexpected import: ${name}`);
      return modules[name];
    },
  });
  vm.runInContext(compiled, context);
  return {
    requests,
    delays,
    get pending() {
      return timers.size;
    },
    start(uri = 'https://example.test/original.jpg') {
      const events = [];
      const cancel = context.exports.prefetchImageWithRetry(uri, {
        onLoad: () => events.push('load'),
        onSettled: () => events.push('settled'),
      });
      return { events, cancel };
    },
    tick(ms) {
      const end = now + ms;
      while (true) {
        const next = [...timers].sort(([, a], [, b]) => a.at - b.at)[0];
        if (!next || next[1].at > end) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].callback();
      }
      now = end;
    },
  };
}

test('successful prefetch uses memory-disk and reports load before settling once', async () => {
  const h = harness();
  const image = h.start();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].uri, 'https://example.test/original.jpg');
  assert.equal(h.requests[0].cachePolicy, 'memory-disk');
  assert.deepEqual(image.events, []);
  h.requests[0].resolve(true);
  await flush();
  assert.deepEqual(image.events, ['load', 'settled']);
  assert.equal(h.pending, 0);
  h.tick(10_000);
  image.cancel();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(image.events, ['load', 'settled']);
});

test('false results retry at 500/1500ms and only the terminal failure settles', async () => {
  const h = harness();
  const image = h.start();
  h.requests[0].resolve(false);
  await flush();
  assert.deepEqual(image.events, []);
  h.tick(499);
  assert.equal(h.requests.length, 1);
  h.tick(1);
  h.requests[1].resolve(false);
  await flush();
  assert.deepEqual(image.events, []);
  h.tick(1499);
  assert.equal(h.requests.length, 2);
  h.tick(1);
  h.requests[2].resolve(false);
  await flush();
  assert.deepEqual(image.events, ['settled']);
  assert.deepEqual(h.delays, [500, 1500]);
  assert.deepEqual(
    h.requests.map(({ at }) => at),
    [0, 500, 2000],
  );
  h.tick(10_000);
  assert.equal(h.requests.length, 3);
  assert.equal(h.pending, 0);
});

test('promise rejection shares the retry budget with false and a later true succeeds', async () => {
  const h = harness();
  const image = h.start();
  h.requests[0].reject(new Error('network failed'));
  await flush();
  h.tick(500);
  h.requests[1].resolve(false);
  await flush();
  h.tick(1500);
  h.requests[2].resolve(true);
  await flush();
  assert.deepEqual(image.events, ['load', 'settled']);
  assert.deepEqual(h.delays, [500, 1500]);
  assert.equal(h.pending, 0);
});

test('synchronous native failures are bounded and settle without claiming a successful load', async () => {
  const h = harness({ throwSynchronously: true });
  const image = h.start();
  assert.equal(h.pending, 1);
  h.tick(500);
  h.tick(1500);
  await flush();
  assert.equal(h.requests.length, 3);
  assert.deepEqual(image.events, ['settled']);
  assert.equal(h.pending, 0);
});

test('cancellation removes the retry timer without calling load or settled', async () => {
  const h = harness();
  const image = h.start();
  h.requests[0].resolve(false);
  await flush();
  assert.equal(h.pending, 1);
  image.cancel();
  image.cancel();
  assert.equal(h.pending, 0);
  h.tick(10_000);
  assert.equal(h.requests.length, 1);
  assert.deepEqual(image.events, []);
});

test('cancellation ignores late initial or retry success, false and rejection', async () => {
  for (const cancelDuringRetry of [false, true]) {
    for (const outcome of ['true', 'false', 'reject']) {
      const h = harness();
      const image = h.start();
      if (cancelDuringRetry) {
        h.requests[0].resolve(false);
        await flush();
        h.tick(500);
      }
      const request = h.requests.at(-1);
      image.cancel();
      if (outcome === 'reject') request.reject(new Error('late failure'));
      else request.resolve(outcome === 'true');
      await flush();
      h.tick(10_000);
      assert.deepEqual(image.events, [], `${outcome} after cancel must not update the old image`);
      assert.equal(h.requests.length, cancelDuringRetry ? 2 : 1);
      assert.equal(h.pending, 0);
    }
  }
});

test('a cancelled URI cannot settle or retry a replacement URI', async () => {
  const h = harness();
  const first = h.start('https://example.test/first.jpg');
  first.cancel();
  const second = h.start('https://example.test/second.jpg');
  h.requests[0].reject(new Error('old image failed late'));
  h.requests[1].resolve(true);
  await flush();
  h.tick(10_000);
  assert.deepEqual(first.events, []);
  assert.deepEqual(second.events, ['load', 'settled']);
  assert.deepEqual(
    h.requests.map(({ uri }) => uri),
    ['https://example.test/first.jpg', 'https://example.test/second.jpg'],
  );
  assert.equal(h.pending, 0);
});
