import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const binaryUpdate = {
  version: '0.8.0',
  buildNumber: 1027,
  apkUrl: 'https://example.test/anitabi-1027.apk',
};
const higherVersionBinaryUpdate = {
  version: '0.9.0',
  buildNumber: 1100,
  apkUrl: 'https://example.test/anitabi-1100.apk',
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

// Execute the real hook, including startup effects and its module-local lazy
// imports. The hook runner retains state, refs and dependency-sensitive callbacks
// between renders; only platform services and the download boundary are doubles.
function setup({
  downloaded = false,
  backgroundTask = false,
  binary = binaryUpdate,
  hotAvailable = false,
  discoveryGate,
  fullReject = null,
  hotCheckGate,
  hotCheckReject = null,
  hotFetchGate,
  hotIsNew = true,
  hotFetchReject = null,
} = {}) {
  const calls = {
    binaryChecks: 0,
    binaryReturns: 0,
    hotChecks: 0,
    hotCheckReturns: 0,
    hotFetches: 0,
    hotFetchReturns: 0,
    reloads: 0,
    downloads: 0,
    installs: 0,
    downloadOptions: [],
  };
  const scenario = {
    binary,
    backgroundTask,
    hotAvailable,
    discoveryGate,
    fullReject,
    hotCheckGate,
    hotCheckReject,
    hotFetchGate,
    hotIsNew,
    hotFetchReject,
  };
  const pendingDownloads = [];
  const timers = new Map();
  const hookCells = [];
  let hookCursor = 0;
  let pendingEffects = [];
  let nextTimerId = 0;
  let isDownloaded = downloaded;
  const translate = (_key, options) => options?.defaultValue ?? _key;
  const sameDependencies = (left, right) =>
    Boolean(
      left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index])),
    );

  const react = {
    useState(initial) {
      const index = hookCursor++;
      if (!(index in hookCells)) {
        hookCells[index] = { value: typeof initial === 'function' ? initial() : initial };
      }
      return [
        hookCells[index].value,
        (next) => {
          hookCells[index].value = typeof next === 'function' ? next(hookCells[index].value) : next;
        },
      ];
    },
    useRef(initial) {
      const index = hookCursor++;
      if (!(index in hookCells)) hookCells[index] = { current: initial };
      return hookCells[index];
    },
    useCallback(callback, dependencies) {
      const index = hookCursor++;
      if (!sameDependencies(hookCells[index]?.dependencies, dependencies)) {
        hookCells[index] = { dependencies, callback };
      }
      return hookCells[index].callback;
    },
    useEffect(effect, dependencies) {
      const index = hookCursor++;
      if (!sameDependencies(hookCells[index]?.dependencies, dependencies)) {
        const previous = hookCells[index];
        const next = { dependencies, cleanup: undefined };
        hookCells[index] = next;
        pendingEffects.push(() => {
          previous?.cleanup?.();
          next.cleanup = effect();
        });
      }
    },
  };

  const appUpdate = {
    async checkBinaryUpdate() {
      calls.binaryChecks++;
      if (scenario.discoveryGate) await scenario.discoveryGate.promise;
      if (scenario.fullReject) throw scenario.fullReject;
      calls.binaryReturns++;
      return scenario.binary;
    },
    isBinaryUpdateDownloaded: () => isDownloaded,
    hasBackgroundBinaryUpdateDownload: () => scenario.backgroundTask,
    getResumableBinaryDownloadProgress: () =>
      scenario.backgroundTask ? { bytesWritten: 400, totalBytes: 1000, percent: 40 } : null,
    async downloadAndInstallBinaryUpdate(update, _onProgress, options) {
      assert.equal(update, scenario.binary);
      calls.downloads++;
      calls.downloadOptions.push(options);
      if (isDownloaded) {
        if (options?.installWhenReady !== false) calls.installs++;
        return 'completed';
      }
      const completion = deferred();
      pendingDownloads.push(completion);
      const result = await completion.promise;
      if (result === 'completed' && options?.installWhenReady !== false) calls.installs++;
      return result;
    },
  };
  const updates = {
    isEnabled: true,
    async checkForUpdateAsync() {
      calls.hotChecks++;
      if (scenario.hotCheckGate) await scenario.hotCheckGate.promise;
      if (scenario.hotCheckReject) throw scenario.hotCheckReject;
      calls.hotCheckReturns++;
      return { isAvailable: scenario.hotAvailable };
    },
    async fetchUpdateAsync() {
      calls.hotFetches++;
      if (scenario.hotFetchGate) await scenario.hotFetchGate.promise;
      if (scenario.hotFetchReject) throw scenario.hotFetchReject;
      calls.hotFetchReturns++;
      return { isNew: scenario.hotIsNew };
    },
    async reloadAsync() {
      calls.reloads++;
    },
  };
  const dependencies = {
    react,
    'react-i18next': { useTranslation: () => ({ t: translate }) },
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { appUpdatesEnabled: true } } } },
    '@/services/app-update': appUpdate,
    'expo-updates': updates,
  };
  const source = readFileSync(new URL('../../src/hooks/use-app-updates.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      assert.ok(name in dependencies, `Unexpected hook dependency: ${name}`);
      return dependencies[name];
    },
    __DEV__: false,
    console,
    setTimeout(callback) {
      const id = ++nextTimerId;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  });

  function render() {
    hookCursor = 0;
    const manager = exports.useAppUpdates();
    const effects = pendingEffects;
    pendingEffects = [];
    effects.forEach((effect) => effect());
    return manager;
  }
  return {
    calls,
    render,
    configure: (next) => Object.assign(scenario, next),
    async settle() {
      for (let index = 0; index < 24; index++) await Promise.resolve();
    },
    async startup() {
      for (const [id, callback] of [...timers]) {
        timers.delete(id);
        callback();
      }
      for (let index = 0; index < 24; index++) await Promise.resolve();
    },
    finishDownload(result = 'completed') {
      if (result === 'completed') isDownloaded = true;
      assert.ok(pendingDownloads.length, 'Expected a running download');
      pendingDownloads.shift().resolve(result);
    },
    cancelPendingDownloads() {
      for (const completion of pendingDownloads.splice(0)) completion.resolve('cancelled');
    },
  };
}

