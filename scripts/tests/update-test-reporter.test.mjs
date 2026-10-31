import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/hooks/use-update-test-reporter.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup({
  extra = { appVariant: 'test', updateTestServerUrl: 'http://127.0.0.1:18790/' },
  nativeUpdates = { updateId: 'embedded-native-uuid', isEmbeddedLaunch: true, runtimeVersion: '0.8.0-sdk58' },
  nativeApplication = {
    applicationId: 'bbf.anitabiapp.test.otaa',
    nativeBuildVersion: '5602',
    nativeApplicationVersion: '0.8.0',
  },
  versionInfo = { displayVersion: '0.8.0-a1111111', contentRevision: 'a1111111' },
  marker = 'bundle-A',
  fetchImpl = async () => ({ ok: true }),
} = {}) {
  const imports = [];
  const requests = [];
  const listeners = new Set();
  const appState = {
    currentState: 'active',
    addEventListener(event, listener) {
      assert.equal(event, 'change');
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  let previousDependencies;
  let cleanup;
  let nextEffect;
  const dependencies = {
    'expo-constants': { __esModule: true, default: { expoConfig: { extra } } },
    'react-native': { AppState: appState },
    react: {
      useEffect(effect, values) {
        const same =
          previousDependencies && values.every((value, index) => Object.is(value, previousDependencies[index]));
        if (!same) {
          previousDependencies = values;
          nextEffect = effect;
        }
      },
    },
    'expo-updates': nativeUpdates,
    'expo-application': nativeApplication,
    '@/services/app-update': { getCurrentAppVersionInfo: () => versionInfo },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      imports.push(name);
      assert.ok(name in dependencies, `Unexpected reporter dependency: ${name}`);
      return dependencies[name];
    },
    process: { env: { EXPO_PUBLIC_OTA_TEST_MARKER: marker } },
    AbortController,
    async fetch(url, options) {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return fetchImpl(url, options);
    },
  });
  return {
    imports,
    requests,
    listeners,
    render(state = {}) {
      exports.useUpdateTestReporter({ hotUpdateReady: false, binaryUpdate: null, isChecking: false, ...state });
      if (nextEffect) {
        cleanup?.();
        cleanup = nextEffect();
        nextEffect = undefined;
      }
    },
    changeAppState(value) {
      appState.currentState = value;
      for (const listener of [...listeners]) listener(value);
    },
    unmount() {
      cleanup?.();
    },
    async settle() {
      for (let index = 0; index < 24; index++) await Promise.resolve();
    },
  };
}

const heavyModules = ['expo-updates', 'expo-application', '@/services/app-update'];

for (const [name, extra] of [
  ['production without a server URL', { appVariant: 'production' }],
  [
    'production with an accidental server URL',
    { appVariant: 'production', updateTestServerUrl: 'http://localhost:1234' },
  ],
  ['development with a server URL', { appVariant: 'development', updateTestServerUrl: 'http://localhost:1234' }],
  ['a test build without a server URL', { appVariant: 'test' }],
  ['a test build with a blank URL', { appVariant: 'test', updateTestServerUrl: '  ' }],
  ['a test build with a non-HTTP URL', { appVariant: 'test', updateTestServerUrl: 'file:///private/reports' }],
]) {
  test(`${name} neither loads native update services nor sends reports`, async () => {
    const runtime = setup({ extra });
    assert.ok(
      heavyModules.every((name) => !runtime.imports.includes(name)),
      'no native update modules load at import time',
    );
    runtime.render();
    await runtime.settle();
    runtime.changeAppState('active');
    await runtime.settle();
    assert.ok(heavyModules.every((name) => !runtime.imports.includes(name)));
    assert.equal(runtime.requests.length, 0);
    assert.equal(runtime.listeners.size, 0);
  });
}

test('the test probe reports the actual SDK constants and active manager state', async () => {
  const runtime = setup();
  runtime.render({ hotUpdateReady: true, isChecking: true, binaryUpdate: { buildNumber: 5700 } });
  assert.equal(runtime.requests.length, 0, 'render does not block on importing or posting');
  await runtime.settle();
  assert.equal(runtime.requests.length, 1);
  const { url, options, body } = runtime.requests[0];
  assert.equal(url, 'http://127.0.0.1:18790/reports');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.deepEqual(body, {
    updateId: 'embedded-native-uuid',
    isEmbeddedLaunch: true,
    runtimeVersion: '0.8.0-sdk58',
    packageName: 'bbf.anitabiapp.test.otaa',
    nativeBuildVersion: '5602',
    nativeApplicationVersion: '0.8.0',
    displayVersion: '0.8.0-a1111111',
    contentRevision: 'a1111111',
    hotUpdateReady: true,
    binaryUpdateBuildNumber: 5700,
    isChecking: true,
    appState: 'active',
    bundleMarker: 'bundle-A',
  });
});

