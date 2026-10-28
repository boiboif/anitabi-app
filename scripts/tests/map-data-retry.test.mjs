import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, beforeEach, test } from 'node:test';

// Exercise the real store's outer retry coordinator. The service is a controlled
// stub: its inner network retries and staging are covered by map-data.test.mjs.
class Clock {
  now = 0;
  sequence = 0;
  timers = new Map();

  setTimeout = (callback, delay = 0, ...args) => {
    const id = ++this.sequence;
    this.timers.set(id, { due: this.now + Math.max(0, Number(delay) || 0), callback, args });
    return id;
  };

  clearTimeout = (id) => {
    this.timers.delete(id);
  };

  delays() {
    return [...this.timers.values()].map(({ due }) => due - this.now).sort((left, right) => left - right);
  }

  async advance(milliseconds) {
    const end = this.now + milliseconds;
    let callbacks = 0;
    for (;;) {
      await flush();
      const next = [...this.timers].sort(([, left], [, right]) => left.due - right.due)[0];
      if (!next || next[1].due > end) break;
      assert.ok(++callbacks < 100, 'outer retry timers must not turn into an immediate retry loop');
      const [id, timer] = next;
      this.now = timer.due;
      this.timers.delete(id);
      timer.callback(...timer.args);
    }
    this.now = end;
    await flush();
  }
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function until(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await flush();
  }
  assert.fail('expected retry coordinator state was not reached');
}