function releaseAfterTest(context, runtime, ...gates) {
  context.after(async () => {
    gates.forEach((gate) => gate.resolve());
    await runtime.settle();
    runtime.cancelPendingDownloads();
    await runtime.settle();
  });
}

test('completed library metadata shows the cached APK without automatically reopening the installer', async () => {
  const runtime = setup({ downloaded: true, backgroundTask: true });
  let manager = runtime.render();
  await runtime.startup();
  manager = runtime.render();
  assert.equal(manager.binaryUpdate, binaryUpdate);
  assert.equal(manager.isBinaryDownloaded, true);
  assert.equal(manager.isBinaryUpdateVisible, true);
  assert.equal(manager.isDownloadingBinary, false);
  assert.equal(runtime.calls.downloads, 0);
  assert.equal(runtime.calls.installs, 0);

  await manager.checkNow();
  assert.equal(runtime.calls.downloads, 0, 'a repeated manual check must not silently open the installer');
  await manager.installBinaryUpdate();
  assert.equal(runtime.calls.downloads, 1, 'the explicit install action remains available');
  assert.equal(runtime.calls.installs, 1);
});

test('the startup update check reattaches an unfinished library download without a second user action', async () => {
  const runtime = setup({ backgroundTask: true });
  runtime.render();
  await runtime.startup();
  const manager = runtime.render();
  assert.equal(runtime.calls.binaryChecks, 1);
  assert.equal(runtime.calls.hotChecks, 1);
  assert.equal(runtime.calls.downloads, 1);
  assert.equal(manager.isDownloadingBinary, true);
  assert.equal(manager.binaryProgress?.bytesWritten, 400);
  assert.equal(runtime.calls.installs, 0);
  assert.equal(runtime.calls.downloadOptions[0]?.installWhenReady, false);

  runtime.finishDownload();
  await runtime.settle();
  const finished = runtime.render();
  assert.equal(finished.isDownloadingBinary, false);
  assert.equal(finished.isBinaryDownloaded, true);
  assert.equal(runtime.calls.installs, 0);
  await finished.installBinaryUpdate();
  assert.equal(runtime.calls.installs, 1);
  assert.notEqual(runtime.calls.downloadOptions.at(-1)?.installWhenReady, false);
});

