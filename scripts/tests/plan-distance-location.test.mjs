import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/hooks/use-plan-distance-location.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const distanceUtils = {};
vm.runInNewContext(
  ts.transpileModule(readFileSync(new URL('../../src/utils/plan-point-distances.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports: distanceUtils },
);
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

function createHarness({ enabled = true, focused = true, active = true, platform = 'android' } = {}) {
  const slots = [];
  const effects = [];
  const listeners = new Set();
  const subscriptions = [];
  const locationListeners = new Set();
  const timers = new Map();
  const errors = [];
  const onError = (error) => errors.push(error);
  const startedAt = Date.now();
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
    listenerLocation: null,
    cachedLocation: null,
    getCachedLocation: null,
    addListenerError: null,
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
    'react-native': { AppState, Platform: { OS: platform } },
    '@/utils/plan-point-distances': distanceUtils,
    'expo-location': {
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
    },
    '@rnmapbox/maps': {
      locationManager: {
        addListener(callback) {
          if (config.addListenerError) throw config.addListenerError;
          subscriptions.push({ callback, removes: 0 });
          locationListeners.add(callback);
          // The real singleton immediately replays its in-memory last known fix.
          if (config.listenerLocation) callback(config.listenerLocation);
        },
        removeListener(callback) {
          locationListeners.delete(callback);
          const subscription = subscriptions.findLast((entry) => entry.callback === callback && entry.removes === 0);
          if (subscription) subscription.removes++;
        },
        getLastKnownLocation: () =>
          config.getCachedLocation ? config.getCachedLocation() : Promise.resolve(config.cachedLocation),
        stop: () => assert.fail('must not stop the shared location manager'),
        removeAllListeners: () => assert.fail('must not remove other map listeners'),
        setMinDisplacement: () => assert.fail('must not change shared displacement settings'),
      },
    },
  };
  const context = vm.createContext({
    exports: {},
    require: (name) => {
      assert.ok(name in modules, `unexpected module: ${name}`);
      return modules[name];
    },
    Date: class extends Date {
      static now() {
        return startedAt + elapsed;
      }
    },
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
    result = context.exports.usePlanDistanceLocation(enabled, onError);
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
    subscriptions,
    errors,
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
    get locationListeners() {
      return locationListeners.size;
    },
    addOtherLocationListener(callback) {
      locationListeners.add(callback);
    },
    emitLocation(location) {
      locationListeners.forEach((listener) => listener(location));
    },
    get now() {
      return startedAt + elapsed;
    },
    fix(latitude = 35, longitude = 139, timestamp = startedAt + elapsed) {
      return { timestamp, coords: { latitude, longitude, accuracy: 50 } };
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
  assert.equal(h.subscriptions.length, 1);
  assert.equal(h.locationListeners, 1);
  assert.equal(h.requests, 0);
  h.unmount();
  assert.equal(h.listeners, 0);
  assert.equal(h.subscriptions[0].removes, 1);
});

test('accepts fresh coordinates and ignores invalid, stale, future and out-of-order fixes', async () => {
  const h = createHarness();
  await h.flush();
  const watch = h.subscriptions[0];
  const now = h.now;
  watch.callback(h.fix(35, 139, now));
  await h.flush();
  for (const bad of [
    h.fix(91, 139),
    h.fix(35, NaN),
    h.fix(34, 139, now - 61_000),
    h.fix(34, 139, now + 6_000),
    h.fix(34, 139, now - 1),
    h.fix(34, 139, NaN),
    { ...h.fix(), timestamp: undefined },
  ]) {
    watch.callback(bad);
  }
  await h.flush();
  assert.equal(h.result.location.latitude, 35);
  assert.equal(h.result.isLocating, false);
  h.unmount();
});

test('synchronous cached replay during registration supplies the first fix and cancels its deadline', async () => {
  const h = createHarness();
  h.config.listenerLocation = h.fix();
  await h.flush();
  assert.equal(h.result.location.latitude, 35);
  assert.equal(h.result.isLocating, false);
  assert.equal(h.timers, 0);
  h.advanceTime(20_000);
  await h.flush();
  assert.deepEqual(h.errors, []);
  h.unmount();
  assert.equal(h.subscriptions[0].removes, 1);
});

test('a fresh asynchronous cached fix supplies the first position without waiting for a live update', async () => {
  const h = createHarness();
  h.config.cachedLocation = h.fix();
  await h.flush();
  assert.equal(h.result.location.latitude, 35);
  assert.equal(h.result.isLocating, false);
  assert.equal(h.timers, 0);
  h.unmount();
});

test('stale synchronous and asynchronous cached fixes keep waiting for a fresh first fix', async () => {
  const h = createHarness();
  h.config.listenerLocation = h.fix(35, 139, h.now - 61_000);
  h.config.cachedLocation = h.config.listenerLocation;
  await h.flush();
  assert.equal(h.result.location, null);
  assert.equal(h.result.isLocating, true);
  assert.equal(h.timers, 1);
  h.subscriptions[0].callback(h.fix());
  await h.flush();
  assert.equal(h.result.location.latitude, 35);
  assert.equal(h.timers, 0);
  h.unmount();
});

test('consumer cleanup and timeout preserve another map listener on the shared manager', async () => {
  const h = createHarness();
  const otherLocations = [];
  h.addOtherLocationListener((location) => otherLocations.push(location));
  await h.flush();
  assert.equal(h.locationListeners, 2);
  h.advanceTime(20_000);
  await h.flush();
  assert.equal(h.result.error, 'unavailable');
  assert.equal(h.locationListeners, 1);
  h.emitLocation(h.fix());
  assert.equal(otherLocations.length, 1);
  h.result.retry();
  await h.flush();
  assert.equal(h.locationListeners, 2);
  h.setEnabled(false);
  await h.flush();
  assert.equal(h.locationListeners, 1);
  h.emitLocation(h.fix());
  assert.equal(otherLocations.length, 2);
  h.unmount();
  assert.equal(h.locationListeners, 1);
});

test('same-coordinate heading changes and movement below ten meters do not invalidate distance sorting', async () => {
  const h = createHarness();
  await h.flush();
  h.emitLocation(h.fix());
  await h.flush();
  const position = h.result.location;
  h.advanceTime(1_000);
  h.emitLocation({ ...h.fix(), coords: { ...h.fix().coords, heading: 90 } });
  h.emitLocation(h.fix(35.00004));
  await h.flush();
  assert.equal(h.result.location, position);
  assert.equal(h.timers, 0);
  h.unmount();
});

test('Android movement bursts publish only the latest eligible location after ten seconds', async () => {
  const h = createHarness();
  await h.flush();
  h.emitLocation(h.fix());
  await h.flush();
  h.advanceTime(1_000);
  h.emitLocation(h.fix(35.0002));
  h.advanceTime(1_000);
  h.emitLocation(h.fix(35.0004));
  await h.flush();
  assert.equal(h.result.location.latitude, 35);
  assert.equal(h.timers, 1);
  h.advanceTime(7_999);
  await h.flush();
  assert.equal(h.result.location.latitude, 35);
  h.advanceTime(1);
  await h.flush();
  assert.equal(h.result.location.latitude, 35.0004);
  assert.equal(h.timers, 0);
  h.unmount();
});

test('a latest fix back within ten meters cancels a queued movement instead of publishing an older point', async () => {
  const h = createHarness();
  await h.flush();
  h.emitLocation(h.fix());
  await h.flush();
  h.advanceTime(1_000);
  h.emitLocation(h.fix(35.0002));
  assert.equal(h.timers, 1);
  h.advanceTime(1_000);
  h.emitLocation(h.fix(35.00004));
  assert.equal(h.timers, 0);
  h.advanceTime(10_000);
  await h.flush();
  assert.equal(h.result.location.latitude, 35);
  h.unmount();
});

test('iOS movement over ten meters keeps its existing immediate update behavior', async () => {
  const h = createHarness({ platform: 'ios' });
  await h.flush();
  h.emitLocation(h.fix());
  await h.flush();
  h.advanceTime(1_000);
  h.emitLocation(h.fix(35.0002));
  await h.flush();
  assert.equal(h.result.location.latitude, 35.0002);
  assert.equal(h.timers, 0);
  h.unmount();
});

for (const action of ['disable', 'background', 'unmount']) {
  test(`${action} clears a pending coalesced movement update`, async () => {
    const h = createHarness();
    await h.flush();
    h.emitLocation(h.fix());
    await h.flush();
    h.advanceTime(1_000);
    h.emitLocation(h.fix(35.0002));
    assert.equal(h.timers, 1);
    if (action === 'unmount') h.unmount();
    else if (action === 'background') h.appState('background');
    else h.setEnabled(false);
    await h.flush();
    assert.equal(h.timers, 0);
    h.advanceTime(20_000);
    await h.flush();
    assert.deepEqual(h.errors, []);
    if (action !== 'unmount') {
      assert.equal(h.result.location, null);
      h.unmount();
    }
  });
}

test('background stops and discards old callbacks; foreground restarts and disable releases listeners', async () => {
  const h = createHarness();
  await h.flush();
  h.appState('background');
  h.subscriptions[0].callback(h.fix());
  await h.flush();
  assert.equal(h.subscriptions[0].removes, 1);
  assert.equal(h.result.location, null);
  h.appState('active');
  await h.flush();
  assert.equal(h.subscriptions.length, 2);
  h.setEnabled(false);
  await h.flush();
  assert.equal(h.subscriptions[1].removes, 1);
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
  assert.equal(h.subscriptions.length, 1);
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
    assert.equal(h.subscriptions.length, 0);
    permission.resolve(granted);
    await h.flush();
    if (!resumeBeforeResolve) {
      assert.equal(h.subscriptions.length, 0);
      h.appState('active');
      await h.flush();
    }
    assert.equal(h.requests, 1);
    assert.equal(h.subscriptions.length, 1);
    h.subscriptions[0].callback(h.fix());
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
  assert.deepEqual(h.errors, ['permission']);
  h.appState('background');
  h.appState('active');
  await h.flush();
  assert.equal(h.requests, 1);
  h.config.requestPermission = async () => granted;
  h.result.retry();
  await h.flush();
  assert.equal(h.requests, 2);
  assert.equal(h.subscriptions.length, 1);
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
  assert.equal(h.subscriptions.length, 1);
  h.unmount();
});

test('system services disabled reports a recoverable error without starting a watch', async () => {
  const h = createHarness();
  h.config.servicesEnabled = false;
  await h.flush();
  assert.equal(h.result.error, 'services');
  assert.deepEqual(h.errors, ['services']);
  assert.equal(h.subscriptions.length, 0);
  h.config.servicesEnabled = true;
  h.result.retry();
  await h.flush();
  assert.equal(h.subscriptions.length, 1);
  h.unmount();
});

for (const action of ['unmount', 'disable', 'blur']) {
  test(`a cached lookup resolving after ${action} cannot update location`, async () => {
    const h = createHarness();
    const cache = deferred();
    h.config.getCachedLocation = () => cache.promise;
    await h.flush();
    const watch = h.subscriptions[0];
    if (action === 'unmount') h.unmount();
    else if (action === 'disable') h.setEnabled(false);
    else h.setFocused(false);
    await h.flush();
    cache.resolve(h.fix());
    watch.callback(h.fix());
    await h.flush();
    assert.equal(watch.removes, 1);
    assert.equal(h.result.location, null);
    assert.equal(h.listeners, 0);
    if (action !== 'unmount') h.unmount();
  });
}

test('suspension during a cached lookup removes its listener and starts a new session immediately', async () => {
  const h = createHarness();
  const cache = deferred();
  h.config.getCachedLocation = () => cache.promise;
  await h.flush();
  h.appState('background');
  h.appState('active');
  await h.flush();
  assert.equal(h.subscriptions[0].removes, 1);
  assert.equal(h.subscriptions.length, 2);
  assert.equal(h.subscriptions[1].removes, 0);
  h.subscriptions[1].callback(h.fix(34));
  cache.resolve(h.fix(36, 139, h.now - 1));
  await h.flush();
  assert.equal(h.result.location.latitude, 34);
  h.unmount();
});

test('cached lookup rejection leaves the live listener available until it supplies a fix', async () => {
  const h = createHarness();
  h.config.getCachedLocation = () => Promise.reject(new Error('cache unavailable'));
  await h.flush();
  assert.equal(h.result.error, null);
  assert.equal(h.result.isLocating, true);
  assert.deepEqual(h.errors, []);
  h.subscriptions[0].callback(h.fix());
  await h.flush();
  assert.equal(h.result.location.latitude, 35);
  assert.equal(h.timers, 0);
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

test('listener registration failure is reported and a later retry can recover', async () => {
  const h = createHarness();
  h.config.addListenerError = new Error('native startup failed');
  await h.flush();
  assert.equal(h.result.error, 'unavailable');
  assert.deepEqual(h.errors, ['unavailable']);
  assert.equal(h.result.isLocating, false);
  h.config.addListenerError = null;
  h.result.retry();
  await h.flush();
  assert.equal(h.subscriptions.length, 1);
  h.unmount();
});

test('no usable first fix times out after 20 seconds, removes the watch and allows explicit retry', async () => {
  const h = createHarness();
  await h.flush();
  const watch = h.subscriptions[0];
  assert.equal(h.timers, 1);
  watch.callback(h.fix(91));
  watch.callback(h.fix(35, 139, h.now - 61_000));
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
  watch.callback(h.fix());
  await h.flush();
  assert.equal(h.result.location, null, 'a late fix cannot revive the timed-out attempt');
  assert.deepEqual(h.errors, ['unavailable']);
  h.result.retry();
  await h.flush();
  assert.equal(h.subscriptions.length, 2);
  h.subscriptions[1].callback(h.fix());
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
  h.subscriptions[0].callback(h.fix());
  await h.flush();
  assert.equal(h.timers, 0);
  h.advanceTime(60_000);
  h.subscriptions[0].callback(h.fix(34));
  await h.flush();
  assert.equal(h.result.location.latitude, 34);
  assert.equal(h.result.error, null);
  assert.deepEqual(h.errors, []);
  assert.equal(h.subscriptions[0].removes, 0);
  h.unmount();
});

test('a cached lookup outlasting the first-fix deadline cannot revive its expired session', async () => {
  const h = createHarness();
  const cache = deferred();
  h.config.getCachedLocation = () => cache.promise;
  await h.flush();
  h.advanceTime(20_000);
  await h.flush();
  assert.equal(h.result.error, 'unavailable');
  assert.equal(h.subscriptions[0].removes, 1);
  h.subscriptions[0].callback(h.fix());
  cache.resolve(h.fix());
  await h.flush();
  assert.equal(h.subscriptions[0].removes, 1);
  assert.equal(h.result.location, null);
  assert.equal(h.result.isLocating, false);
  assert.equal(h.subscriptions.length, 1);
  assert.equal(h.timers, 0);
  h.unmount();
});

test('retry can succeed before a timed-out cache resolves without accepting its old result', async () => {
  const h = createHarness();
  const cache = deferred();
  h.config.getCachedLocation = () => cache.promise;
  await h.flush();
  h.advanceTime(20_000);
  await h.flush();
  h.config.getCachedLocation = null;
  h.result.retry();
  await h.flush();
  h.subscriptions[1].callback(h.fix(34));
  await h.flush();
  cache.resolve(h.fix(36));
  h.subscriptions[0].callback(h.fix(36));
  await h.flush();
  assert.equal(h.result.location.latitude, 34);
  assert.equal(h.result.error, null);
  assert.equal(h.subscriptions[0].removes, 1);
  assert.equal(h.subscriptions[1].removes, 0);
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
    h.subscriptions[0].callback(h.fix());
    await h.flush();
    assert.equal(h.result.error, null);
    assert.equal(h.result.location, null);
    assert.deepEqual(h.errors, []);
    assert.equal(h.subscriptions[0].removes, 1);
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
  assert.equal(h.subscriptions.length, 1);
  assert.equal(h.timers, 1);
  h.advanceTime(19_999);
  await h.flush();
  assert.equal(h.result.isLocating, true);
  h.subscriptions[0].callback(h.fix());
  await h.flush();
  assert.equal(h.result.location.latitude, 35);
  assert.equal(h.timers, 0);
  h.unmount();
});

test('resuming while an old cache is pending starts a separate bounded session', async () => {
  const h = createHarness();
  const cache = deferred();
  h.config.getCachedLocation = () => cache.promise;
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
  cache.resolve(h.fix());
  await h.flush();
  assert.equal(h.subscriptions[0].removes, 1);
  assert.equal(h.subscriptions.length, 2, 'resume subscribes immediately without waiting for the old cache');
  assert.equal(h.subscriptions[1].removes, 1);
  assert.equal(h.result.isLocating, false);
  assert.equal(h.timers, 0);
  h.unmount();
});