test('an applied OTA reports its own SDK launch flags while retaining the installed binary identity', async () => {
  const runtime = setup({
    nativeUpdates: { updateId: 'ota-2-native-uuid', isEmbeddedLaunch: false, runtimeVersion: '0.8.0-sdk58' },
    nativeApplication: {
      applicationId: 'bbf.anitabiapp.test.otab',
      nativeBuildVersion: '1026',
      nativeApplicationVersion: '0.8.0',
    },
    versionInfo: { displayVersion: '0.8.0-c3333333', contentRevision: 'c3333333' },
    marker: 'OTA-2',
  });
  runtime.render();
  await runtime.settle();
  const report = runtime.requests[0].body;
  assert.equal(report.isEmbeddedLaunch, false);
  assert.equal(report.updateId, 'ota-2-native-uuid');
  assert.equal(report.nativeBuildVersion, '1026');
  assert.equal(report.packageName, 'bbf.anitabiapp.test.otab');
  assert.equal(report.displayVersion, '0.8.0-c3333333');
  assert.equal(report.contentRevision, 'c3333333');
  assert.equal(report.bundleMarker, 'OTA-2');
});

test('update state changes send new reports without reporting every progress render', async () => {
  const runtime = setup();
  runtime.render();
  await runtime.settle();
  runtime.render({ binaryProgress: { bytesWritten: 1000, totalBytes: 10000 }, isDownloadingBinary: true });
  await runtime.settle();
  assert.equal(runtime.requests.length, 1);

  runtime.render({ isChecking: true });
  await runtime.settle();
  runtime.render({ hotUpdateReady: true });
  await runtime.settle();
  runtime.render({ hotUpdateReady: true, binaryUpdate: { buildNumber: 5700 } });
  await runtime.settle();
  assert.equal(runtime.requests.length, 4);
  assert.equal(runtime.requests[1].body.isChecking, true);
  assert.equal(runtime.requests[2].body.hotUpdateReady, true);
  assert.equal(runtime.requests[3].body.binaryUpdateBuildNumber, 5700);
});

test('foregrounding sends the latest state once and backgrounding does not add a progress loop', async () => {
  const runtime = setup();
  runtime.render({ hotUpdateReady: true });
  await runtime.settle();
  runtime.changeAppState('background');
  await runtime.settle();
  assert.equal(runtime.requests.length, 1);
  runtime.changeAppState('active');
  await runtime.settle();
  assert.equal(runtime.requests.length, 2);
  assert.equal(runtime.requests[1].body.appState, 'active');
  assert.equal(runtime.requests[1].body.hotUpdateReady, true);
});

test('unmount removes foreground listeners and aborts an in-flight request', async () => {
  const runtime = setup({ fetchImpl: () => new Promise(() => {}) });
  runtime.render();
  await runtime.settle();
  assert.equal(runtime.requests.length, 1);
  assert.equal(runtime.listeners.size, 1);
  runtime.unmount();
  assert.equal(runtime.listeners.size, 0);
  assert.equal(runtime.requests[0].options.signal.aborted, true);
  runtime.changeAppState('active');
  await runtime.settle();
  assert.equal(runtime.requests.length, 1);
});

test('unmount before the lazy imports settle prevents a stale report', async () => {
  const runtime = setup();
  runtime.render();
  runtime.unmount();
  await runtime.settle();
  assert.equal(runtime.requests.length, 0);
});

for (const [name, fetchImpl] of [
  [
    'a disconnected server',
    async () => {
      throw new Error('Network unavailable');
    },
  ],
  ['an HTTP rejection', async () => ({ ok: false })],
]) {
  test(`${name} does not interrupt app behavior or prevent later foreground reports`, async () => {
    const runtime = setup({ fetchImpl });
    runtime.render();
    await runtime.settle();
    runtime.changeAppState('active');
    await runtime.settle();
    assert.equal(runtime.requests.length, 2);
  });
}