test('repeated checks and install clicks share the active download monitor', async () => {
  const runtime = setup({ backgroundTask: true });
  const manager = runtime.render();
  await runtime.startup();
  assert.equal(runtime.calls.downloads, 1);
  await manager.checkNow();
  await manager.checkNow();
  await manager.installBinaryUpdate();
  assert.equal(runtime.calls.binaryChecks, 3);
  assert.equal(runtime.calls.downloads, 1, 'downloadRunningRef must guard all paths while the download is active');
  runtime.finishDownload();
  await runtime.settle();
  await manager.checkNow();
  assert.equal(runtime.calls.downloads, 1, 'completed cache must stop future automatic reattachment');
  assert.equal(runtime.calls.installs, 0);
});

for (const binary of [null, binaryUpdate, higherVersionBinaryUpdate]) {
  test(`an available OTA downloads but only prompts without a newer binary (${binary?.version ?? 'no binary'})`, async () => {
    const runtime = setup({ binary, hotAvailable: true });
    runtime.render();
    await runtime.startup();
    const manager = runtime.render();
    assert.equal(runtime.calls.binaryChecks, 1);
    assert.equal(runtime.calls.hotChecks, 1);
    assert.equal(runtime.calls.hotFetches, 1);
    assert.equal(runtime.calls.downloads, 0);
    assert.equal(manager.hotUpdateReady, binary === null);
    assert.equal(manager.binaryUpdate, binary);
    assert.equal(manager.isBinaryUpdateVisible, binary !== null);
    assert.equal(manager.isDownloadingBinary, false);
    assert.equal(runtime.calls.reloads, 0, 'downloading an OTA must not restart the app');
    if (binary) {
      manager.dismissBinaryUpdate();
      assert.equal(runtime.render().isBinaryUpdateVisible, false);
      assert.equal(runtime.render().hotUpdateReady, false, 'dismissing the binary dialog must not expose the OTA');
      await manager.reloadForHotUpdate();
      assert.equal(runtime.calls.reloads, 0, 'a stale OTA action must not restart while the binary is known');
    }
  });
}

test('a late OTA fetch remains silent after the newer binary dialog is dismissed', async () => {
  const hotFetchGate = deferred();
  const runtime = setup({ binary: higherVersionBinaryUpdate, hotAvailable: true, hotFetchGate });
  runtime.render();
  await runtime.startup();
  let manager = runtime.render();
  assert.equal(runtime.calls.hotFetches, 1);
  assert.equal(manager.binaryUpdate, higherVersionBinaryUpdate);
  assert.equal(manager.isBinaryUpdateVisible, true);
  assert.equal(manager.isChecking, true);
  assert.equal(manager.hotUpdateReady, false);
  manager.dismissBinaryUpdate();
  hotFetchGate.resolve();
  await runtime.settle();
  manager = runtime.render();
  assert.equal(manager.isChecking, false);
  assert.equal(manager.isBinaryUpdateVisible, false);
  assert.equal(manager.hotUpdateReady, false);
  assert.equal(runtime.calls.reloads, 0);
  manager.showBinaryUpdate();
  assert.equal(runtime.render().isBinaryUpdateVisible, true, 'the newer binary remains available after dismissal');
});

test('discovering a newer binary clears an earlier OTA prompt before its next fetch finishes', async () => {
  const runtime = setup({ binary: null, hotAvailable: true });
  runtime.render();
  await runtime.startup();
  const earlierOtaPrompt = runtime.render();
  assert.equal(earlierOtaPrompt.hotUpdateReady, true);

  const hotFetchGate = deferred();
  runtime.configure({ binary: higherVersionBinaryUpdate, hotFetchGate });
  const checking = runtime.render().checkNow();
  await runtime.settle();
  let manager = runtime.render();
  assert.equal(manager.binaryUpdate, higherVersionBinaryUpdate);
  assert.equal(manager.isBinaryUpdateVisible, true);
  assert.equal(manager.hotUpdateReady, false, 'clear the existing OTA prompt as soon as the binary is known');
  assert.equal(runtime.calls.hotFetches, 2, 'the compatible OTA is still fetched');
  manager.dismissBinaryUpdate();
  await earlierOtaPrompt.reloadForHotUpdate();
  assert.equal(runtime.calls.reloads, 0, 'an old OTA button cannot restart after a newer binary was discovered');
  hotFetchGate.resolve();
  await checking;
  manager = runtime.render();
  assert.equal(manager.hotUpdateReady, false, 'the delayed fetch must not resurrect the old OTA prompt');
  assert.equal(manager.isBinaryUpdateVisible, false);
});

