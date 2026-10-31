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

function deferred() {
  let resolve;
  const promise = new Promise((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
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
} = {}) {
  const calls = { binaryChecks: 0, hotChecks: 0, hotFetches: 0, downloads: 0, installs: 0, downloadOptions: [] };
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
      if (discoveryGate) await discoveryGate.promise;
      return binary;
    },
    isBinaryUpdateDownloaded: () => isDownloaded,
    hasBackgroundBinaryUpdateDownload: () => backgroundTask,
    getResumableBinaryDownloadProgress: () =>
      backgroundTask ? { bytesWritten: 400, totalBytes: 1000, percent: 40 } : null,
    async downloadAndInstallBinaryUpdate(update, _onProgress, options) {
      assert.equal(update, binary);
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
      return { isAvailable: hotAvailable };
    },
    async fetchUpdateAsync() {
      calls.hotFetches++;
      return { isNew: true };
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
  };
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

for (const binary of [null, binaryUpdate]) {
  test(`an available OTA still checks and downloads without a native task (${binary ? 'binary available' : 'no binary'})`, async () => {
    const runtime = setup({ binary, hotAvailable: true });
    runtime.render();
    await runtime.startup();
    const manager = runtime.render();
    assert.equal(runtime.calls.binaryChecks, 1);
    assert.equal(runtime.calls.hotChecks, 1);
    assert.equal(runtime.calls.hotFetches, 1);
    assert.equal(runtime.calls.downloads, 0);
    assert.equal(manager.hotUpdateReady, true);
    assert.equal(manager.binaryUpdate, binary);
    assert.equal(manager.isDownloadingBinary, false);
  });
}

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
