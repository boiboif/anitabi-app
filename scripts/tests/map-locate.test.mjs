import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/hooks/use-map-locate.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const granted = { status: 'granted' };
const denied = { status: 'denied' };
const translate = (_key, options) => options.defaultValue;

// Exercise the shared hook's state and native calls; rendering remains a device check.
function createHarness({ trackCamera = false } = {}) {
  const slots = [];
  const effects = [];
  const appListeners = new Set();
  const locationListeners = new Set();
  const cameraMoves = [];
  const cameraEvents = [];
  const onCameraAnimationStart = trackCamera ? (duration) => cameraEvents.push(['start', duration]) : undefined;
  const alerts = [];
  const displacements = [];
  const puckStates = [];
  const config = { permission: granted, requestedPermission: granted, cachedLocation: null };
  let cursor = 0;
  let dirty = true;
  let result;
  let requests = 0;
  let timerId = 0;
  const sameDeps = (a, b) => a?.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useRef(current) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current };
      return slots[index];
    },
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [
        slots[index].value,
        (update) => {
          const next = typeof update === 'function' ? update(slots[index].value) : update;
          if (!Object.is(next, slots[index].value)) {
            slots[index].value = next;
            dirty = true;
          }
        },
      ];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { value: callback, deps };
      return slots[index].value;
    },
    useEffect(run, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps))
        effects.push(() => {
          slots[index]?.cleanup?.();
          slots[index] = { deps, cleanup: run() };
        });
    },
  };
  const AppState = {
    currentState: 'active',
    addEventListener: (_event, listener) => {
      appListeners.add(listener);
      return { remove: () => appListeners.delete(listener) };
    },
  };
  const appState = (state) => {
    AppState.currentState = state;
    appListeners.forEach((listener) => listener(state));
  };
  const locationManager = {
    addListener: (listener) => locationListeners.add(listener),
    removeListener: (listener) => locationListeners.delete(listener),
    start: () => {},
    setMinDisplacement: (value) => displacements.push(value),
    getLastKnownLocation: async () => config.getCachedLocation ? config.getCachedLocation() : config.cachedLocation,
  };
  const modules = {
    react,
    'expo-router': { useFocusEffect: (run) => react.useEffect(run, [run]) },
    'react-native': { AppState, Alert: { alert: (...args) => alerts.push(args) } },
    'react-i18next': { useTranslation: () => ({ t: translate }) },
    '@boiboif/react-native-toast': { Toast: { show: (message) => alerts.push([message]) } },
    '@rnmapbox/maps': { locationManager },
    '@/store/use-map-data': { useMapData: { getState: () => ({ status: 'ready' }) } },
    'expo-location': {
      getForegroundPermissionsAsync: async () => config.getPermission ? config.getPermission() : config.permission,
      requestForegroundPermissionsAsync: async () => {
        requests++;
        // Android's permission Activity can pause/resume even when already granted.
        appState('background');
        await flush();
        appState('active');
        await flush();
        config.permission = config.requestedPermission;
        return config.permission;
      },
      hasServicesEnabledAsync: async () => config.getServicesEnabled ? config.getServicesEnabled() : true,
    },
  };
  const context = vm.createContext({
    exports: {},
    require: (name) => {
      assert.ok(name in modules, `unexpected module: ${name}`);
      return modules[name];
    },
    Date,
    setTimeout: () => ++timerId,
    clearTimeout: () => {},
    setInterval: () => ++timerId,
    clearInterval: () => {},
  });
  vm.runInContext(compiled, context);
  const cameraRef = { current: { setCamera: (move) => { cameraMoves.push(move); cameraEvents.push(['move', move.animationDuration]); } } };
  async function flush() {
    for (let i = 0; i < 20; i++) {
      if (dirty) {
        dirty = false;
        cursor = 0;
        result = context.exports.useMapLocate(cameraRef, onCameraAnimationStart);
        puckStates.push([result.isLocationPuckActive, result.locationPuckRevision]);
        while (effects.length) effects.shift()();
      }
      await Promise.resolve();
    }
  }
  return {
    config,
    cameraMoves,
    cameraEvents,
    cameraRef,
    alerts,
    displacements,
    puckStates,
    appState,
    flush,
    get result() {
      return result;
    },
    get requests() {
      return requests;
    },
    emitLocation(location) {
      locationListeners.forEach((listener) => listener(location));
    },
    unmount() {
      slots.forEach((slot) => slot?.cleanup?.());
    },
  };
}