test('an OTA-only update retains its restart prompt and restarts only on the explicit action', async () => {
  const runtime = setup({ binary: null, hotAvailable: true });
  runtime.render();
  await runtime.startup();
  const manager = runtime.render();
  assert.equal(manager.binaryUpdate, null);
  assert.equal(manager.hotUpdateReady, true);
  assert.equal(runtime.calls.reloads, 0);
  await manager.reloadForHotUpdate();
  assert.equal(runtime.calls.reloads, 1);
  manager.dismissHotUpdate();
  assert.equal(runtime.render().hotUpdateReady, false);
});

test('an OTA fetch that is not new does not create a restart prompt', async () => {
  const runtime = setup({ binary: null, hotAvailable: true, hotIsNew: false });
  runtime.render();
  await runtime.startup();
  assert.equal(runtime.calls.hotFetches, 1);
  assert.equal(runtime.render().hotUpdateReady, false);
  assert.equal(runtime.calls.reloads, 0);
});

test('a failed binary check with no known newer binary still permits a successfully fetched OTA prompt', async () => {
  const fullReject = new Error('Binary manifest unavailable');
  const runtime = setup({ binary: null, hotAvailable: true, fullReject });
  const manager = runtime.render();
  await assert.rejects(manager.checkNow(), fullReject);
  const ready = runtime.render();
  assert.equal(runtime.calls.hotFetches, 1);
  assert.equal(ready.binaryUpdate, null);
  assert.equal(ready.hotUpdateReady, true);
  assert.equal(ready.isChecking, false);
});

test('a later failed binary check cannot expose an OTA when a newer binary is already known', async () => {
  const runtime = setup({ binary: higherVersionBinaryUpdate, hotAvailable: true });
  runtime.render();
  await runtime.startup();
  const manager = runtime.render();
  assert.equal(manager.hotUpdateReady, false);
  manager.dismissBinaryUpdate();
  const fullReject = new Error('Binary manifest unavailable');
  runtime.configure({ fullReject });
  await assert.rejects(manager.checkNow(), fullReject);
  const ready = runtime.render();
  assert.equal(runtime.calls.hotFetches, 2);
  assert.equal(ready.binaryUpdate, higherVersionBinaryUpdate);
  assert.equal(ready.isBinaryUpdateVisible, false);
  assert.equal(ready.hotUpdateReady, false);
  assert.equal(ready.isChecking, false);
});

test('a failed OTA fetch preserves the higher-version binary prompt and releases the check guard', async () => {
  const hotFetchReject = new Error('OTA fetch unavailable');
  const runtime = setup({ binary: higherVersionBinaryUpdate, hotAvailable: true, hotFetchReject });
  const manager = runtime.render();
  await assert.rejects(manager.checkNow(), hotFetchReject);
  const ready = runtime.render();
  assert.equal(ready.binaryUpdate, higherVersionBinaryUpdate);
  assert.equal(ready.isBinaryUpdateVisible, true);
  assert.equal(ready.hotUpdateReady, false);
  assert.equal(ready.isChecking, false);
  runtime.configure({ hotFetchReject: null });
  assert.equal(await ready.checkNow(), true, 'a later check still runs after the fetch error');
  assert.equal(runtime.calls.hotFetches, 2);
  assert.equal(runtime.render().hotUpdateReady, false);
});

