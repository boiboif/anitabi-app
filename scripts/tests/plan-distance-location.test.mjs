import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/hooks/use-plan-distance-location.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const granted = { granted: true };
const denied = { granted: false };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function createHarness({ enabled = true, focused = true, active = true } = {}) {
  const slots = [];
  const effects = [];
  const listeners = new Set();
  const watches = [];
  const timers = new Map();
  let elapsed = 0;
  let nextTimerId = 0;
  let cursor = 0;
  let dirty = true;
  let mounted = true;
  let result;
  let gets = 0;
  let requests = 0;
  const config = {
    permission: granted,
    getPermission: null,
    requestPermission: async () => granted,
    servicesEnabled: true,
    createWatch: null,
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [
        slots[index].value,
        (next) => {
          const value = typeof next === 'function' ? next(slots[index].value) : next;
          if (!Object.is(value, slots[index].value)) {
            assert.ok(mounted, 'no state update after unmount');
            slots[index].value = value;
            dirty = true;
          }
        },
      ];
    },
    useRef(current) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current };
      return slots[index];
    },
    useEffect(run, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { dependencies, cleanup: run() };
        });
      }
    },
  };
  const AppState = {
    currentState: active ? 'active' : 'background',
    addEventListener(event, listener) {
      assert.equal(event, 'change');
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  const modules = {
    react,
    'expo-router': { useIsFocused: () => focused },
    'react-native': { AppState },
    '@/utils/plan-point-distances': {
      isValidCoordinate: (lat, lng) =>
        Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180,
    },
    'expo-location': {
      Accuracy: { Balanced: 3 },
      getForegroundPermissionsAsync: async () => {
        gets++;
        return config.getPermission ? config.getPermission() : config.permission;
      },
      requestForegroundPermissionsAsync: async () => {
        requests++;
        const permission = await config.requestPermission();
        config.permission = permission;
        return permission;
      },
      hasServicesEnabledAsync: async () => config.servicesEnabled,
      watchPositionAsync: (options, callback, onError) => {
        const watch = {
          options,
          callback,
          onError,
          removes: 0,
          remove() {
            this.removes++;
          },
        };
        watches.push(watch);
        return config.createWatch ? config.createWatch(watch) : Promise.resolve(watch);
      },
    },
  };
  const context = vm.createContext({
    exports: {},
    require: (name) => {
      assert.ok(name in modules, `unexpected module: ${name}`);
      return modules[name];
    },
    Date,
    setTimeout(callback, delay) {
      const id = ++nextTimerId;
      timers.set(id, { callback, due: elapsed + delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  });
  vm.runInContext(compiled, context);
  const render = () => {
    if (!mounted || !dirty) return;
    dirty = false;
    cursor = 0;
    result = context.exports.usePlanDistanceLocation(enabled);
    while (effects.length) effects.shift()();
  };
  const flush = async () => {
    for (let i = 0; i < 20; i++) {
      render();
      await Promise.resolve();
    }
    render();
  };
  return {
    config,
    watches,
    flush,
    get result() {
      return result;
    },
    get requests() {
      return requests;
    },
    get gets() {
      return gets;
    },
    get listeners() {
      return listeners.size;
    },
    get timers() {
      return timers.size;
    },
    advanceTime(milliseconds) {
      const target = elapsed + milliseconds;
      while (true) {
        const next = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
        if (!next || next[1].due > target) break;
        elapsed = next[1].due;
        timers.delete(next[0]);
        next[1].callback();
      }
      elapsed = target;
    },
    setEnabled(value) {
      enabled = value;
      dirty = true;
    },
    setFocused(value) {
      focused = value;
      dirty = true;
    },
    appState(value) {
      AppState.currentState = value;
      listeners.forEach((listener) => listener(value));
    },
    unmount() {
      for (const slot of slots) slot?.cleanup?.();
      mounted = false;
    },
  };
}

function fix(latitude = 35, longitude = 139, timestamp = Date.now()) {
  return { timestamp, coords: { latitude, longitude, accuracy: 50 } };
}

test('off or unfocused modes do not ask for permission or start location; enabled foreground mode watches', async () => {
  const h = createHarness({ enabled: false });
  await h.flush();
  assert.equal(h.gets, 0);
  assert.equal(h.listeners, 0);
  h.setFocused(false);
  h.setEnabled(true);
  await h.flush();
  assert.equal(h.gets, 0);
  h.setFocused(true);
  await h.flush();
  assert.equal(h.watches.length, 1);
  assert.equal(h.watches[0].options.accuracy, 3);
  assert.equal(h.requests, 0);
  h.unmount();
  assert.equal(h.listeners, 0);
  assert.equal(h.watches[0].removes, 1);
});

test('accepts fresh coordinates and ignores invalid, stale, future and out-of-order fixes', async () => {
  const h = createHarness();
  await h.flush();
  const watch = h.watches[0];
  const now = Date.now();
  watch.callback(fix(35, 139, now));
  await h.flush();
  for (const bad of [
    fix(91, 139),
    fix(35, NaN),
    fix(34, 139, now - 61_000),
    fix(34, 139, now + 6_000),
    fix(34, 139, now - 1),
    fix(34, 139, NaN),
  ]) {
    watch.callback(bad);
  }
  await h.flush();
  assert.equal(h.result.location.latitude, 35);
  assert.equal(h.result.isLocating, false);
  h.unmount();
});

test('background stops and discards old callbacks; foreground restarts and disable releases listeners', async () => {
  const h = createHarness();
  await h.flush();
  h.appState('background');
  h.watches[0].callback(fix());
  await h.flush();
  assert.equal(h.watches[0].removes, 1);
  assert.equal(h.result.location, null);
  h.appState('active');
  await h.flush();
  assert.equal(h.watches.length, 2);
  h.setEnabled(false);
  await h.flush();
  assert.equal(h.watches[1].removes, 1);
  assert.equal(h.listeners, 0);
  h.unmount();
});

test('a screen opened while backgrounded waits until active before requesting permission', async () => {
  const h = createHarness({ active: false });
  h.config.permission = denied;
  await h.flush();
  assert.equal(h.gets, 0);
  h.appState('active');
  await h.flush();
  assert.equal(h.requests, 1);
  assert.equal(h.watches.length, 1);
  h.unmount();
});

for (const resumeBeforeResolve of [true, false]) {
  test(`permission dialog suspension keeps intent and starts one watch (resume first: ${resumeBeforeResolve})`, async () => {
    const h = createHarness();
    const permission = deferred();
    h.config.permission = denied;
    h.config.requestPermission = () => permission.promise;
    await h.flush();
    assert.equal(h.requests, 1);
    h.appState('inactive');
    if (resumeBeforeResolve) h.appState('active');
    await h.flush();
    assert.equal(h.watches.length, 0);
    permission.resolve(granted);
    await h.flush();
    if (!resumeBeforeResolve) {
      assert.equal(h.watches.length, 0);
      h.appState('active');
      await h.flush();
    }
    assert.equal(h.requests, 1);
    assert.equal(h.watches.length, 1);
    h.watches[0].callback(fix());
    await h.flush();
    assert.equal(h.result.location.latitude, 35);
    h.unmount();
  });
}

test('denied permission is not prompted again on resume; explicit retry can request it', async () => {
  const h = createHarness();
  h.config.permission = denied;
  h.config.requestPermission = async () => denied;
  await h.flush();
  assert.equal(h.result.error, 'permission');
  h.appState('background');
  h.appState('active');
  await h.flush();
  assert.equal(h.requests, 1);
  h.config.requestPermission = async () => granted;
  h.result.retry();
  await h.flush();
  assert.equal(h.requests, 2);
  assert.equal(h.watches.length, 1);
  h.unmount();
});

test('returning from system settings rechecks permission without requiring another prompt', async () => {
  const h = createHarness();
  h.config.permission = denied;
  h.config.requestPermission = async () => denied;
  await h.flush();
  h.appState('background');
  h.config.permission = granted;
  h.appState('active');
  await h.flush();
  assert.equal(h.requests, 1);
  assert.equal(h.watches.length, 1);
  h.unmount();
});

test('system services disabled reports a recoverable error without starting a watch', async () => {
  const h = createHarness();
  h.config.servicesEnabled = false;
  await h.flush();
  assert.equal(h.result.error, 'services');
  assert.equal(h.watches.length, 0);
  h.config.servicesEnabled = true;
  h.result.retry();
  await h.flush();
  assert.equal(h.watches.length, 1);
  h.unmount();
});

for (const action of ['unmount', 'disable', 'blur']) {
  test(`a watch resolving after ${action} is removed and cannot update location`, async () => {
    const h = createHarness();
    const creation = deferred();
    h.config.createWatch = () => creation.promise;
    await h.flush();
    const watch = h.watches[0];
    if (action === 'unmount') h.unmount();
    else if (action === 'disable') h.setEnabled(false);
    else h.setFocused(false);
    await h.flush();
    creation.resolve(watch);
    await h.flush();
    watch.callback(fix());
    await h.flush();
    assert.equal(watch.removes, 1);
    assert.equal(h.result.location, null);
    assert.equal(h.listeners, 0);
    if (action !== 'unmount') h.unmount();
  });
}

test('suspension during native watch creation removes that watch and restarts when active', async () => {
  const h = createHarness();
  const creation = deferred();
  h.config.createWatch = () => creation.promise;
  await h.flush();
  h.appState('background');
  h.appState('active');
  h.config.createWatch = null;
  creation.resolve(h.watches[0]);
  await h.flush();
  assert.equal(h.watches[0].removes, 1);
  assert.equal(h.watches.length, 2);
  assert.equal(h.watches[1].removes, 0);
  h.unmount();
});

test('native callback error removes the watch and explicit retry starts a fresh one', async () => {
  const h = createHarness();
  await h.flush();
  h.watches[0].callback(fix());
  h.watches[0].onError('provider unavailable');
  h.watches[0].callback(fix(34));
  await h.flush();
  assert.equal(h.result.location, null);
  assert.equal(h.result.error, 'unavailable');
  assert.equal(h.watches[0].removes, 1);
  h.result.retry();
  await h.flush();
  assert.equal(h.watches.length, 2);
  h.unmount();
});

test('disable and re-enable during the same permission prompt shares its result without a second prompt', async () => {
  const h = createHarness();
  const permission = deferred();
  h.config.permission = denied;
  h.config.requestPermission = () => permission.promise;
  await h.flush();
  h.setEnabled(false);
  await h.flush();
  h.setEnabled(true);
  await h.flush();
  permission.resolve(denied);
  await h.flush();
  assert.equal(h.requests, 1);
  assert.equal(h.result.error, 'permission');
  h.unmount();
});

test('a permission check completing after suspension cannot open a system prompt in background', async () => {
  const h = createHarness();
  const check = deferred();
  h.config.getPermission = () => check.promise;
  await h.flush();
  h.appState('background');
  check.resolve(denied);
  await h.flush();
  assert.equal(h.requests, 0);
  h.config.getPermission = null;
  h.config.permission = denied;
  h.appState('active');
  await h.flush();
  assert.equal(h.requests, 1);
  h.unmount();
});

test('watch creation rejection is reported and a later retry can recover', async () => {
  const h = createHarness();
  h.config.createWatch = () => Promise.reject(new Error('native startup failed'));
  await h.flush();
  assert.equal(h.result.error, 'unavailable');
  assert.equal(h.result.isLocating, false);
  h.config.createWatch = null;
  h.result.retry();
  await h.flush();
  assert.equal(h.watches.length, 2);
  h.unmount();
});

test('no usable first fix times out after 20 seconds, removes the watch and allows explicit retry', async () => {
  const h = createHarness();
  await h.flush();
  const watch = h.watches[0];
  assert.equal(h.timers, 1);
  watch.callback(fix(91));
  watch.callback(fix(35, 139, Date.now() - 61_000));
  h.advanceTime(19_999);
  await h.flush();
  assert.equal(h.result.isLocating, true);
  assert.equal(h.result.error, null);
  assert.equal(watch.removes, 0);
  h.advanceTime(1);
  await h.flush();
  assert.equal(h.result.isLocating, false);
  assert.equal(h.result.error, 'unavailable');
  assert.equal(h.result.location, null);
  assert.equal(watch.removes, 1);
  assert.equal(h.timers, 0);
  watch.callback(fix());
  await h.flush();
  assert.equal(h.result.location, null, 'a late fix cannot revive the timed-out attempt');
  h.result.retry();
  await h.flush();
  assert.equal(h.watches.length, 2);
  h.watches[1].callback(fix());
  await h.flush();
  assert.equal(h.result.error, null);
  assert.equal(h.result.location.latitude, 35);
  assert.equal(h.timers, 0);
  h.unmount();
});

test('the first valid fix cancels its deadline while normal location updates continue', async () => {
  const h = createHarness();
  await h.flush();
  h.advanceTime(19_000);
  h.watches[0].callback(fix());
  await h.flush();
  assert.equal(h.timers, 0);
  h.advanceTime(60_000);
  h.watches[0].callback(fix(34));
  await h.flush();
  assert.equal(h.result.location.latitude, 34);
  assert.equal(h.result.error, null);
  assert.equal(h.watches[0].removes, 0);
  h.unmount();
});

test('a native watch whose creation outlasts the deadline is removed when it eventually resolves', async () => {
  const h = createHarness();
  const creation = deferred();
  h.config.createWatch = () => creation.promise;
  await h.flush();
  h.advanceTime(20_000);
  await h.flush();
  assert.equal(h.result.error, 'unavailable');
  assert.equal(h.watches[0].removes, 0, 'the unresolved native subscription has no removal handle yet');
  h.watches[0].callback(fix());
  creation.resolve(h.watches[0]);
  await h.flush();
  assert.equal(h.watches[0].removes, 1);
  assert.equal(h.result.location, null);
  assert.equal(h.result.isLocating, false);
  assert.equal(h.watches.length, 1);
  assert.equal(h.timers, 0);
  h.unmount();
});

test('retry can succeed before a timed-out creation resolves without letting the old watch affect it', async () => {
  const h = createHarness();
  const creation = deferred();
  h.config.createWatch = () => creation.promise;
  await h.flush();
  h.advanceTime(20_000);
  await h.flush();
  h.config.createWatch = null;
  h.result.retry();
  await h.flush();
  h.watches[1].callback(fix(34));
  await h.flush();
  creation.resolve(h.watches[0]);
  h.watches[0].callback(fix(36));
  await h.flush();
  assert.equal(h.result.location.latitude, 34);
  assert.equal(h.result.error, null);
  assert.equal(h.watches[0].removes, 1);
  assert.equal(h.watches[1].removes, 0);
  assert.equal(h.timers, 0);
  h.unmount();
});

for (const action of ['unmount', 'disable', 'blur', 'background']) {
  test(`${action} clears the first-fix deadline and stale callbacks cannot restore the session`, async () => {
    const h = createHarness();
    await h.flush();
    h.advanceTime(10_000);
    if (action === 'unmount') h.unmount();
    else if (action === 'disable') h.setEnabled(false);
    else if (action === 'blur') h.setFocused(false);
    else h.appState('background');
    await h.flush();
    assert.equal(h.timers, 0);
    h.advanceTime(60_000);
    h.watches[0].callback(fix());
    await h.flush();
    assert.equal(h.result.error, null);
    assert.equal(h.result.location, null);
    assert.equal(h.watches[0].removes, 1);
    if (action !== 'unmount') h.unmount();
  });
}

test('the first-fix deadline starts after permission resolution, not during the system permission dialog', async () => {
  const h = createHarness();
  const permission = deferred();
  h.config.permission = denied;
  h.config.requestPermission = () => permission.promise;
  await h.flush();
  h.appState('inactive');
  h.advanceTime(30_000);
  h.appState('active');
  h.advanceTime(30_000);
  await h.flush();
  assert.equal(h.timers, 0);
  assert.equal(h.result.error, null);
  assert.equal(h.requests, 1);
  permission.resolve(granted);
  await h.flush();
  assert.equal(h.watches.length, 1);
  assert.equal(h.timers, 1);
  h.advanceTime(19_999);
  await h.flush();
  assert.equal(h.result.isLocating, true);
  h.watches[0].callback(fix());
  await h.flush();
  assert.equal(h.result.location.latitude, 35);
  assert.equal(h.timers, 0);
  h.unmount();
});

test('resuming while native creation is still pending starts a new bounded wait and timeout cancels its queued restart', async () => {
  const h = createHarness();
  const creation = deferred();
  h.config.createWatch = () => creation.promise;
  await h.flush();
  h.advanceTime(10_000);
  h.appState('background');
  assert.equal(h.timers, 0);
  h.advanceTime(30_000);
  await h.flush();
  assert.equal(h.result.error, null);
  h.appState('active');
  await h.flush();
  assert.equal(h.result.isLocating, true);
  assert.equal(h.timers, 1);
  h.advanceTime(20_000);
  await h.flush();
  assert.equal(h.result.error, 'unavailable');
  creation.resolve(h.watches[0]);
  await h.flush();
  assert.equal(h.watches[0].removes, 1);
  assert.equal(h.watches.length, 1, 'a timed-out queued restart must not create a replacement watch');
  assert.equal(h.result.isLocating, false);
  assert.equal(h.timers, 0);
  h.unmount();
});