function fix(latitude = 35, longitude = 139, timestamp = Date.now()) {
  return { timestamp, coords: { latitude, longitude } };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('locate reports each camera animation immediately before issuing it', async () => {
  const h = createHarness({ trackCamera: true });
  await h.flush();
  h.emitLocation(fix(35, 139, Date.now() - 60_000));
  await h.result.handleLocate();
  h.emitLocation(fix(36, 140));
  assert.deepEqual(h.cameraEvents, [['start', 1000], ['move', 1000], ['start', 1000], ['move', 1000]]);

  h.cameraRef.current = null;
  await h.result.handleLocate();
  assert.equal(h.cameraEvents.length, 4, 'no animation is reported without a camera');
  h.unmount();
});

for (const stage of ['permission', 'services', 'cache']) {
  test(`canceling during ${stage} prevents the old request from moving the camera`, async () => {
    const h = createHarness();
    await h.flush();
    const pending = deferred();
    if (stage === 'permission') h.config.getPermission = () => pending.promise;
    if (stage === 'services') h.config.getServicesEnabled = () => pending.promise;
    if (stage === 'cache') h.config.getCachedLocation = () => pending.promise;
    const locate = h.result.handleLocate();
    await h.flush();
    h.result.cancelPendingCameraMovement();
    pending.resolve(stage === 'permission' ? granted : stage === 'services' ? true : fix());
    await locate;
    await h.flush();
    assert.equal(h.cameraMoves.length, 0);
    assert.equal(h.alerts.length, 0);
    delete h.config.getPermission;
    delete h.config.getServicesEnabled;
    delete h.config.getCachedLocation;
    h.emitLocation(fix());
    await h.result.handleLocate();
    assert.equal(h.cameraMoves.length, 1, 'a later locate can still use live location updates');
    h.unmount();
  });
}

test('canceling a pending fresh location releases the spinner and does not affect the next request', async () => {
  const h = createHarness();
  await h.flush();
  const first = h.result.handleLocate();
  await h.flush();
  assert.equal(h.result.isLocating, true);
  h.result.cancelPendingCameraMovement();
  await h.flush();
  assert.equal(h.result.isLocating, false);
  const second = h.result.handleLocate();
  await h.flush();
  assert.equal(h.result.isLocating, true);
  await first;
  await h.flush();
  assert.equal(h.result.isLocating, true, 'the older request cannot clear the newer spinner');
  h.emitLocation(fix());
  await second;
  await h.flush();
  assert.equal(h.cameraMoves.length, 1);
  assert.equal(h.result.isLocating, false);
  h.unmount();
});

test('canceling a stale-location refinement preserves live updates for a later locate', async () => {
  const h = createHarness();
  await h.flush();
  h.emitLocation(fix(35, 139, Date.now() - 60_000));
  await h.result.handleLocate();
  assert.equal(h.cameraMoves.length, 1);
  h.result.cancelPendingCameraMovement();
  h.emitLocation(fix(36, 140));
  assert.equal(h.cameraMoves.length, 1, 'the live update must not resume the old flight');
  await h.result.handleLocate();
  assert.equal(h.cameraMoves.length, 2);
  assert.equal(h.cameraMoves[1].centerCoordinate[0], 140);
  h.unmount();
});

test('leaving the screen invalidates an in-flight location request', async () => {
  const h = createHarness();
  await h.flush();
  const pending = deferred();
  h.config.getCachedLocation = () => pending.promise;
  const locate = h.result.handleLocate();
  await h.flush();
  h.unmount();
  pending.resolve(fix());
  await locate;
  assert.equal(h.cameraMoves.length, 0);
  assert.equal(h.alerts.length, 0);
});

test('starting a new locate cancels the previous stale-location refinement', async () => {
  const h = createHarness();
  await h.flush();
  h.emitLocation(fix(35, 139, Date.now() - 60_000));
  await h.result.handleLocate();
  const permission = deferred();
  h.config.getPermission = () => permission.promise;
  const second = h.result.handleLocate();
  h.emitLocation(fix(36, 140));
  assert.equal(h.cameraMoves.length, 1, 'the previous refinement cannot move the camera');
  permission.resolve(granted);
  await second;
  assert.equal(h.cameraMoves.length, 2);
  assert.equal(h.cameraMoves[1].centerCoordinate[0], 140);
  h.unmount();
});

test('repeated locate taps with granted permission never reopen the permission Activity or remount the puck', async () => {
  const h = createHarness();
  await h.flush();
  h.emitLocation(fix());
  h.puckStates.length = 0;
  const revision = h.result.locationPuckRevision;
  for (let i = 0; i < 3; i++) {
    await h.result.handleLocate();
    await h.flush();
    assert.equal(h.result.isLocationPuckActive, true);
    assert.equal(h.result.locationPuckRevision, revision);
  }
  assert.equal(h.requests, 0);
  assert.equal(h.cameraMoves.length, 3);
  assert.ok(h.puckStates.every(([active, value]) => active && value === revision));
  h.unmount();
});

for (const locationSource of ['memory', 'cache']) {
  test(`stale ${locationSource} position centers immediately and refines without remounting the puck`, async () => {
    const h = createHarness();
    await h.flush();
    const location = fix(35, 139, Date.now() - 60_000);
    if (locationSource === 'memory') h.emitLocation(location);
    else h.config.cachedLocation = location;
    const revision = h.result.locationPuckRevision;
    const recoveries = h.displacements.length;
    await h.result.handleLocate();
    await h.flush();
    assert.equal(h.cameraMoves.length, 1);
    assert.equal(h.cameraMoves[0].centerCoordinate[0], 139);
    assert.equal(h.result.locationPuckRevision, revision);
    assert.equal(h.displacements.length, recoveries + 1);
    h.emitLocation(fix(36, 140));
    assert.equal(h.cameraMoves.length, 2);
    assert.equal(h.cameraMoves[1].centerCoordinate[0], 140);
    assert.equal(h.requests, 0);
    h.unmount();
  });
}

test('a missing permission is still requested and a grant allows locating', async () => {
  const h = createHarness();
  await h.flush();
  h.config.permission = denied;
  h.config.cachedLocation = fix();
  await h.result.handleLocate();
  await h.flush();
  assert.equal(h.requests, 1);
  assert.equal(h.cameraMoves.length, 1);
  assert.equal(h.result.isLocationPuckActive, true);
  assert.equal(h.alerts.length, 0);
  h.unmount();
});

test('a denied permission keeps its existing error and does not move the camera', async () => {
  const h = createHarness();
  await h.flush();
  h.config.permission = denied;
  h.config.requestedPermission = denied;
  h.config.cachedLocation = fix();
  await h.result.handleLocate();
  await h.flush();
  assert.equal(h.requests, 1);
  assert.equal(h.cameraMoves.length, 0);
  assert.equal(h.alerts.length, 1);
  assert.equal(h.alerts[0][0], '位置权限被拒绝');
  h.unmount();
});

test('a genuine background/resume still hides the puck and performs its original remount recovery', async () => {
  const h = createHarness();
  await h.flush();
  const revision = h.result.locationPuckRevision;
  const recoveries = h.displacements.length;
  h.appState('background');
  await h.flush();
  assert.equal(h.result.isLocationPuckActive, false);
  h.appState('active');
  await h.flush();
  assert.equal(h.result.isLocationPuckActive, true);
  assert.equal(h.result.locationPuckRevision, revision + 1);
  assert.equal(h.displacements.length, recoveries + 1);
  assert.equal(h.requests, 0);
  h.unmount();
});