test('asynchronous library discovery finishes before automatic reattachment and shares concurrent checks', async () => {
  const discoveryGate = deferred();
  const runtime = setup({ backgroundTask: true, hotAvailable: true, discoveryGate });
  const original = runtime.render();
  await runtime.startup();
  assert.equal(runtime.calls.binaryChecks, 1);
  assert.equal(runtime.calls.hotChecks, 1);
  assert.equal(runtime.calls.downloads, 0);
  assert.equal(runtime.render().isChecking, true);
  assert.equal(await original.checkNow(), false);
  assert.equal(runtime.calls.binaryChecks, 1, 'A concurrent manual check must not start another discovery');
  discoveryGate.resolve();
  await runtime.settle();
  const ready = runtime.render();
  assert.equal(runtime.calls.downloads, 1);
  assert.equal(runtime.calls.hotFetches, 1);
  assert.equal(ready.isChecking, false);
  assert.equal(ready.isDownloadingBinary, true);
  assert.equal(ready.hotUpdateReady, false, 'background APK recovery must retain the binary prompt priority');
  assert.equal(runtime.calls.downloadOptions[0]?.installWhenReady, false);
  runtime.finishDownload();
  await runtime.settle();
  assert.equal(runtime.render().isBinaryDownloaded, true);
});

test('discovering a completed cached library task asynchronously does not reopen its installer', async () => {
  const discoveryGate = deferred();
  const runtime = setup({ downloaded: true, backgroundTask: true, discoveryGate });
  runtime.render();
  await runtime.startup();
  discoveryGate.resolve();
  await runtime.settle();
  const manager = runtime.render();
  assert.equal(manager.isBinaryDownloaded, true);
  assert.equal(manager.isBinaryUpdateVisible, true);
  assert.equal(runtime.calls.downloads, 0);
  assert.equal(runtime.calls.installs, 0);
});

test('a fast binary result clears an earlier OTA prompt and reattaches its transfer while the OTA check is pending', async (context) => {
  const runtime = setup({ binary: null, hotAvailable: true });
  assert.equal(await runtime.render().checkNow(), true);
  assert.equal(runtime.render().hotUpdateReady, true);
  const hotCheckGate = deferred();
  releaseAfterTest(context, runtime, hotCheckGate);
  runtime.configure({ binary: higherVersionBinaryUpdate, backgroundTask: true, hotCheckGate });
  const checking = runtime.render().checkNow();
  await runtime.settle();
  const ready = runtime.render();
  assert.equal(runtime.calls.binaryReturns, 2);
  assert.equal(runtime.calls.hotCheckReturns, 1);
  assert.equal(ready.binaryUpdate, higherVersionBinaryUpdate);
  assert.equal(ready.isBinaryUpdateVisible, true);
  assert.equal(ready.hotUpdateReady, false);
  assert.equal(ready.isChecking, true);
  assert.equal(runtime.calls.downloads, 1, 'Background recovery must not wait for the independent OTA check');
  assert.equal(runtime.calls.downloadOptions[0]?.installWhenReady, false);
  runtime.finishDownload();
  hotCheckGate.resolve();
  assert.equal(await checking, true);
  assert.equal(runtime.render().hotUpdateReady, false);
});

for (const binary of [null, higherVersionBinaryUpdate]) {
  test(`an OTA payload downloads before a slow binary check but does not prompt early (${binary?.version ?? 'no binary'})`, async (context) => {
    const discoveryGate = deferred();
    const runtime = setup({ binary, hotAvailable: true, discoveryGate });
    releaseAfterTest(context, runtime, discoveryGate);
    const checking = runtime.render().checkNow();
    await runtime.settle();
    assert.equal(runtime.calls.binaryReturns, 0);
    assert.equal(runtime.calls.hotCheckReturns, 1);
    assert.equal(runtime.calls.hotFetches, 1);
    assert.equal(runtime.calls.hotFetchReturns, 1, 'OTA fetching can finish while binary availability remains unknown');
    assert.equal(runtime.render().hotUpdateReady, false);
    assert.equal(runtime.render().isChecking, true);
    discoveryGate.resolve();
    assert.equal(await checking, true);
    assert.equal(runtime.render().hotUpdateReady, binary === null);
    assert.equal(runtime.render().binaryUpdate, binary);
  });
}