function deferred() {
  let resolve;
  const promise = new Promise((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function mapData(label) {
  return {
    data: {
      modified: 100,
      bangumis: [{ id: 1, title: label, modified: 100, geo: [35, 139], points: [], theme: { src: '', ids: [] } }],
    },
  };
}

function success(data) {
  return { data, cachePersisted: true };
}

function appState(currentState = 'active') {
  const listeners = new Set();
  return {
    currentState,
    addEventListener(event, listener) {
      assert.equal(event, 'change');
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    emit(state) {
      this.currentState = state;
      for (const listener of [...listeners]) listener(state);
    },
  };
}

const harness = {
  scope: 0,
  cached: null,
  verified: false,
  generation: 0,
  invalidations: new Set(),
  calls: [],
  outcomes: [],
  clock: null,
  async refresh(baseline, onProgress, options) {
    const call = { baseline, signal: options?.signal, at: this.clock.now };
    this.calls.push(call);
    onProgress?.({ phase: 'checking', message: 'Checking locations' });
    const outcome = this.outcomes.length ? this.outcomes.shift() : new Error('service request failed');
    if (outcome instanceof Error) throw outcome;
    // Deliberately allow a response to arrive after abort. The store still has
    // to reject its publication; abort alone does not establish that guarantee.
    const result = await (typeof outcome === 'function' ? outcome(call) : outcome);
    if (result.cachePersisted && !call.signal?.aborted) {
      this.cached = result.data;
      this.verified = true;
    }
    return result;
  },
  invalidate() {
    this.generation += 1;
    this.cached = null;
    this.verified = false;
    for (const listener of [...this.invalidations]) listener();
  },
};
globalThis.__mapDataRetryHarness = harness;

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@/services/map-data') return { url: 'map-retry-test:service', shortCircuit: true };
    if (specifier === '@/i18n') return { url: 'map-retry-test:i18n', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    const common = 'const harness = globalThis.__mapDataRetryHarness;';
    if (url === 'map-retry-test:service')
      return {
        format: 'module',
        shortCircuit: true,
        source: `${common}
          export const getCachedMapData = () => harness.cached;
          export const isCachedMapDataVerified = () => harness.verified;
          export const getMapDataGeneration = () => harness.generation;
          export const subscribeMapDataInvalidation = (listener) => {
            harness.invalidations.add(listener);
            return () => harness.invalidations.delete(listener);
          };
          export const refreshMapData = (...args) => harness.refresh(...args);`,
      };
    if (url === 'map-retry-test:i18n')
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export default {t: (key, options) => options?.defaultValue ?? key};',
      };
    return next(url, context);
  },
});

async function runtime(t, { cached = mapData('saved map'), verified = true, currentState = 'active' } = {}) {
  harness.cached = cached;
  harness.verified = verified;
  const clock = new Clock();
  harness.clock = clock;
  t.mock.method(Date, 'now', () => clock.now);
  t.mock.method(globalThis, 'setTimeout', clock.setTimeout);
  t.mock.method(globalThis, 'clearTimeout', clock.clearTimeout);
  const module = await import(`../../src/store/use-map-data.ts?map-retry-test=${++harness.scope}`);
  const state = appState(currentState);
  const stop = module.startMapDataRefreshLifecycle(state);
  t.after(stop);
  return { store: module.useMapData, clock, appState: state, start: module.startMapDataRefreshLifecycle, stop, cached };
}

function assertQuiet(store, expected) {
  const state = store.getState();
  assert.strictEqual(state.data, expected);
  assert.equal(state.status, 'ready');
  assert.equal(state.isPartial, false);
  assert.equal(state.progress, null);
  assert.equal(state.error, null);
}

beforeEach(() => {
  harness.cached = null;
  harness.verified = false;
  harness.generation = 0;
  harness.invalidations.clear();
  harness.calls = [];
  harness.outcomes = [];
});

after(() => {
  hooks.deregister();
  delete globalThis.__mapDataRetryHarness;
});

test('a usable complete baseline retries quietly after 30, 120 and then repeated 300 foreground seconds', async (t) => {
  const { store, clock, cached } = await runtime(t);
  const states = [];
  const unsubscribe = store.subscribe((state) => states.push(state));
  t.after(unsubscribe);
  await store.getState().initialize();
  assertQuiet(store, cached);
  assert.deepEqual(clock.delays(), [30_000]);
  await clock.advance(29_999);
  assert.equal(harness.calls.length, 1);
  await clock.advance(1);
  assert.equal(harness.calls.length, 2);
  assert.deepEqual(clock.delays(), [120_000]);
  await clock.advance(120_000);
  assert.equal(harness.calls.length, 3);
  assert.deepEqual(clock.delays(), [300_000]);
  await clock.advance(300_000);
  assert.equal(harness.calls.length, 4);
  assert.deepEqual(clock.delays(), [300_000]);
  await clock.advance(300_000);
  assert.equal(harness.calls.length, 5);
  assert.deepEqual(clock.delays(), [300_000]);
  assert.ok(states.every((state) => state.data === cached && state.progress === null && state.error === null));
});

test('background time does not consume the remaining foreground retry delay', async (t) => {
  const { store, clock, appState: state } = await runtime(t);
  await store.getState().initialize();
  await clock.advance(12_000);
  state.emit('background');
  await flush();
  assert.deepEqual(clock.delays(), []);
  await clock.advance(600_000);
  assert.equal(harness.calls.length, 1);
  state.emit('active');
  await flush();
  assert.deepEqual(clock.delays(), [18_000]);
  await clock.advance(17_999);
  assert.equal(harness.calls.length, 1);
  await clock.advance(1);
  assert.equal(harness.calls.length, 2);
  assert.deepEqual(clock.delays(), [120_000]);
});

test('an initially unknown AppState holds quiet work until the first active event', async (t) => {
  const { store, clock, appState: state, cached } = await runtime(t, { currentState: null });
  await store.getState().initialize();
  assertQuiet(store, cached);
  assert.equal(store.getState().isRefreshing, false);
  assert.equal(harness.calls.length, 0);
  assert.deepEqual(clock.delays(), []);
  await clock.advance(600_000);
  assert.equal(harness.calls.length, 0);
  state.emit('active');
  await clock.advance(0);
  assert.equal(harness.calls.length, 1);
  assertQuiet(store, cached);
  assert.deepEqual(clock.delays(), [30_000]);
});

test('backgrounding aborts an in-flight quiet request and resumes once after its late result is released', async (t) => {
  const { store, clock, appState: state, cached } = await runtime(t);
  const gate = deferred();
  const stale = mapData('late background result');
  const fresh = mapData('foreground result');
  harness.outcomes = [gate.promise, success(fresh)];
  const published = [];
  const unsubscribe = store.subscribe((next) => published.push(next.data));
  t.after(unsubscribe);
  const pending = store.getState().initialize();
  await until(() => harness.calls.length === 1);
  const signal = harness.calls[0].signal;
  assert.ok(signal instanceof AbortSignal && !signal.aborted);
  state.emit('background');
  await flush();
  assert.equal(signal.aborted, true);
  assertQuiet(store, cached);
  state.emit('active');
  await flush();
  assert.equal(harness.calls.length, 1, 'foreground resume waits for the old operation to release its slot');
  gate.resolve(success(stale));
  await pending;
  await clock.advance(0);
  await until(() => harness.calls.length === 2 && store.getState().data === fresh);
  assertQuiet(store, fresh);
  assert.ok(published.every((value) => value !== stale));
  assert.deepEqual(clock.delays(), []);
  await clock.advance(600_000);
  assert.equal(harness.calls.length, 2);
});

test('a rapid background-active transition preserves resume intent until the aborted promise settles', async (t) => {
  const { store, clock, appState: state } = await runtime(t);
  const gate = deferred();
  const obsolete = mapData('aborted rapid-transition result');
  const fresh = mapData('rapid foreground result');
  harness.outcomes = [gate.promise, success(fresh)];
  const pending = store.getState().initialize();
  await until(() => harness.calls.length === 1);
  state.emit('background');
  state.emit('active');
  assert.equal(harness.calls[0].signal.aborted, true);
  await clock.advance(0);
  assert.equal(harness.calls.length, 1);
  gate.resolve(success(obsolete));
  await pending;
  await clock.advance(0);
  await until(() => harness.calls.length === 2 && store.getState().data === fresh);
  assertQuiet(store, fresh);
  assert.deepEqual(clock.delays(), []);
});

test('a successful retry clears the timer and resets the following failure to the first delay', async (t) => {
  const { store, clock } = await runtime(t);
  const fresh = mapData('downloaded map');
  harness.outcomes = [new Error('offline'), success(fresh)];
  await store.getState().initialize();
  await clock.advance(30_000);
  assertQuiet(store, fresh);
  assert.deepEqual(clock.delays(), []);
  await store.getState().initialize();
  assertQuiet(store, fresh);
  assert.deepEqual(clock.delays(), [30_000]);
});

for (const legacy of [false, true]) {
  test(`${legacy ? 'unverified legacy data' : 'a first load without cached data'} keeps explicit failure UI and does not auto-retry`, async (t) => {
    const cached = legacy ? mapData('legacy map') : null;
    const { store, clock, appState: state } = await runtime(t, { cached, verified: false });
    await store.getState().initialize();
    assert.strictEqual(store.getState().data, cached);
    assert.equal(store.getState().status, legacy ? 'ready' : 'error');
    assert.equal(store.getState().isPartial, legacy);
    assert.ok(store.getState().error instanceof Error);
    assert.equal(store.getState().progress?.phase, 'error');
    assert.deepEqual(clock.delays(), []);
    state.emit('background');
    await clock.advance(600_000);
    state.emit('active');
    await clock.advance(600_000);
    assert.equal(harness.calls.length, 1);
  });
}

for (const action of ['clear', 'dispose']) {
  for (const inFlight of [false, true]) {
    test(`${action} cancels ${inFlight ? 'a quiet in-flight request and ignores its late result' : 'a scheduled retry and its foreground resume intent'}`, async (t) => {
      const { store, clock, appState: state, stop, cached } = await runtime(t);
      const gate = deferred();
      if (inFlight) harness.outcomes = [gate.promise];
      const pending = store.getState().initialize();
      await until(() => harness.calls.length === 1);
      if (!inFlight) {
        await pending;
        assert.deepEqual(clock.delays(), [30_000]);
      }
      if (action === 'clear') harness.invalidate();
      else stop();
      await flush();
      assert.deepEqual(clock.delays(), []);
      if (inFlight) {
        assert.equal(harness.calls[0].signal.aborted, true);
        const current = store.getState().data;
        gate.resolve(success(mapData('obsolete result')));
        await pending;
        assert.strictEqual(store.getState().data, current);
      }
      assert.strictEqual(store.getState().data, cached);
      state.emit('background');
      await clock.advance(600_000);
      state.emit('active');
      await clock.advance(600_000);
      assert.equal(harness.calls.length, 1);
      assert.deepEqual(clock.delays(), []);
    });
  }
}

test('manual initialize replaces a scheduled retry and concurrent calls share a single request', async (t) => {
  const { store, clock } = await runtime(t);
  await store.getState().initialize();
  await clock.advance(10_000);
  const gate = deferred();
  harness.outcomes = [gate.promise];
  const first = store.getState().initialize();
  const second = store.getState().initialize();
  await until(() => harness.calls.length === 2);
  assert.deepEqual(clock.delays(), []);
  await clock.advance(600_000);
  assert.equal(harness.calls.length, 2);
  gate.resolve(success(mapData('manual result')));
  await Promise.all([first, second]);
  assert.deepEqual(clock.delays(), []);
});

test('disposing and attaching a new lifecycle permits explicit restart while ignoring the old request result', async (t) => {
  const { store, clock, start, stop } = await runtime(t);
  const gate = deferred();
  const obsolete = mapData('old layout result');
  const fresh = mapData('remounted layout result');
  harness.outcomes = [gate.promise, success(fresh)];
  const old = store.getState().initialize();
  await until(() => harness.calls.length === 1);
  stop();
  assert.equal(harness.calls[0].signal.aborted, true);
  const detach = start(appState());
  t.after(detach);
  await store.getState().initialize();
  const completed = store.getState();
  assertQuiet(store, fresh);
  assert.equal(harness.calls.length, 2);
  gate.resolve(success(obsolete));
  await old;
  assert.strictEqual(store.getState(), completed);
  await clock.advance(600_000);
  assert.equal(harness.calls.length, 2);
  assert.deepEqual(clock.delays(), []);
});

test('cache clear between a retry timer firing and service import resuming cannot adopt the new generation', async (t) => {
  const { store, clock } = await runtime(t);
  await store.getState().initialize();
  const visible = store.getState();
  assert.deepEqual(clock.delays(), [30_000]);
  harness.outcomes = [success(mapData('must not restore the cleared cache'))];

  // Fire synchronously, leaving initializeMapData suspended at its dynamic
  // import. Clock.advance() would flush that microtask before cache invalidation.
  const [id, timer] = [...clock.timers][0];
  clock.now = timer.due;
  clock.timers.delete(id);
  timer.callback(...timer.args);
  harness.invalidate();
  await flush();
  await clock.advance(300_000);

  assert.equal(harness.generation, 1);
  assert.equal(harness.calls.length, 1, 'the stale retry must not issue a request for the new generation');
  assert.equal(harness.cached, null);
  assert.equal(harness.verified, false);
  assert.strictEqual(store.getState(), visible, 'the discarded quiet task must not publish even a paused error');
  assert.deepEqual(clock.delays(), []);
});
