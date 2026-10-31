import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const libraryName = '@kesha-antonov/react-native-background-downloader';
const update = {
  version: '0.8.0',
  buildNumber: 1027,
  title: 'v0.8.0',
  fileName: 'anitabi-app-v0.8.0-android.apk',
  apkUrl: 'https://example.test/anitabi-app-v0.8.0-android.apk',
};
const updateKey = `${update.version}:${update.buildNumber}:${update.apkUrl}`;
const readyUri = 'file:///cache/anitabi-app-v0.8.0-android-0.8.0-1027.ready.apk';
const partialUri = `file:///documents/${readyUri.split('/').at(-1)}.download`;
const fileUri = (value) => (value.startsWith('/') ? `file://${value}` : value);
const zipHeader = [0x50, 0x4b, 0x03, 0x04];
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

// Run the real services against the library's public task API. The double does
// not validate APKs or finalize them: the app must check disk size and ZIP bytes.
// Persistent records survive JS recreation; callbacks and wrapper objects do not.
function setup({
  libraryAvailable = false,
  platform = 'android',
  initialAppState = 'active',
  shared,
  contentUriGate,
  discoveryGate,
  moveGate,
  afterMove,
  keepCompletedTasks = false,
  omitRecoveredDestination = false,
  notificationsGranted = true,
  permissionFailure = false,
} = {}) {
  const state = shared ?? {
    files: new Map(),
    headers: new Map(),
    values: new Map(),
    records: new Map(),
    created: [],
    started: [],
    stopped: [],
    resumed: [],
    acknowledged: [],
    fileMoves: [],
    events: [],
  };
  const listeners = new Set();
  const timers = new Map();
  const bindings = new Map();
  const installs = [];
  const openedUrls = [];
  const legacyTasks = [];
  const contentUriRequests = [];
  const permissionCalls = { checks: 0, requests: 0 };
  let nextTimerId = 0;
  let manifest = update;
  let discoveryCalls = 0;
  let runtime;
  const appState = {
    currentState: initialAppState,
    addEventListener(event, listener) {
      assert.equal(event, 'change');
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  const joinUri = (parts) => fileUri(parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/'));
  class Directory {
    constructor(...parts) {
      this.uri = joinUri(parts);
    }
    list() {
      return [...state.files.keys()]
        .filter((uri) => uri.startsWith(`${this.uri}/`) && !uri.slice(this.uri.length + 1).includes('/'))
        .map((uri) => new File(uri));
    }
    create() {}
  }
  class File {
    constructor(...parts) {
      this.uri = joinUri(parts);
    }
    get name() {
      return this.uri.split('/').at(-1);
    }
    get exists() {
      return state.files.has(this.uri);
    }
    get size() {
      return state.files.get(this.uri) ?? 0;
    }
    delete() {
      state.files.delete(this.uri);
      state.headers.delete(this.uri);
    }
    open() {
      const bytes = Uint8Array.from(state.headers.get(this.uri) ?? zipHeader);
      return {
        readBytesSync: (length) => bytes.slice(0, length),
        readBytes: async (length) => bytes.slice(0, length),
        close() {},
      };
    }
    bytesSync() {
      return Uint8Array.from(state.headers.get(this.uri) ?? zipHeader);
    }
    async copy(destination) {
      assert.ok(this.exists, 'Source file must exist');
      const size = this.size;
      const header = state.headers.get(this.uri) ?? zipHeader;
      // An already-open native copy can finish after cancellation unlinks its
      // source, so the adapter must also remove a late destination file.
      if (moveGate) await moveGate.promise;
      state.files.set(destination.uri, size);
      state.headers.set(destination.uri, header);
      state.fileMoves.push({ source: this.uri, destination: destination.uri });
      afterMove?.(runtime);
    }
    async move(destination) {
      await this.copy(destination);
      state.files.delete(this.uri);
      state.headers.delete(this.uri);
    }
    static createDownloadTask(url, destination, options) {
      return new LegacyTask(url, destination, options);
    }
  }
  class LegacyTask {
    constructor(url, destination, options) {
      Object.assign(this, {
        url,
        destination,
        options,
        state: 'idle',
        completion: deferred(),
        releases: 0,
        resumeCalls: 0,
      });
      legacyTasks.push(this);
    }
    downloadAsync() {
      this.state = 'active';
      return this.completion.promise;
    }
    resumeAsync() {
      this.resumeCalls++;
      return this.downloadAsync();
    }
    emit(bytesWritten, totalBytes = 1000) {
      state.files.set(this.destination.uri, bytesWritten);
      this.options.onProgress?.({ bytesWritten, totalBytes });
    }
    complete(size = 1000) {
      this.emit(size, size);
      this.state = 'completed';
      this.completion.resolve(this.destination);
    }
    async pauseAsync() {
      this.state = 'paused';
      this.completion.resolve(null);
    }
    savable() {
      return {
        url: this.url,
        fileUri: this.destination.uri,
        isDirectory: false,
        resumeData: String(this.destination.size),
      };
    }
    cancel() {
      this.state = 'cancelled';
      this.completion.reject(new Error('download cancelled'));
    }
    release() {
      this.releases++;
    }
    static fromSavable(saved, options) {
      const task = new LegacyTask(saved.url, new File(saved.fileUri), options);
      task.state = 'paused';
      task.restored = saved;
      return task;
    }
  }
  class LibraryTask {
    constructor(record, previous) {
      Object.assign(this, record);
      this.handlers = previous ? { ...previous.handlers } : {};
      bindings.set(this.id, this);
    }
    begin(handler) {
      this.handlers.begin = handler;
      return this;
    }
    progress(handler) {
      this.handlers.progress = handler;
      return this;
    }
    done(handler) {
      this.handlers.done = handler;
      return this;
    }
    error(handler) {
      this.handlers.error = handler;
      return this;
    }
    start() {
      assert.equal(this.state, 'PENDING', 'Existing tasks must not be started again');
      state.started.push(this.id);
      this.state = 'DOWNLOADING';
      state.records.get(this.id).state = this.state;
      this.handlers.begin?.({ expectedBytes: this.bytesTotal, headers: {} });
    }
    async stop() {
      this.state = 'STOPPED';
      state.stopped.push(this.id);
      state.records.delete(this.id);
      bindings.delete(this.id);
      // Real stop() emits no done/error event. The app must settle its promise.
    }
    async pause() {
      this.state = 'PAUSED';
      state.records.get(this.id).state = this.state;
    }
    async resume() {
      state.resumed.push(this.id);
      this.state = 'DOWNLOADING';
      state.records.get(this.id).state = this.state;
    }
  }
  const library = {
    createDownloadTask(options) {
      state.created.push({ ...options });
      const record = { ...options, state: 'PENDING', bytesDownloaded: 0, bytesTotal: 1000, errorCode: 0 };
      state.records.set(record.id, record);
      return new LibraryTask(record);
    },
    async getExistingDownloadTasks() {
      discoveryCalls++;
      if (discoveryGate) await discoveryGate.promise;
      return [...state.records.values()].map(
        (record) =>
          new LibraryTask(
            omitRecoveredDestination ? { ...record, destination: undefined } : record,
            bindings.get(record.id),
          ),
      );
    },
    completeHandler(id) {
      state.acknowledged.push(id);
      state.events.push({ type: 'acknowledge', id, readyExists: state.files.has(readyUri) });
      // completeHandler is a native no-op on Android, including 4.6.4.
    },
    setConfig() {},
    directories: { documents: '/documents' },
  };
  const modules = {
    [libraryName]: library,
    'expo-application': { nativeApplicationVersion: '0.8.0', nativeBuildVersion: '1026' },
    '@/i18n': { default: { t: (_key, options) => options?.defaultValue ?? _key }, __esModule: true },
    'expo-constants': {
      default: { expoConfig: { version: '0.8.0', extra: { appUpdatesEnabled: true } } },
      __esModule: true,
    },
    'expo-file-system': {
      Directory,
      File,
      DownloadTask: LegacyTask,
      Paths: { cache: new Directory('file:///cache'), document: new Directory('file:///documents') },
    },
    'expo-file-system/legacy': {
      getContentUriAsync: async (uri) => {
        contentUriRequests.push(uri);
        if (contentUriGate) await contentUriGate.promise;
        return `content://test/${uri}`;
      },
    },
    'expo-intent-launcher': {
      async startActivityAsync(action, options) {
        assert.equal(appState.currentState, 'active', 'Installer must never open over another app or lock screen');
        installs.push({ action, options });
      },
    },
    'expo-linking': { openURL: async (url) => openedUrls.push(url) },
    'expo-updates': { isEnabled: true, isEmbeddedLaunch: true, isEmergencyLaunch: false },
    'react-native': {
      AppState: appState,
      Platform: { OS: platform, Version: 36, select: (options) => options[platform] ?? options.default },
      TurboModuleRegistry: { get: (name) => (name === 'RNBackgroundDownloader' && libraryAvailable ? {} : null) },
      NativeModules: libraryAvailable ? { RNBackgroundDownloader: {} } : {},
      PermissionsAndroid: {
        PERMISSIONS: { POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS' },
        RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
        check: async () => {
          permissionCalls.checks++;
          return notificationsGranted;
        },
        request: async () => {
          permissionCalls.requests++;
          if (permissionFailure) throw new Error('Notification permission service unavailable');
          return notificationsGranted ? 'granted' : 'denied';
        },
      },
    },
    'react-native-mmkv': {
      createMMKV: () => ({
        getString: (key) => state.values.get(key),
        getAllKeys: () => [...state.values.keys()],
        set: (key, value) => state.values.set(key, value),
        remove: (key) => state.values.delete(key),
      }),
    },
  };
  const cache = new Map();
  function loadModule(name, importingModule) {
    if (name.startsWith('.')) name = path.posix.normalize(`${path.posix.dirname(importingModule)}/${name}`);
    if (name in modules) return modules[name];
    if (cache.has(name)) return cache.get(name);
    assert.ok(name.startsWith('@/'), `Unexpected dependency: ${name}`);
    const source = readFileSync(new URL(`../../src/${name.slice(2)}.ts`, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    cache.set(name, exports);
    vm.runInNewContext(compiled, {
      exports,
      require: (dependency) => loadModule(dependency, name),
      __DEV__: false,
      console,
      setTimeout(callback) {
        const id = ++nextTimerId;
        timers.set(id, callback);
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
      AbortController,
      Uint8Array,
      fetch: async () => ({ ok: true, json: async () => manifest }),
    });
    return exports;
  }
  const service = loadModule('@/services/app-update');
  const settle = async () => {
    for (let index = 0; index < 48; index++) await Promise.resolve();
  };
  runtime = {
    service,
    state,
    library,
    legacyTasks,
    installs,
    openedUrls,
    contentUriRequests,
    permissionCalls,
    appState,
    discoveryCalls: () => discoveryCalls,
    setManifest(value) {
      manifest = value;
    },
    changeAppState(value) {
      appState.currentState = value;
      for (const listener of [...listeners]) listener(value);
    },
    latestRecord() {
      return [...state.records.values()].at(-1);
    },
    advanceLibrary(
      bytesDownloaded,
      status = 'DOWNLOADING',
      {
        deliver = true,
        fileSize = bytesDownloaded,
        totalBytes = 1000,
        header = zipHeader,
        errorCode = 1002,
        error = 'network failed',
      } = {},
    ) {
      const record = runtime.latestRecord();
      assert.ok(record, 'A library task must have been created');
      Object.assign(record, { state: status, bytesDownloaded, bytesTotal: totalBytes });
      const uri = fileUri(record.destination);
      state.files.set(uri, fileSize);
      state.headers.set(uri, header);
      const task = bindings.get(record.id);
      if ((status === 'DONE' && !keepCompletedTasks) || status === 'FAILED') state.records.delete(record.id);
      if (deliver && task) {
        Object.assign(task, record);
        if (status === 'DONE')
          task.handlers.done?.({ location: record.destination, bytesDownloaded, bytesTotal: totalBytes });
        else if (status === 'FAILED') task.handlers.error?.({ error, errorCode });
        else task.handlers.progress?.({ bytesDownloaded, bytesTotal: totalBytes });
      }
    },
    settle,
    async tick() {
      for (const [id, callback] of [...timers]) {
        timers.delete(id);
        callback();
      }
      await settle();
    },
  };
  return runtime;
}

test('binary detection preserves the native baseline when a download-only snapshot exists', async () => {
  const runtime = setup();
  const baseline = { ...update, buildNumber: 1026 };
  runtime.setManifest(baseline);
  assert.equal(await runtime.service.checkBinaryUpdate(), null);
  assert.equal(runtime.service.isNewerBinaryUpdate(baseline, '0.8.0', 1027), false);
  assert.equal(runtime.service.isNewerBinaryUpdate(update, '0.8.0', 1026), true);
  assert.equal(runtime.service.isNewerBinaryUpdate({ ...update, version: '0.7.0', buildNumber: 9999 }), false);
  assert.equal(runtime.service.isNewerBinaryUpdate({ ...update, version: '0.9.0', buildNumber: 1 }), true);
});
test('old native packages keep resumable Expo downloads and install the complete file', async () => {
  const runtime = setup();
  runtime.state.files.set(partialUri, 400);
  runtime.state.values.set(
    'binary-download-v1',
    JSON.stringify({
      schemaVersion: 1,
      updateKey,
      pauseState: { url: update.apkUrl, fileUri: partialUri, isDirectory: false, resumeData: '400' },
      progress: { bytesWritten: 400, totalBytes: 1000, percent: 40 },
    }),
  );
  assert.equal(runtime.service.getResumableBinaryDownloadProgress(update)?.bytesWritten, 400);
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  const task = runtime.legacyTasks[0];
  assert.equal(task.resumeCalls, 1);
  assert.equal(task.restored.resumeData, '400');
  task.complete();
  assert.equal(await download, 'completed');
  assert.equal(runtime.state.files.get(readyUri), 1000);
  assert.equal(runtime.state.files.has(partialUri), false);
  assert.equal(runtime.state.values.has('binary-download-v1'), false);
  assert.equal(runtime.installs.length, 1);
  assert.equal(task.releases, 1);
});
test('an existing complete APK is reused without restarting its download', async () => {
  const runtime = setup();
  runtime.state.files.set(readyUri, 1000);
  assert.equal(runtime.service.isBinaryUpdateDownloaded(update), true);
  assert.equal(await runtime.service.downloadAndInstallBinaryUpdate(update), 'completed');
  assert.equal(runtime.legacyTasks.length, 0);
  assert.equal(runtime.state.created.length, 0);
  assert.equal(runtime.installs.length, 1);
});
test('a legacy download completed while backgrounded only opens the installer after foregrounding', async () => {
  const runtime = setup();
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  runtime.changeAppState('background');
  runtime.legacyTasks[0].complete();
  await runtime.settle();
  assert.equal(runtime.state.files.get(readyUri), 1000);
  assert.equal(runtime.installs.length, 0);
  runtime.changeAppState('active');
  assert.equal(await download, 'completed');
});
test('cancelled legacy download never leaves a partial APK or opens the installer', async () => {
  const runtime = setup();
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  runtime.legacyTasks[0].emit(400);
  assert.equal(runtime.service.cancelBinaryUpdateDownload(), true);
  assert.equal(await download, 'cancelled');
  assert.equal(runtime.installs.length, 0);
  assert.equal(runtime.state.files.has(partialUri), false);
  assert.equal(runtime.state.files.has(readyUri), false);
});
test('legacy connection failure persists only the flushed partial file for retry', async () => {
  const runtime = setup();
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  runtime.legacyTasks[0].emit(400);
  runtime.state.files.set(partialUri, 384);
  runtime.legacyTasks[0].completion.reject(new Error('connection lost'));
  await assert.rejects(download, /connection lost/);
  assert.equal(runtime.service.getResumableBinaryDownloadProgress(update)?.bytesWritten, 384);
  assert.equal(runtime.installs.length, 0);
});
test('library transfer continues in background and returning to the app does not open the installer', async () => {
  const runtime = setup({ libraryAvailable: true });
  const progress = [];
  const download = runtime.service.downloadAndInstallBinaryUpdate(update, (value) => progress.push(value));
  await runtime.settle();
  assert.equal(runtime.legacyTasks.length, 0);
  assert.equal(runtime.state.created.length, 1);
  runtime.changeAppState('background');
  runtime.advanceLibrary(450);
  await runtime.settle();
  assert.equal(runtime.service.getResumableBinaryDownloadProgress(update)?.bytesWritten, 450);
  assert.equal(runtime.state.stopped.length, 0);
  runtime.advanceLibrary(1000, 'DONE');
  assert.equal(await download, 'completed');
  assert.equal(runtime.installs.length, 0);
  runtime.changeAppState('active');
  await runtime.settle();
  assert.equal(runtime.state.files.get(readyUri), 1000);
  assert.equal(runtime.installs.length, 0);
  assert.equal(progress.at(-1).percent, 100);
  assert.ok(
    runtime.state.events.filter((event) => event.type === 'acknowledge').every((event) => event.readyExists),
    'Acknowledge success only after saving a ready APK',
  );
});
test('automatic reattachment finishes the existing library transfer without opening an installer', async () => {
  const first = setup({ libraryAvailable: true });
  void first.service.downloadAndInstallBinaryUpdate(update);
  await first.settle();
  first.advanceLibrary(640, 'DOWNLOADING', { deliver: false });
  const recreated = setup({ libraryAvailable: true, shared: first.state });
  await recreated.service.checkBinaryUpdate();
  const download = recreated.service.downloadAndInstallBinaryUpdate(update, undefined, { installWhenReady: false });
  await recreated.settle();
  assert.equal(recreated.state.created.length, 1);
  assert.equal(recreated.service.getResumableBinaryDownloadProgress(update)?.bytesWritten, 640);
  recreated.advanceLibrary(1000, 'DONE');
  assert.equal(await download, 'completed');
  assert.equal(recreated.installs.length, 0);
  assert.equal(recreated.service.isBinaryUpdateDownloaded(update), true);
  assert.equal(await recreated.service.downloadAndInstallBinaryUpdate(update), 'completed');
  assert.equal(recreated.installs.length, 1, 'An explicit cached install remains available after automatic recovery');
  assert.equal(recreated.state.created.length, 1);
});

test('a request started in the background only prepares its APK even if the app returns before completion', async () => {
  const runtime = setup({ libraryAvailable: true, initialAppState: 'background' });
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  runtime.changeAppState('active');
  runtime.advanceLibrary(1000, 'DONE');
  assert.equal(await download, 'completed');
  assert.equal(runtime.installs.length, 0);
  assert.equal(runtime.state.files.get(readyUri), 1000);
});

test('a transient inactive state permanently revokes automatic installation for that download', async () => {
  const runtime = setup({ libraryAvailable: true });
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  runtime.changeAppState('inactive');
  runtime.changeAppState('active');
  runtime.advanceLibrary(1000, 'DONE');
  assert.equal(await download, 'completed');
  assert.equal(runtime.installs.length, 0);
});

test('returning from an external completion-notification installer does not trigger a service installation', async () => {
  const runtime = setup({ libraryAvailable: true });
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  runtime.changeAppState('background');
  runtime.advanceLibrary(1000, 'DONE');
  assert.equal(await download, 'completed');
  // The library notification opens the source APK outside this service. These
  // lifecycle transitions model cancelling that installer and returning to App.
  runtime.changeAppState('inactive');
  runtime.changeAppState('background');
  runtime.changeAppState('active');
  await runtime.settle();
  assert.equal(runtime.installs.length, 0);
  assert.equal(runtime.contentUriRequests.length, 0);
  assert.equal(runtime.service.isBinaryUpdateDownloaded(update), true);
});

test('a download-only request reuses an already cached APK without opening its installer', async () => {
  const runtime = setup({ libraryAvailable: true });
  runtime.state.files.set(readyUri, 1000);
  assert.equal(
    await runtime.service.downloadAndInstallBinaryUpdate(update, undefined, { installWhenReady: false }),
    'completed',
  );
  assert.equal(runtime.installs.length, 0);
  assert.equal(runtime.contentUriRequests.length, 0);
  assert.equal(await runtime.service.downloadAndInstallBinaryUpdate(update), 'completed');
  assert.equal(runtime.installs.length, 1);
  assert.equal(runtime.state.created.length, 0);
});

for (const phase of ['discovery', 'copy']) {
  test(`leaving and returning during ${phase} prevents a late automatic installation`, async () => {
    const gate = deferred();
    const runtime = setup({ libraryAvailable: true, [phase === 'discovery' ? 'discoveryGate' : 'moveGate']: gate });
    const download = runtime.service.downloadAndInstallBinaryUpdate(update);
    await runtime.settle();
    if (phase === 'copy') {
      runtime.advanceLibrary(1000, 'DONE');
      await runtime.settle();
    }
    runtime.changeAppState('background');
    runtime.changeAppState('active');
    gate.resolve();
    await runtime.settle();
    if (phase === 'discovery') runtime.advanceLibrary(1000, 'DONE');
    assert.equal(await download, 'completed');
    assert.equal(runtime.installs.length, 0);
    assert.equal(runtime.state.files.get(readyUri), 1000);
  });
}
test('library stop without done/error events settles cancellation and removes the partial APK', async () => {
  const runtime = setup({ libraryAvailable: true });
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  runtime.advanceLibrary(350);
  assert.equal(runtime.service.cancelBinaryUpdateDownload(), true);
  assert.equal(await download, 'cancelled');
  assert.equal(runtime.state.stopped.length, 1);
  assert.equal(runtime.state.records.size, 0);
  assert.equal(runtime.state.files.has(partialUri), false);
  assert.equal(runtime.state.files.has(readyUri), false);
  assert.equal(runtime.state.files.size, 0, 'Cancellation must remove the actual library destination too');
  assert.equal(runtime.installs.length, 0);
});
test('a paused library task preserves progress and finishes the same transfer', async () => {
  const runtime = setup({ libraryAvailable: true });
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  runtime.advanceLibrary(350, 'PAUSED');
  await runtime.settle();
  assert.equal(runtime.service.getResumableBinaryDownloadProgress(update)?.bytesWritten, 350);
  assert.equal(runtime.state.stopped.length, 0);
  runtime.advanceLibrary(1000, 'DONE');
  assert.equal(await download, 'completed');
  assert.equal(runtime.state.created.length, 1);
});
test('a failed library transfer reports failure and a later retry creates a fresh task', async () => {
  const runtime = setup({ libraryAvailable: true });
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  const rejected = assert.rejects(download);
  await runtime.settle();
  runtime.advanceLibrary(350, 'FAILED');
  await rejected;
  assert.equal(runtime.installs.length, 0);
  const retry = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  assert.equal(runtime.state.created.length, 2);
  runtime.advanceLibrary(1000, 'DONE');
  assert.equal(await retry, 'completed');
});
test('browser handoff pauses the library task and reattachment resumes without a second transfer', async () => {
  const runtime = setup({ libraryAvailable: true });
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  runtime.advanceLibrary(350);
  assert.equal(await runtime.service.pauseBinaryUpdateDownload(), true);
  assert.equal(await download, 'paused');
  assert.equal(runtime.state.stopped.length, 0);
  assert.equal(runtime.latestRecord().state, 'PAUSED');
  const retry = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  assert.equal(runtime.state.resumed.length, 1);
  runtime.advanceLibrary(1000, 'DONE');
  assert.equal(await retry, 'completed');
  assert.equal(runtime.state.created.length, 1);
});
for (const [name, options] of [
  ['truncated', { fileSize: 400 }],
  ['non-ZIP', { header: [0x3c, 0x68, 0x74, 0x6d] }],
]) {
  test(`the real adapter rejects a ${name} APK even when the library emits done`, async () => {
    const runtime = setup({ libraryAvailable: true });
    const download = runtime.service.downloadAndInstallBinaryUpdate(update);
    const rejected = assert.rejects(download);
    await runtime.settle();
    runtime.advanceLibrary(1000, 'DONE', options);
    await rejected;
    assert.equal(runtime.installs.length, 0);
    assert.equal(runtime.state.files.has(readyUri), false);
  });
}
test('cancelling during asynchronous library discovery leaves no orphaned task', async () => {
  const discoveryGate = deferred();
  const runtime = setup({ libraryAvailable: true, discoveryGate });
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  assert.equal(runtime.state.created.length, 0);
  assert.equal(runtime.service.cancelBinaryUpdateDownload(), true);
  discoveryGate.resolve();
  assert.equal(await download, 'cancelled');
  assert.equal(runtime.state.records.size, 0);
  assert.equal(runtime.installs.length, 0);
});

test('browser handoff during asynchronous library discovery does not start an orphaned transfer', async () => {
  const discoveryGate = deferred();
  const runtime = setup({ libraryAvailable: true, discoveryGate });
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  assert.equal(runtime.state.created.length, 0);
  assert.equal(await runtime.service.pauseBinaryUpdateDownload(), true);
  discoveryGate.resolve();
  assert.equal(await download, 'paused');
  assert.equal(runtime.state.records.size, 0);
  assert.equal(runtime.installs.length, 0);
});

test('cancelling a restored transfer while discovery is pending stops the pre-existing native task', async () => {
  const first = setup({ libraryAvailable: true });
  void first.service.downloadAndInstallBinaryUpdate(update);
  await first.settle();
  first.advanceLibrary(350);
  const discoveryGate = deferred();
  const recreated = setup({ libraryAvailable: true, shared: first.state, discoveryGate });
  const download = recreated.service.downloadAndInstallBinaryUpdate(update);
  await recreated.settle();
  assert.equal(recreated.service.cancelBinaryUpdateDownload(), true);
  discoveryGate.resolve();
  assert.equal(await download, 'cancelled');
  assert.equal(recreated.state.records.size, 0);
  assert.equal(recreated.state.files.size, 0);
  assert.equal(recreated.installs.length, 0);
});

test('browser handoff while restored discovery is pending pauses the pre-existing native task', async () => {
  const first = setup({ libraryAvailable: true });
  void first.service.downloadAndInstallBinaryUpdate(update);
  await first.settle();
  first.advanceLibrary(350);
  const discoveryGate = deferred();
  const recreated = setup({ libraryAvailable: true, shared: first.state, discoveryGate });
  const download = recreated.service.downloadAndInstallBinaryUpdate(update);
  await recreated.settle();
  assert.equal(await recreated.service.pauseBinaryUpdateDownload(), true);
  discoveryGate.resolve();
  assert.equal(await download, 'paused');
  assert.equal(recreated.state.created.length, 1);
  assert.equal(recreated.latestRecord().state, 'PAUSED');
  assert.equal(recreated.installs.length, 0);
});
test('cancelling while the APK move is pending prevents installation and removes its result', async () => {
  const moveGate = deferred();
  const runtime = setup({ libraryAvailable: true, moveGate });
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  runtime.advanceLibrary(1000, 'DONE');
  await runtime.settle();
  assert.equal(runtime.service.cancelBinaryUpdateDownload(), true);
  moveGate.resolve();
  assert.equal(await download, 'cancelled');
  assert.equal(runtime.state.files.has(readyUri), false);
  assert.equal(runtime.state.files.size, 0, 'A late native move must not leave an APK behind');
  assert.equal(runtime.installs.length, 0);
});
test('iOS preserves external release downloads without starting an Android task', async () => {
  const runtime = setup({ platform: 'ios', libraryAvailable: true });
  const iosUpdate = { ...update, releaseUrl: 'https://example.test/releases/v0.8.0' };
  assert.equal(await runtime.service.downloadAndInstallBinaryUpdate(iosUpdate), 'completed');
  assert.deepEqual(runtime.openedUrls, [iosUpdate.releaseUrl]);
  assert.equal(runtime.state.created.length, 0);
});
for (const action of ['cancel', 'browser handoff']) {
  test(`${action} after APK finalization stops a pending foreground-only installation`, async () => {
    let actionResult;
    const runtime = setup({
      libraryAvailable: true,
      afterMove: (current) => {
        actionResult =
          action === 'cancel'
            ? current.service.cancelBinaryUpdateDownload()
            : current.service.pauseBinaryUpdateDownload();
      },
    });
    const download = runtime.service.downloadAndInstallBinaryUpdate(update);
    await runtime.settle();
    runtime.advanceLibrary(1000, 'DONE');
    await runtime.settle();
    assert.equal(runtime.contentUriRequests.length, 0);
    assert.equal(await actionResult, true);
    assert.equal(await download, action === 'cancel' ? 'cancelled' : 'paused');
    runtime.changeAppState('active');
    await runtime.settle();
    assert.equal(runtime.installs.length, 0);
    assert.equal(runtime.state.files.has(readyUri), action !== 'cancel');
  });
  for (const uriFails of [false, true]) {
    test(`${action} while the APK content URI ${uriFails ? 'fails' : 'is pending'} preserves the chosen result`, async () => {
      const contentUriGate = deferred();
      const runtime = setup({ libraryAvailable: true, contentUriGate });
      const download = runtime.service.downloadAndInstallBinaryUpdate(update);
      await runtime.settle();
      runtime.advanceLibrary(1000, 'DONE');
      await runtime.settle();
      assert.equal(runtime.contentUriRequests.length, 1);
      if (action === 'cancel') assert.equal(runtime.service.cancelBinaryUpdateDownload(), true);
      else assert.equal(await runtime.service.pauseBinaryUpdateDownload(), true);
      if (uriFails) contentUriGate.reject(new Error('Content URI provider failed'));
      else contentUriGate.resolve();
      assert.equal(await download, action === 'cancel' ? 'cancelled' : 'paused');
      assert.equal(runtime.installs.length, 0);
      assert.equal(runtime.state.files.has(readyUri), action !== 'cancel');
    });
  }
}
for (const libraryAvailable of [true, false]) {
  test(`${libraryAvailable ? 'library installation is revoked' : 'legacy installation waits'} if Home is pressed during content URI creation`, async () => {
    const contentUriGate = deferred();
    const runtime = setup({ libraryAvailable, contentUriGate });
    const download = runtime.service.downloadAndInstallBinaryUpdate(update);
    await runtime.settle();
    if (libraryAvailable) runtime.advanceLibrary(1000, 'DONE');
    else runtime.legacyTasks[0].complete();
    await runtime.settle();
    assert.equal(runtime.contentUriRequests.length, 1);
    runtime.changeAppState('background');
    if (libraryAvailable) runtime.changeAppState('active');
    contentUriGate.resolve();
    await runtime.settle();
    assert.equal(runtime.installs.length, 0);
    runtime.changeAppState('active');
    assert.equal(await download, 'completed');
    assert.equal(runtime.installs.length, libraryAvailable ? 0 : 1);
  });
}
test('a recovered DONE task finalizes without waiting for a done event that never replays', async () => {
  const first = setup({ libraryAvailable: true, keepCompletedTasks: true });
  void first.service.downloadAndInstallBinaryUpdate(update);
  await first.settle();
  first.advanceLibrary(1000, 'DONE', { deliver: false });
  const recreated = setup({ libraryAvailable: true, shared: first.state });
  await recreated.service.checkBinaryUpdate();
  assert.equal(await recreated.service.downloadAndInstallBinaryUpdate(update), 'completed');
  assert.equal(recreated.state.created.length, 1);
  assert.equal(recreated.state.files.get(readyUri), 1000);
  assert.equal(recreated.installs.length, 1);
});
test('a recovered PENDING task is reused rather than creating another transfer', async () => {
  const first = setup({ libraryAvailable: true });
  void first.service.downloadAndInstallBinaryUpdate(update);
  await first.settle();
  first.latestRecord().state = 'PENDING';
  const recreated = setup({ libraryAvailable: true, shared: first.state });
  await recreated.service.checkBinaryUpdate();
  const download = recreated.service.downloadAndInstallBinaryUpdate(update);
  await recreated.settle();
  assert.equal(recreated.state.created.length, 1);
  assert.equal(recreated.state.started.length, 1, 'A system-queued task must not start its network transfer again');
  recreated.advanceLibrary(1000, 'DONE');
  assert.equal(await download, 'completed');
});
test('unknown total size does not cause NaN progress and a valid completed APK can install', async () => {
  const runtime = setup({ libraryAvailable: true });
  const progress = [];
  const download = runtime.service.downloadAndInstallBinaryUpdate(update, (value) => progress.push(value));
  await runtime.settle();
  runtime.advanceLibrary(400, 'DOWNLOADING', { totalBytes: -1 });
  await runtime.settle();
  assert.ok(Number.isFinite(progress.at(-1).percent));
  assert.equal(progress.at(-1).bytesWritten, 400);
  runtime.advanceLibrary(1000, 'DONE', { totalBytes: -1 });
  assert.equal(await download, 'completed');
  assert.equal(runtime.installs.length, 1);
  assert.equal(progress.at(-1).percent, 100);
});

test('UIDT completion removed from getExisting tasks is recovered from the journal and complete file', async () => {
  const first = setup({ libraryAvailable: true });
  void first.service.downloadAndInstallBinaryUpdate(update);
  await first.settle();
  first.advanceLibrary(1000, 'DONE', { deliver: false });
  assert.equal(first.state.records.size, 0, 'Android UIDT clears its native record on completion');
  const recreated = setup({ libraryAvailable: true, shared: first.state });
  await recreated.service.checkBinaryUpdate();
  assert.equal(await recreated.service.downloadAndInstallBinaryUpdate(update), 'completed');
  assert.equal(recreated.state.created.length, 1);
  assert.equal(recreated.state.files.get(readyUri), 1000);
});

test('a recovered DONE task without destination uses its stored APK path and verifies the actual file', async () => {
  const first = setup({ libraryAvailable: true, keepCompletedTasks: true });
  void first.service.downloadAndInstallBinaryUpdate(update);
  await first.settle();
  first.advanceLibrary(1000, 'DONE', { deliver: false });
  const recreated = setup({ libraryAvailable: true, shared: first.state, omitRecoveredDestination: true });
  await recreated.service.checkBinaryUpdate();
  assert.equal(await recreated.service.downloadAndInstallBinaryUpdate(update), 'completed');
  assert.equal(recreated.state.created.length, 1);
  assert.equal(recreated.installs.length, 1);
});

test('a notification cancellation wakes the monitor without leaving an APK or reporting a download error', async () => {
  const runtime = setup({ libraryAvailable: true });
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  runtime.advanceLibrary(350, 'FAILED', { errorCode: -1, error: 'Download cancelled by user' });
  assert.equal(await download, 'cancelled');
  assert.equal(runtime.installs.length, 0);
  assert.equal(runtime.state.files.size, 0);
});

for (const permissionFailure of [false, true]) {
  test(`notification permission ${permissionFailure ? 'service failure' : 'denial'} does not block downloading`, async () => {
    const runtime = setup({ libraryAvailable: true, notificationsGranted: false, permissionFailure });
    const download = runtime.service.downloadAndInstallBinaryUpdate(update);
    await runtime.settle();
    assert.equal(runtime.state.created.length, 1);
    runtime.advanceLibrary(1000, 'DONE');
    assert.equal(await download, 'completed');
    assert.equal(runtime.installs.length, 1);
  });
}

test('an unknown error with code -1 remains a retryable failure rather than a user cancellation', async () => {
  const runtime = setup({ libraryAvailable: true });
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  const rejected = assert.rejects(download, /unknown/i);
  await runtime.settle();
  runtime.advanceLibrary(300, 'FAILED', { errorCode: -1, error: 'Unknown native failure' });
  await rejected;
  assert.equal(runtime.installs.length, 0);
});

test('foreground restoration wakes an active monitor when UIDT completed without a delivered done event', async () => {
  const runtime = setup({ libraryAvailable: true });
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  runtime.changeAppState('background');
  runtime.advanceLibrary(1000, 'DONE', { deliver: false });
  assert.equal(runtime.state.records.size, 0);
  runtime.changeAppState('active');
  await runtime.settle();
  assert.equal(await download, 'completed');
  assert.equal(runtime.installs.length, 0);
  assert.equal(runtime.state.created.length, 1);
});

test('a missing UIDT record with only a partial source is not mistaken for a complete APK', async () => {
  const first = setup({ libraryAvailable: true });
  void first.service.downloadAndInstallBinaryUpdate(update);
  await first.settle();
  first.advanceLibrary(400, 'DONE', { deliver: false });
  const recreated = setup({ libraryAvailable: true, shared: first.state });
  await recreated.service.checkBinaryUpdate();
  assert.equal(recreated.service.isBinaryUpdateDownloaded(update), false);
  assert.notEqual(recreated.service.getResumableBinaryDownloadProgress(update)?.percent, 100);
  assert.equal(recreated.installs.length, 0);
});

test('cancellation cleans files and task state even when its persisted journal is malformed', async () => {
  const runtime = setup({ libraryAvailable: true });
  const download = runtime.service.downloadAndInstallBinaryUpdate(update);
  await runtime.settle();
  runtime.advanceLibrary(350);
  runtime.state.values.set('current-download-v1', '{malformed');
  assert.equal(runtime.service.cancelBinaryUpdateDownload(), true);
  assert.equal(await download, 'cancelled');
  assert.equal(runtime.state.files.size, 0);
  assert.equal(runtime.state.values.has('current-download-v1'), false);
});

for (const action of ['cancel', 'browser handoff']) {
  test(`${action} protects the installer URI window when an APK was already cached before this session`, async () => {
    const contentUriGate = deferred();
    const runtime = setup({ libraryAvailable: true, contentUriGate });
    runtime.state.files.set(readyUri, 1000);
    const download = runtime.service.downloadAndInstallBinaryUpdate(update);
    await runtime.settle();
    assert.equal(runtime.contentUriRequests.length, 1);
    if (action === 'cancel') assert.equal(runtime.service.cancelBinaryUpdateDownload(), true);
    else assert.equal(await runtime.service.pauseBinaryUpdateDownload(), true);
    contentUriGate.resolve();
    assert.equal(await download, action === 'cancel' ? 'cancelled' : 'paused');
    assert.equal(runtime.installs.length, 0);
    assert.equal(runtime.state.created.length, 0);
  });
}