for (const first of ['binary', 'OTA payload']) {
  test(`an OTA-only prompt waits for both results when the ${first} finishes first`, async (context) => {
    const discoveryGate = deferred();
    const hotFetchGate = deferred();
    const runtime = setup({ binary: null, hotAvailable: true, discoveryGate, hotFetchGate });
    releaseAfterTest(context, runtime, discoveryGate, hotFetchGate);
    const checking = runtime.render().checkNow();
    await runtime.settle();
    assert.equal(runtime.calls.hotFetches, 1);
    (first === 'binary' ? discoveryGate : hotFetchGate).resolve();
    await runtime.settle();
    assert.equal(runtime.calls.binaryReturns, first === 'binary' ? 1 : 0);
    assert.equal(runtime.calls.hotFetchReturns, first === 'OTA payload' ? 1 : 0);
    assert.equal(runtime.render().hotUpdateReady, false);
    assert.equal(runtime.render().isChecking, true);
    (first === 'binary' ? hotFetchGate : discoveryGate).resolve();
    assert.equal(await checking, true);
    assert.equal(runtime.render().hotUpdateReady, true);
    assert.equal(runtime.render().binaryUpdate, null);
    assert.equal(runtime.calls.reloads, 0);
  });
}

for (const pendingOta of ['check', 'fetch']) {
  for (const binary of [null, higherVersionBinaryUpdate]) {
    test(`an earlier explicit OTA restart waits for the binary result but not the pending OTA ${pendingOta} (${binary?.version ?? 'no binary'})`, async (context) => {
      const runtime = setup({ binary: null, hotAvailable: true });
      assert.equal(await runtime.render().checkNow(), true);
      const earlierReady = runtime.render();
      assert.equal(earlierReady.hotUpdateReady, true);
      const discoveryGate = deferred();
      const otaGate = deferred();
      releaseAfterTest(context, runtime, discoveryGate, otaGate);
      runtime.configure({ binary, discoveryGate, [pendingOta === 'check' ? 'hotCheckGate' : 'hotFetchGate']: otaGate });
      const checking = runtime.render().checkNow();
      let reloaded = false;
      const reload = earlierReady.reloadForHotUpdate().then(() => {
        reloaded = true;
      });
      await runtime.settle();
      assert.equal(runtime.calls.reloads, 0, 'Do not reload before the current binary check decides');
      assert.equal(reloaded, false);
      discoveryGate.resolve();
      await runtime.settle();
      assert.equal(runtime.calls.binaryReturns, 2);
      assert.equal(reloaded, true, 'The explicit restart decision must not wait for OTA checking or downloading');
      assert.equal(runtime.calls.reloads, binary ? 0 : 1);
      assert.equal(runtime.render().isChecking, true, 'The other check branch is still pending');
      otaGate.resolve();
      assert.equal(await checking, true);
      await reload;
      assert.equal(runtime.render().hotUpdateReady, binary === null);
    });
  }
}

test('a restart requested in the same turn as the first check waits before its lazy services begin checking', async (context) => {
  const discoveryGate = deferred();
  const runtime = setup({ binary: higherVersionBinaryUpdate, discoveryGate });
  releaseAfterTest(context, runtime, discoveryGate);
  const manager = runtime.render();
  const checking = manager.checkNow();
  let finished = false;
  const reload = manager.reloadForHotUpdate().then(() => {
    finished = true;
  });
  assert.equal(runtime.calls.binaryChecks, 0, 'The real hook has not passed its initial dynamic import yet');
  await runtime.settle();
  assert.equal(runtime.calls.binaryChecks, 1);
  assert.equal(runtime.calls.reloads, 0);
  assert.equal(finished, false);
  discoveryGate.resolve();
  assert.equal(await checking, true);
  await reload;
  assert.equal(finished, true);
  assert.equal(runtime.calls.reloads, 0);
  assert.equal(runtime.render().binaryUpdate, higherVersionBinaryUpdate);
});

for (const pending of ['binary', 'OTA check', 'OTA fetch']) {
  test(`duplicate checks remain guarded until the pending ${pending} settles`, async (context) => {
    const gate = deferred();
    const gateName = pending === 'binary' ? 'discoveryGate' : pending === 'OTA check' ? 'hotCheckGate' : 'hotFetchGate';
    const runtime = setup({ binary: null, hotAvailable: true, [gateName]: gate });
    releaseAfterTest(context, runtime, gate);
    const manager = runtime.render();
    const checking = manager.checkNow();
    await runtime.settle();
    assert.equal(runtime.render().isChecking, true);
    assert.equal(await manager.checkNow(), false);
    assert.equal(runtime.calls.binaryChecks, 1);
    assert.equal(runtime.calls.hotChecks, 1);
    gate.resolve();
    assert.equal(await checking, true);
    assert.equal(runtime.render().isChecking, false);
    assert.equal(await runtime.render().checkNow(), true);
    assert.equal(runtime.calls.binaryChecks, 2);
    assert.equal(runtime.calls.hotChecks, 2);
  });
}

