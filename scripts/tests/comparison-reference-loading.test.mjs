import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { isValidImageSize } from '../../src/lib/comparison-camera-geometry.ts';

const source = readFileSync(new URL('../../src/hooks/use-comparison-reference-image.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const plain = (value) => JSON.parse(JSON.stringify(value));

// Exercise hook state, effect cleanup and its loading delay. The controlled
// prefetch implements the real helper's cancellation contract; its retry budget
// and late native promise outcomes are covered by prefetch-image-with-retry.test.
function harness(initialProps = {}) {
  const slots = [];
  const timers = new Map();
  const requests = [];
  let props = { initialReferenceUri: 'thumbnail', fullReferenceUri: 'original', capturing: false, ...initialProps };
  let cursor = 0;
  let effects = [];
  let dirty = false;
  let state;
  let now = 0;
  let nextTimer = 0;
  const modules = {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!slots[index]) {
          const slot = { value: typeof initial === 'function' ? initial() : initial };
          slot.set = (next) => {
            const value = typeof next === 'function' ? next(slot.value) : next;
            if (!Object.is(value, slot.value)) {
              slot.value = value;
              dirty = true;
            }
          };
          slots[index] = slot;
        }
        return [slots[index].value, slots[index].set];
      },
      useEffect(effect, dependencies) {
        const slot = (slots[cursor++] ??= {});
        if (!slot.dependencies || dependencies.some((value, index) => !Object.is(value, slot.dependencies[index]))) {
          effects.push({ slot, effect, dependencies });
        }
      },
    },
    '@/lib/comparison-camera-geometry': { isValidImageSize },
    '@/utils/prefetch-image-with-retry': {
      prefetchImageWithRetry(uri, { onLoad, onSettled }) {
        const request = {
          uri,
          cancelled: false,
          settled: false,
          finish(loaded) {
            if (this.cancelled || this.settled) return;
            this.settled = true;
            if (loaded) onLoad();
            onSettled();
          },
        };
        requests.push(request);
        return () => {
          request.cancelled = true;
        };
      },
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      assert.ok(name in modules, `unexpected import: ${name}`);
      return modules[name];
    },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  const render = (updates = {}) => {
    props = { ...props, ...updates };
    let passes = 0;
    do {
      assert.ok(++passes <= 20, 'hook state updates must converge');
      dirty = false;
      cursor = 0;
      effects = [];
      state = exports.useComparisonReferenceImage(props);
      if (dirty) continue;
      for (const { slot } of effects) slot.cleanup?.();
      for (const { slot, effect, dependencies } of effects) {
        slot.dependencies = dependencies;
        slot.cleanup = effect();
      }
    } while (dirty);
    return state;
  };
  const flush = () => {
    if (dirty) render();
  };
  render();
  return {
    requests,
    render,
    get state() {
      flush();
      return state;
    },
    get pendingTimers() {
      return timers.size;
    },
    loadSize(size) {
      state.onReferenceLoad(size);
      flush();
    },
    select(uri) {
      state.setReferenceUri(uri);
      flush();
    },
    advance(ms) {
      const until = now + ms;
      while (timers.size) {
        const [id, timer] = [...timers].sort(([, a], [, b]) => a.at - b.at)[0];
        if (timer.at > until) break;
        now = timer.at;
        timers.delete(id);
        timer.callback();
        flush();
      }
      now = until;
    },
    unmount() {
      for (const slot of slots) slot.cleanup?.();
    },
  };
}

test('original prefetch shows loading only after 200ms and success upgrades URI with its known dimensions', () => {
  const h = harness();
  h.loadSize({ width: 1600, height: 900 });
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].uri, 'original');
  assert.equal(h.state.loadingFullReference, false);
  h.advance(199);
  assert.equal(h.state.loadingFullReference, false);
  h.advance(1);
  assert.equal(h.state.loadingFullReference, true);
  h.requests[0].finish(true);
  assert.equal(h.state.referenceUri, 'original');
  assert.equal(h.state.loadingFullReference, false);
  assert.deepEqual(plain(h.state.referenceDimensions), { uri: 'original', size: { width: 1600, height: 900 } });
  assert.equal(h.pendingTimers, 0);
  assert.equal(h.requests.length, 1, 'upgrading the source must not start another prefetch');
});

test('a fast cached original never flashes the delayed loading indicator', () => {
  const h = harness();
  h.advance(50);
  h.requests[0].finish(true);
  assert.equal(h.state.loadingFullReference, false);
  assert.equal(h.state.referenceUri, 'original');
  assert.equal(h.state.referenceDimensions, undefined, 'prefetch must not invent native image dimensions');
  h.advance(1000);
  assert.equal(h.state.loadingFullReference, false);
  assert.equal(h.pendingTimers, 0);
});

test('exhausted prefetch hides loading and preserves the usable thumbnail and ratio', () => {
  const h = harness();
  h.loadSize({ width: 900, height: 1600 });
  h.advance(200);
  h.requests[0].finish(false);
  assert.equal(h.state.loadingFullReference, false);
  assert.equal(h.state.referenceUri, 'thumbnail');
  assert.deepEqual(plain(h.state.referenceDimensions), { uri: 'thumbnail', size: { width: 900, height: 1600 } });
  h.render();
  h.advance(10000);
  assert.equal(h.requests.length, 1, 'terminal failure must not restart the same prefetch');
});

test('selecting a replacement cancels the old prefetch and ignores its late result', () => {
  const h = harness();
  h.advance(200);
  h.select('file:///selected.jpg');
  h.loadSize({ width: 1200, height: 800 });
  assert.equal(h.requests[0].cancelled, true);
  assert.equal(h.state.loadingFullReference, false);
  h.requests[0].finish(true);
  h.advance(10000);
  assert.equal(h.state.referenceUri, 'file:///selected.jpg');
  assert.deepEqual(plain(h.state.referenceDimensions), {
    uri: 'file:///selected.jpg',
    size: { width: 1200, height: 800 },
  });
  assert.equal(h.requests.length, 1);
  assert.equal(h.pendingTimers, 0);
});

test('capture cancels prefetch and resumes a fresh delayed attempt after capture finishes', () => {
  const h = harness();
  h.advance(200);
  h.render({ capturing: true });
  assert.equal(h.requests[0].cancelled, true);
  assert.equal(h.state.loadingFullReference, false);
  h.requests[0].finish(true);
  assert.equal(h.state.referenceUri, 'thumbnail');
  h.render({ capturing: false });
  assert.equal(h.requests.length, 2);
  h.advance(199);
  assert.equal(h.state.loadingFullReference, false);
  h.advance(1);
  assert.equal(h.state.loadingFullReference, true);
  h.requests[1].finish(true);
  assert.equal(h.state.referenceUri, 'original');
  assert.equal(h.state.loadingFullReference, false);
});

test('unmount cancels both the loading timer and prefetch before late completion', () => {
  const h = harness();
  h.advance(100);
  h.unmount();
  assert.equal(h.requests[0].cancelled, true);
  assert.equal(h.pendingTimers, 0);
  h.requests[0].finish(true);
  h.advance(10000);
  assert.equal(h.state.referenceUri, 'thumbnail');
  assert.equal(h.state.loadingFullReference, false);
});

test('missing or already displayed originals and active capture do not prefetch', () => {
  for (const props of [{ fullReferenceUri: undefined }, { fullReferenceUri: 'thumbnail' }, { capturing: true }]) {
    const h = harness(props);
    h.advance(10000);
    assert.equal(h.requests.length, 0);
    assert.equal(h.state.loadingFullReference, false);
    assert.equal(h.pendingTimers, 0);
  }
});