test('an OTA availability check failure stays silent and releases the guard for a later retry', async () => {
  const runtime = setup({ binary: null, hotAvailable: true, hotCheckReject: new Error('OTA check unavailable') });
  assert.equal(await runtime.render().checkNow(), false);
  assert.equal(runtime.render().isChecking, false);
  assert.equal(runtime.render().hotUpdateReady, false);
  assert.equal(runtime.calls.hotFetches, 0);
  runtime.configure({ hotCheckReject: null });
  assert.equal(await runtime.render().checkNow(), true);
  assert.equal(runtime.calls.binaryChecks, 2);
  assert.equal(runtime.calls.hotChecks, 2);
  assert.equal(runtime.calls.hotFetches, 1);
  assert.equal(runtime.render().hotUpdateReady, true);
});

for (const failingOta of ['check', 'fetch']) {
  test(`simultaneous binary and OTA ${failingOta} failures preserve error priority without an unhandled rejection`, async (context) => {
    const discoveryGate = deferred();
    const otaGate = deferred();
    const fullError = new Error('Binary check failed');
    const otaError = new Error(`OTA ${failingOta} failed`);
    const runtime = setup({
      binary: null,
      hotAvailable: true,
      discoveryGate,
      [failingOta === 'check' ? 'hotCheckGate' : 'hotFetchGate']: otaGate,
    });
    releaseAfterTest(context, runtime, discoveryGate, otaGate);
    const unhandled = [];
    const capture = (error) => unhandled.push(error);
    process.on('unhandledRejection', capture);
    context.after(() => process.off('unhandledRejection', capture));
    const checking = runtime.render().checkNow();
    const rejected = assert.rejects(checking, failingOta === 'fetch' ? otaError : fullError);
    await runtime.settle();
    if (failingOta === 'check') {
      otaGate.reject(otaError);
      await runtime.settle();
      assert.equal(runtime.render().isChecking, true);
      discoveryGate.reject(fullError);
    } else {
      discoveryGate.reject(fullError);
      await runtime.settle();
      assert.equal(runtime.calls.hotFetches, 1, 'Reject an OTA fetch only after that request actually starts');
      assert.equal(runtime.render().isChecking, true);
      otaGate.reject(otaError);
    }
    await rejected;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(unhandled.length, 0);
    assert.equal(runtime.render().isChecking, false);
    assert.equal(runtime.render().hotUpdateReady, false);
    runtime.configure({ discoveryGate: null, hotCheckGate: null, hotFetchGate: null });
    assert.equal(await runtime.render().checkNow(), true);
    assert.equal(runtime.calls.binaryChecks, 2);
    assert.equal(runtime.calls.hotChecks, 2);
    assert.equal(runtime.render().hotUpdateReady, true);
  });
}

test('a failed slow binary check exposes the already downloaded OTA only after settling and permits a retry', async (context) => {
  const discoveryGate = deferred();
  const fullError = new Error('Delayed binary failure');
  const runtime = setup({ binary: null, hotAvailable: true, discoveryGate });
  releaseAfterTest(context, runtime, discoveryGate);
  const checking = runtime.render().checkNow();
  const outcome = checking.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await runtime.settle();
  assert.equal(runtime.calls.hotFetchReturns, 1);
  assert.equal(runtime.render().hotUpdateReady, false);
  discoveryGate.reject(fullError);
  assert.equal((await outcome).error, fullError);
  assert.equal(runtime.render().hotUpdateReady, true);
  assert.equal(runtime.render().isChecking, false);
  runtime.configure({ discoveryGate: null });
  assert.equal(await runtime.render().checkNow(), true);
  assert.equal(runtime.calls.binaryChecks, 2);
});
