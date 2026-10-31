import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import WebSocket from 'ws';

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const packageName = 'bbf.anitabiapp.dev';
const implementation = '@kesha-antonov/react-native-background-downloader@4.6.4';
const cases = [
  ['foreground', '前台下载完整 APK 并打开安装界面'],
  ['background', '按 Home 后系统下载字节继续增长'],
  ['locked', '锁屏后系统下载字节继续增长'],
  ['background-completion', '后台下载完成时不打开安装界面'],
  ['foreground-install', '回到 App 不自动安装，点击立即安装后打开安装界面'],
  ['reload-reconnect', 'JS reload 重连相同下载，完成不自动安装'],
  ['cancel', '取消下载删除系统任务且不打开安装界面'],
  ['http-error', 'HTTP 404 下载失败且不打开安装界面'],
  ['invalid-apk', '无效 APK 拒绝安装'],
  ['notification-progress', '下载通知可见且进度持续增长'],
  ['notification-cancel', '通知取消动作停止下载'],
  ['notification-completion', '点击完成通知打开安装界面'],
  ['notification-denied', '拒绝通知权限仍能完成下载'],
];

function optionsFrom(argv) {
  const options = {
    run: false,
    serial: null,
    port: 18789,
    metroPort: 8081,
    apk: path.join(projectRoot, 'android/app/build/outputs/apk/debug/app-debug.apk'),
    output: path.join(projectRoot, '.tmp/update-validation'),
    caseIds: null,
  };
  const names = {
    '--serial': 'serial',
    '--port': 'port',
    '--metro-port': 'metroPort',
    '--apk': 'apk',
    '--output': 'output',
    '--cases': 'caseIds',
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--run') options.run = true;
    else if (arg === '--list') options.run = false;
    else if (arg in names) {
      const value = argv[++index];
      assert.ok(value, `Missing value for ${arg}`);
      options[names[arg]] = ['--port', '--metro-port'].includes(arg) ? Number(value) : value;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  for (const key of ['port', 'metroPort'])
    assert.ok(Number.isInteger(options[key]) && options[key] > 0 && options[key] < 65536);
  options.apk = path.resolve(options.apk);
  options.output = path.resolve(options.output);
  if (options.caseIds) {
    options.requestedCases = options.caseIds.split(',').filter(Boolean);
    for (const id of options.requestedCases)
      assert.ok(
        cases.some((value) => value[0] === id),
        `Unknown case: ${id}`,
      );
    options.caseIds = new Set(options.requestedCases);
    if (['locked', 'background-completion', 'foreground-install'].some((id) => options.caseIds.has(id)))
      options.caseIds.add('background');
    if (options.caseIds.has('foreground-install')) options.caseIds.add('background-completion');
  }
  return options;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class Inspector {
  constructor(socket) {
    this.socket = socket;
    this.pending = new Map();
    this.nextId = 0;
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(String(data));
      if (!message.id) return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timeout);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timeout);
        entry.reject(new Error('Hermes inspector disconnected'));
      }
      this.pending.clear();
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url, { origin: new URL(url).origin.replace(/^ws/, 'http') });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Hermes connection timed out')), 10_000);
      socket.addEventListener(
        'open',
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        'error',
        () => {
          clearTimeout(timeout);
          reject(new Error('Cannot connect to Hermes'));
        },
        { once: true },
      );
    });
    return new Inspector(socket);
  }
  request(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 15_000);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const raw = async (source) => {
      const response = await this.request('Runtime.evaluate', { expression: source, returnByValue: true });
      if (response.exceptionDetails)
        throw new Error(
          response.exceptionDetails.exception?.description ??
            response.exceptionDetails.text ??
            'Hermes evaluation failed',
        );
      return response.result?.value;
    };
    // Hermes versions differ in their support for CDP awaitPromise. Keep the
    // asynchronous result in our own probe namespace and poll it from Node.
    const key = `${Date.now()}-${++this.nextId}`;
    const result = await raw(`(() => {
      const value = (${expression});
      if (!value || typeof value.then !== 'function') return { done:true, value };
      globalThis.__anitabiInspectorAwait ??= new Map();
      const state = { status:'pending' };
      globalThis.__anitabiInspectorAwait.set(${JSON.stringify(key)}, state);
      Promise.resolve(value).then(value => { state.status='fulfilled'; state.value=value; }, error => {
        state.status='rejected'; state.error=String(error?.stack ?? error);
      });
      return { done:false };
    })()`);
    if (result?.done) return result.value;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const value = await raw(`(() => {
        const map = globalThis.__anitabiInspectorAwait;
        const state = map?.get(${JSON.stringify(key)});
        if (state && state.status !== 'pending') map.delete(${JSON.stringify(key)});
        return state ?? { status:'missing' };
      })()`);
      if (value?.status === 'fulfilled') return value.value;
      if (value?.status === 'rejected') throw new Error(value.error);
      if (value?.status === 'missing') throw new Error('Inspector await state was lost during JS reload');
      await sleep(100);
    }
    await raw(`globalThis.__anitabiInspectorAwait?.delete(${JSON.stringify(key)})`);
    throw new Error('Hermes asynchronous evaluation timed out');
  }
  close() {
    this.socket.close();
  }
}

function initializeProbe() {
  return `(async () => {
    const require = globalThis.__r;
    if (!require?.getModules) throw new Error('Metro development module registry is unavailable');
    const find = (suffix, predicate) => {
      const registry = [...require.getModules()];
      const suffixes = [suffix, suffix.replace('/src/', '/build/').replace('.ts', '.js'), suffix.replace('/src/', '/lib/').replace('.ts', '.js')];
      const named = registry.find(([, entry]) => {
        const name = (entry.verboseName ?? '').replace(/\\\\/g, '/');
        return suffixes.some(suffix => name.endsWith(suffix) || name === suffix.slice(1));
      });
      if (named) return require(named[0]);
      for (const [, entry] of registry) {
        const exports = entry.publicModule?.exports;
        if (exports && predicate(exports)) return exports;
      }
      throw new Error('Metro module unavailable: ' + suffix);
    };
    const service = find('/src/services/app-update.ts', value => typeof value.downloadAndInstallBinaryUpdate === 'function');
    const adapter = find('/src/services/background-update-download.ts', value => typeof value.discardBackgroundUpdateDownload === 'function');
    const files = find('/node_modules/expo-file-system/src/index.ts', value => value.File && value.Paths);
    const rn = find('/node_modules/react-native/index.js', value => value.AppState && value.DevSettings);
    if (!adapter.supportsBackgroundUpdateDownloads()) throw new Error('The development APK does not contain RNBackgroundDownloader');
    await adapter.restoreBackgroundUpdateDownloads(true);
    const library = find('/node_modules/@kesha-antonov/react-native-background-downloader/src/index.ts', value => typeof value.getExistingDownloadTasks === 'function');
    globalThis.__anitabiDeviceTest = { service, adapter, library, files, rn, current: null, snapshots: new Map() };
    return { appState: rn.AppState.currentState, implementation: ${JSON.stringify(implementation)} };
  })()`;
}

async function main() {
  const options = optionsFrom(process.argv.slice(2));
  if (!options.run) {
    console.log(
      JSON.stringify(
        {
          mode: 'plan',
          packageName,
          implementation,
          requirements: [
            'A newly built development APK is installed; this script never builds or installs an APK.',
            'Metro is already running and the development app has loaded its bundle.',
            'The development app is allowed to open the Android package installer.',
            'Optional ANITABI_TEST_UNLOCK_PATTERN is read only from the environment and is never saved.',
          ],
          command: 'node scripts/verify-update-download-device.mjs --run',
          cases: cases.map(([id, name]) => ({ id, name })),
        },
        null,
        2,
      ),
    );
    return;
  }

  const dependency = JSON.parse(
    await readFile(
      new URL('../node_modules/@kesha-antonov/react-native-background-downloader/package.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(dependency.version, '4.6.4', 'This validation plan is pinned to library version 4.6.4');
  const apk = await stat(options.apk);
  assert.ok(apk.isFile() && apk.size > 0, 'A built development APK is required');
  const apkHash = createHash('sha256');
  for await (const chunk of createReadStream(options.apk)) apkHash.update(chunk);
  await mkdir(options.output, { recursive: true });
  const runId = Date.now().toString(36);
  const report = {
    startedAt: new Date().toISOString(),
    packageName,
    implementation,
    installationPolicy: 'foreground-request-only',
    apk: options.apk,
    apkBytes: apk.size,
    apkSha256: apkHash.digest('hex'),
    cases: [],
    requestedCases: options.requestedCases ?? cases.map((value) => value[0]),
  };
  let inspector;
  let server;
  let reverseInstalled = false;
  let bytesPerSecond = 2 * 1024 * 1024;
  let holdTransferUntil = 0;
  let activeUpdate = null;
  let originalNotificationPermission;
  let notificationPermissionChanged = false;
  const transfers = [];
  const reportPath = path.join(options.output, `library-device-results-${runId}.json`);

  async function adb(args, encoding = 'utf8') {
    const scoped = options.serial ? ['-s', options.serial, ...args] : args;
    const result = await execFileAsync('adb', scoped, { encoding, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
    return result.stdout;
  }
  async function persist() {
    await writeFile(reportPath, JSON.stringify(report, null, 2));
  }
  async function testCase(id, expected, action) {
    if (options.caseIds && !options.caseIds.has(id)) return;
    const entry = {
      id,
      name: cases.find(([key]) => key === id)?.[1] ?? id,
      expected,
      status: 'running',
      startedAt: new Date().toISOString(),
    };
    report.cases.push(entry);
    console.log(JSON.stringify({ event: 'case-started', id, name: entry.name }));
    await persist();
    try {
      entry.evidence = await action();
      entry.status = 'passed';
    } catch (error) {
      entry.status = /permission|unlock|keyguard|installer.*unavailable/i.test(error.message) ? 'blocked' : 'failed';
      entry.error = error.message;
      if (error.screenshot) entry.screenshot = error.screenshot;
      if (error.notificationRecords) entry.notificationRecords = error.notificationRecords;
      if (error.timeline) entry.timeline = error.timeline;
      if (error.ownUi) entry.ownUi = error.ownUi;
    }
    entry.finishedAt = new Date().toISOString();
    console.log(JSON.stringify({ event: 'case-finished', id, status: entry.status, error: entry.error }));
    await persist();
  }
  async function waitUntil(read, predicate, description, timeout = 30_000) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
      last = await read();
      if (predicate(last)) return last;
      await sleep(500);
    }
    throw new Error(`${description} timed out; last=${JSON.stringify(last)}`);
  }
  async function connectInspector(timeout = 60_000) {
    const deadline = Date.now() + timeout;
    let lastError;
    while (Date.now() < deadline) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${options.metroPort}/json/list`)).json();
        const matching = targets.filter(
          (target) =>
            target.webSocketDebuggerUrl &&
            `${target.title} ${target.description} ${target.appId ?? ''}`.includes(packageName),
        );
        const target = matching[0] ?? (targets.length === 1 ? targets[0] : null);
        if (!target?.webSocketDebuggerUrl) throw new Error('No unambiguous development Hermes target');
        const candidate = await Inspector.connect(target.webSocketDebuggerUrl);
        try {
          await candidate.evaluate(initializeProbe());
          inspector = candidate;
          return target;
        } catch (error) {
          candidate.close();
          throw error;
        }
      } catch (error) {
        lastError = error.message;
        await sleep(1000);
      }
    }
    throw new Error(
      `Development Hermes target is unavailable; ensure the new APK and Metro bundle are running. Last error: ${String(lastError).slice(0, 800)}`,
    );
  }
  async function evaluate(expression) {
    return inspector.evaluate(expression);
  }
  async function snapshot(key = activeUpdate?.key) {
    return evaluate(`(() => {
      const test = globalThis.__anitabiDeviceTest;
      const key = ${JSON.stringify(key)};
      const value = test.adapter.getBackgroundUpdateDownloadSnapshot(key);
      if (!value || value.phase === 'cancelled') return null;
      const source = value.sourceUri ? new test.files.File(value.sourceUri) : null;
      const bytesOnDisk = source?.exists ? source.size : 0;
      const completeOnDisk = bytesOnDisk === ${apk.size} && bytesOnDisk > 0;
      return { ...value, taskId:value.taskId ?? value.id, destination:value.destinationUri,
        reportedBytesWritten:value.bytesWritten, bytesOnDisk, bytesWritten:Math.max(value.bytesWritten ?? 0, bytesOnDisk),
        status:completeOnDisk ? 'completed' : value.status, fileSize:completeOnDisk ? bytesOnDisk : value.fileSize };
    })()`);
  }
  async function state() {
    const current = await evaluate(`(() => { const test = globalThis.__anitabiDeviceTest; const current = test.current;
      return { appState: test.rn.AppState.currentState, outcome: current?.outcome ?? null,
        error: current?.error ?? null, progress: current?.progress ?? null }; })()`);
    return { ...current, snapshot: activeUpdate ? await snapshot() : null };
  }
  async function activity() {
    const output = await adb(['shell', 'dumpsys', 'activity', 'activities']);
    return output
      .split(/\r?\n/)
      .filter((line) => /mResumedActivity|topResumedActivity/.test(line))
      .join('\n');
  }
  const isInstaller = (text) => /packageinstaller|InstallStart|PackageInstallerActivity/i.test(text);
  async function screenshot(name) {
    const destination = path.join(options.output, `${runId}-${name}.png`);
    await writeFile(destination, await adb(['exec-out', 'screencap', '-p'], 'buffer'));
    return destination;
  }
  async function notificationPermissionState() {
    const dump = await adb(['shell', 'dumpsys', 'package', packageName]);
    const match = dump.match(/android\.permission\.POST_NOTIFICATIONS: granted=(true|false), flags=\[([^\]]*)\]/);
    if (!match) throw new Error('Notification permission unavailable for this development APK');
    return {
      granted: match[1] === 'true',
      userSet: match[2].includes('USER_SET'),
      userFixed: match[2].includes('USER_FIXED'),
    };
  }
  async function setNotificationPermission(granted, flags) {
    notificationPermissionChanged = true;
    const permission = 'android.permission.POST_NOTIFICATIONS';
    await adb(['shell', 'pm', granted ? 'grant' : 'revoke', packageName, permission]);
    await adb(['shell', 'pm', 'clear-permission-flags', packageName, permission, 'user-set', 'user-fixed']);
    if (flags?.userSet) await adb(['shell', 'pm', 'set-permission-flags', packageName, permission, 'user-set']);
    if (flags?.userFixed) await adb(['shell', 'pm', 'set-permission-flags', packageName, permission, 'user-fixed']);
  }
  async function ownNotifications() {
    const dump = await adb(['shell', 'dumpsys', 'notification', '--noredact']);
    const starts = [...dump.matchAll(/(?:^|\n)\s*NotificationRecord\(/g)].map((value) => value.index);
    return starts
      .map((start, index) => dump.slice(start, starts[index + 1] ?? dump.length))
      .filter((value) => value.split('\n').slice(0, 3).join(' ').includes(`pkg=${packageName} `))
      .map((text) => ({
        text: text.slice(0, 14_000),
        progress: Number(text.match(/android\.progress=[^\d\n-]*([0-9]+)/)?.[1] ?? NaN),
        maximum: Number(text.match(/android\.progressMax=[^\d\n-]*([0-9]+)/)?.[1] ?? NaN),
      }));
  }
  async function notificationUi() {
    const remotePath = '/data/local/tmp/anitabi-update-notification.xml';
    let xml;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await adb(['shell', 'uiautomator', 'dump', '--compressed', remotePath]);
          xml = await adb(['shell', 'cat', remotePath]);
          if (xml.includes('<hierarchy')) break;
        } catch (error) {
          if (attempt === 2) throw error;
        }
        await sleep(400);
      }
    } finally {
      await adb(['shell', 'rm', '-f', remotePath]).catch(() => {});
    }
    const roots = [];
    const stack = [];
    for (const token of xml.match(/<\/?node\b[^>]*>/g) ?? []) {
      if (token.startsWith('</')) {
        stack.pop();
        continue;
      }
      const attrs = Object.fromEntries(
        [...token.matchAll(/([\w:-]+)="([^"]*)"/g)].map((value) => [
          value[1],
          value[2].replace(/&amp;/g, '&').replace(/&quot;/g, '"'),
        ]),
      );
      const node = { attrs, children: [] };
      if (stack.length) stack.at(-1).children.push(node);
      else roots.push(node);
      if (!token.endsWith('/>')) stack.push(node);
    }
    const flatten = (node) => [node, ...node.children.flatMap(flatten)];
    return roots.flatMap(flatten).map((node) => ({ ...node, descendants: flatten(node) }));
  }
  async function tapBounds(bounds) {
    const match = bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
    assert.ok(match, 'Notification action has no usable bounds');
    const [left, top, right, bottom] = match.slice(1).map(Number);
    await adb([
      'shell',
      'input',
      'tap',
      String(Math.round((left + right) / 2)),
      String(Math.round((top + bottom) / 2)),
    ]);
  }
  async function clickOwnNotification(kind) {
    await adb(['shell', 'cmd', 'statusbar', 'expand-notifications']);
    await sleep(700);
    const marker = /Anitabi|anitabi-device-test/i;
    const completedFile = activeUpdate?.update.fileName.replace(/\.apk$/i, '');
    const action = kind === 'cancel' ? /^(Cancel|取消|キャンセル)$/i : /complete|finished|完成|完了/i;
    const label = (node) => `${node.attrs.text ?? ''} ${node.attrs['content-desc'] ?? ''}`;
    const matchesAction = (node) =>
      kind === 'cancel'
        ? action.test((node.attrs.text ?? '').trim()) || action.test((node.attrs['content-desc'] ?? '').trim())
        : action.test(label(node)) || Boolean(completedFile && label(node).includes(completedFile));
    let nodes = await notificationUi();
    const choose = () =>
      nodes
        .filter(
          (node) => node.descendants.some((value) => marker.test(label(value))) && node.descendants.some(matchesAction),
        )
        .sort((a, b) => a.descendants.length - b.descendants.length)[0];
    let container = choose();
    if (!container) {
      const expandable = nodes
        .filter((node) => node.descendants.some((value) => marker.test(label(value))))
        .sort((a, b) => a.descendants.length - b.descendants.length)
        .map((node) => node.descendants.find((value) => /expand_button/.test(value.attrs['resource-id'] ?? '')))
        .find(Boolean);
      if (expandable) {
        await tapBounds(expandable.attrs.bounds);
        await sleep(400);
        nodes = await notificationUi();
        container = choose();
      }
    }
    if (!container && kind === 'cancel') {
      const row = nodes
        .filter((node) => marker.test(label(node)))
        .sort(
          (a, b) =>
            Number(!(a.attrs['resource-id'] ?? '').endsWith('/title')) -
              Number(!(b.attrs['resource-id'] ?? '').endsWith('/title')) || a.descendants.length - b.descendants.length,
        )
        .find((node) => {
          const bounds = node.attrs.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
          return bounds && Number(bounds[4]) - Number(bounds[2]) > 0;
        });
      const bounds = row?.attrs.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
      if (bounds) {
        const [left, top, right, bottom] = bounds.slice(1).map(Number);
        const x = Math.round((left + right) / 2);
        const y = Math.round((top + bottom) / 2);
        await adb(['shell', 'input', 'swipe', String(x), String(y), String(x), String(Math.round(y + 420)), '600']);
        await sleep(500);
        nodes = await notificationUi();
        container = choose();
      }
    }
    if (!container) {
      const error = new Error(`Own notification ${kind} action unavailable`);
      error.screenshot = await screenshot(`notification-${kind}-unavailable`);
      error.notificationRecords = await ownNotifications();
      error.ownUi = nodes.filter((node) => marker.test(label(node))).map((node) => node.attrs);
      throw error;
    }
    const evidence = await screenshot(`notification-${kind}`);
    const target = kind === 'cancel' ? container.descendants.find(matchesAction) : container;
    await tapBounds(target.attrs.bounds);
    await sleep(300);
    return evidence;
  }
  async function downloadedHashes() {
    const value = await snapshot();
    const result = {};
    for (const [name, uri] of [
      ['source', value?.sourceUri],
      ['cache', value?.destinationUri],
    ]) {
      if (!uri) continue;
      const filename = decodeURIComponent(new URL(uri).pathname);
      assert.ok(
        filename.startsWith(`/data/user/0/${packageName}/`) || filename.startsWith(`/data/data/${packageName}/`),
        'Hash only app-owned test files',
      );
      assert.match(filename, /^[a-zA-Z0-9_./-]+$/);
      const output = await adb(['shell', 'run-as', packageName, 'sha256sum', filename]);
      const hash = output.match(/^([a-f0-9]{64})\s/i)?.[1]?.toLowerCase();
      assert.equal(hash, report.apkSha256, `${name} APK differs from the input APK`);
      result[name] = { uri, sha256: hash };
    }
    assert.ok(result.cache, 'The finalized cache APK must be hash-verified');
    return result;
  }
  async function launch(allowInstaller = false) {
    await adb(['shell', 'am', 'start', '-n', `${packageName}/.MainActivity`]);
    await waitUntil(
      async () => {
        const current = await state();
        return current.appState === 'active' || (allowInstaller && isInstaller(await activity()));
      },
      Boolean,
      'Development app foreground',
    );
  }
  async function dismissInstaller() {
    if (isInstaller(await activity())) await adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
    await launch();
  }
  async function cleanup() {
    if (!inspector || !activeUpdate) return;
    try {
      await evaluate(`(() => { const test = globalThis.__anitabiDeviceTest;
        test.service.cancelBinaryUpdateDownload(); return true; })()`);
      await sleep(200);
      await evaluate(
        `globalThis.__anitabiDeviceTest.adapter.discardBackgroundUpdateDownload(${JSON.stringify(activeUpdate.key)})`,
      );
    } catch {
      /* A reload can briefly disconnect the inspector. */
    }
    activeUpdate = null;
  }
  async function startDownload(label, route = '/valid.apk') {
    await cleanup();
    const update = {
      version: '0.8.0',
      buildNumber: 9_900_000 + report.cases.length,
      title: 'Anitabi device verification',
      fileName: `anitabi-device-test-${runId}-${label}.apk`,
      apkUrl: `http://127.0.0.1:${options.port}${route}?case=${encodeURIComponent(label)}&run=${runId}`,
    };
    const key = `${update.version}:${update.buildNumber}:${update.apkUrl}`;
    activeUpdate = { update, key };
    await evaluate(`(() => { const test = globalThis.__anitabiDeviceTest;
      test.current = { update: ${JSON.stringify(update)}, key: ${JSON.stringify(key)}, outcome: null, error: null, progress: null };
      const current = test.current;
      test.service.downloadAndInstallBinaryUpdate(current.update, value => { current.progress = value; })
        .then(value => { current.outcome = value; }, error => { current.error = String(error?.message ?? error); });
      return true; })()`);
    const started = await waitUntil(
      async () => ({ snapshot: await snapshot(), state: await state() }),
      (value) => Boolean(value.snapshot || value.state.error),
      'Library download enqueue',
    );
    return started.snapshot ?? { status: 'failed', error: started.state.error };
  }
  async function expectInstaller() {
    const top = await waitUntil(
      activity,
      isInstaller,
      'Installer activity unavailable',
      Math.max(30_000, Math.ceil((apk.size / bytesPerSecond) * 2000) + 15_000),
    );
    const image = await screenshot(`installer-${report.cases.length}`);
    const current = await state();
    if (current.snapshot?.status === 'completed') assert.equal(current.snapshot.fileSize, apk.size);
    const hashes = await downloadedHashes();
    await dismissInstaller();
    return {
      topActivity: top,
      screenshot: image,
      hashes,
      stateAtInstaller: current,
      stateAfterDismissal: await state(),
    };
  }
  async function unlock() {
    async function locked() {
      const policy = await adb(['shell', 'dumpsys', 'window', 'policy']);
      return /showing=true|mShowingLockscreen=true|isStatusBarKeyguard=true/.test(policy);
    }
    if (!(await locked())) return;
    await adb(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
    const size = await adb(['shell', 'wm', 'size']);
    const dimensions = [...size.matchAll(/(\d+)x(\d+)/g)].at(-1);
    if (dimensions) {
      const width = Number(dimensions[1]);
      const height = Number(dimensions[2]);
      await adb([
        'shell',
        'input',
        'swipe',
        String(Math.round(width / 2)),
        String(Math.round(height * 0.85)),
        String(Math.round(width / 2)),
        String(Math.round(height * 0.2)),
        '300',
      ]);
    }
    await sleep(600);
    const pattern = process.env.ANITABI_TEST_UNLOCK_PATTERN;
    if (pattern && /^[1-9]{4,9}$/.test(pattern) && new Set(pattern).size === pattern.length) {
      const remotePath = '/data/local/tmp/anitabi-update-validation.xml';
      try {
        await adb(['shell', 'uiautomator', 'dump', remotePath]);
        const xml = await adb(['shell', 'cat', remotePath]);
        const nodes = xml.match(/<node\b[^>]*>/g) ?? [];
        const node = nodes.find((value) => /LockPatternView|lockPattern|lock_pattern/i.test(value));
        const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
        if (bounds) {
          const [left, top, right, bottom] = bounds.slice(1).map(Number);
          const points = [...pattern].map((digit) => {
            const index = Number(digit) - 1;
            return [
              Math.round(left + (((index % 3) + 0.5) * (right - left)) / 3),
              Math.round(top + ((Math.floor(index / 3) + 0.5) * (bottom - top)) / 3),
            ];
          });
          const commands = points.map(
            ([x, y], index) => `input touchscreen motionevent ${index === 0 ? 'DOWN' : 'MOVE'} ${x} ${y}`,
          );
          commands.push(`input touchscreen motionevent UP ${points.at(-1).join(' ')}`);
          await adb(['shell', commands.join('; ')]);
        }
      } finally {
        await adb(['shell', 'rm', '-f', remotePath]).catch(() => {});
      }
    }
    // An unrecognized OEM lock screen is left for the person at the device; no
    // credentials or lock-screen settings are modified or saved by this script.
    await waitUntil(locked, (value) => !value, 'Device unlock/keyguard', 60_000);
  }

  try {
    const devices = (await adb(['devices']))
      .split(/\r?\n/)
      .map((line) => line.match(/^(\S+)\s+device\s*$/)?.[1])
      .filter(Boolean);
    if (!options.serial) {
      assert.equal(devices.length, 1, 'Choose exactly one authorized device with --serial');
      options.serial = devices[0];
    }
    report.device = options.serial;
    const installed = await adb(['shell', 'pm', 'path', packageName]);
    assert.match(installed, /^package:/m, 'The development app must already be installed');
    const debugFiles = await adb(['shell', 'run-as', packageName, 'pwd']);
    assert.ok(debugFiles.includes(packageName), 'Only the debuggable development package may be tested');
    originalNotificationPermission = await notificationPermissionState();
    report.notificationPermissionBefore = originalNotificationPermission;
    if (!originalNotificationPermission.granted) await setNotificationPermission(true);

    server = http.createServer(async (request, response) => {
      const route = new URL(request.url, `http://127.0.0.1:${options.port}`).pathname;
      if (route === '/not-found.apk') {
        response.writeHead(404);
        response.end('Not found');
        return;
      }
      if (route === '/invalid.apk') {
        const invalid = Buffer.from('Anitabi device verification: intentionally invalid APK.');
        response.writeHead(200, {
          'Content-Length': invalid.length,
          'Content-Type': 'application/vnd.android.package-archive',
        });
        response.end(invalid);
        return;
      }
      if (route !== '/valid.apk') {
        response.writeHead(404);
        response.end();
        return;
      }
      const range = request.headers.range?.match(/^bytes=(\d+)-$/);
      const start = range ? Number(range[1]) : 0;
      if (start >= apk.size) {
        response.writeHead(416, { 'Content-Range': `bytes */${apk.size}` });
        response.end();
        return;
      }
      const headers = {
        'Content-Length': apk.size - start,
        'Content-Type': 'application/vnd.android.package-archive',
        'Accept-Ranges': 'bytes',
      };
      if (range) headers['Content-Range'] = `bytes ${start}-${apk.size - 1}/${apk.size}`;
      response.writeHead(range ? 206 : 200, headers);
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      const transfer = {
        route: request.url,
        method: request.method,
        startedAt: new Date().toISOString(),
        start,
        bytesSent: 0,
      };
      transfers.push(transfer);
      const stream = createReadStream(options.apk, { start, highWaterMark: 64 * 1024 });
      response.on('close', () => stream.destroy());
      try {
        for await (const chunk of stream) {
          if (response.destroyed) break;
          while (Date.now() < holdTransferUntil && !response.destroyed) await sleep(100);
          if (response.destroyed) break;
          if (!response.write(chunk))
            await new Promise((resolve) => {
              const done = () => {
                response.off('drain', done);
                response.off('close', done);
                resolve();
              };
              response.once('drain', done);
              response.once('close', done);
            });
          transfer.bytesSent += chunk.length;
          await sleep(Math.max(1, Math.round((chunk.length * 1000) / bytesPerSecond)));
        }
      } catch (error) {
        transfer.error = error.message;
      }
      transfer.finishedAt = new Date().toISOString();
      response.end();
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port, '127.0.0.1', resolve);
    });
    await adb(['reverse', `tcp:${options.port}`, `tcp:${options.port}`]);
    reverseInstalled = true;
    // A USB reconnect removes reverse mappings for the previous transport.
    await adb(['reverse', `tcp:${options.metroPort}`, `tcp:${options.metroPort}`]);
    await unlock();
    await adb([
      'shell',
      'am',
      'start',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      `anitabiapp-dev://expo-development-client/?url=${encodeURIComponent(`http://127.0.0.1:${options.metroPort}`)}`,
      '-p',
      packageName,
    ]);
    report.inspector = await connectInspector();
    await launch();

    await testCase('foreground', '完整 APK 成功，系统安装界面可见', async () => {
      bytesPerSecond = 16 * 1024 * 1024;
      const started = await startDownload('foreground');
      const install = await expectInstaller();
      return { started, ...install };
    });

    await testCase('notification-completion', '点击本应用的完成通知后打开系统安装界面', async () => {
      await launch();
      bytesPerSecond = 16 * 1024 * 1024;
      await startDownload('completion-notification');
      await waitUntil(snapshot, (value) => value?.bytesWritten > 0, 'Completion-notification first bytes');
      await adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
      await waitUntil(
        snapshot,
        (value) => value?.status === 'completed',
        'Completion-notification background download',
        60_000,
      );
      await unlock();
      const beforeClick = await state();
      assert.notEqual(beforeClick.appState, 'active');
      const records = await waitUntil(
        ownNotifications,
        (value) => value.length > 0,
        'Own completion notification unavailable',
      );
      const notificationImage = await clickOwnNotification('complete');
      const firstInstaller = await waitUntil(activity, isInstaller, 'Notification installer unavailable');
      const firstImage = await screenshot('notification-first-installer');
      const hashes = await downloadedHashes();
      await adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
      await sleep(700);
      const afterBack = { activity: await activity(), state: await state() };
      await adb(['shell', 'cmd', 'statusbar', 'collapse']);
      await adb(['shell', 'am', 'start', '-n', `${packageName}/.MainActivity`]);
      await sleep(2000);
      const afterReturn = { activity: await activity(), state: await state() };
      if (isInstaller(afterReturn.activity)) {
        const error = new Error(
          'Installer reopened after cancelling the completion notification installation and returning to the app',
        );
        error.screenshot = await screenshot('notification-duplicate-installer');
        error.timeline = { beforeClick, firstInstaller, firstImage, hashes, afterBack, afterReturn };
        await adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
        throw error;
      }
      return { records, notificationImage, firstInstaller, firstImage, hashes, beforeClick, afterBack, afterReturn };
    });

    await testCase('notification-progress', '通知可见且下载进度数值增长', async () => {
      bytesPerSecond = 1024 * 1024;
      await launch();
      await startDownload('notification-progress');
      const before = await waitUntil(
        ownNotifications,
        (records) => records.some((value) => value.maximum > 0 && value.progress > 0),
        'Visible progress notification unavailable',
      );
      await adb(['shell', 'cmd', 'statusbar', 'expand-notifications']);
      const beforeImage = await screenshot('notification-progress-before');
      await sleep(3500);
      const after = await ownNotifications();
      const first = Math.max(
        ...before.filter((value) => value.maximum > 0).map((value) => value.progress / value.maximum),
      );
      const last = Math.max(
        ...after.filter((value) => value.maximum > 0).map((value) => value.progress / value.maximum),
      );
      assert.ok(last > first, 'The visible notification progress did not increase');
      const afterImage = await screenshot('notification-progress-after');
      await adb(['shell', 'cmd', 'statusbar', 'collapse']);
      await cleanup();
      return { before, after, beforeImage, afterImage };
    });

    await testCase('notification-cancel', '点击本应用通知的取消动作后任务停止且不打开安装页', async () => {
      await launch();
      await startDownload('notification-cancel');
      await waitUntil(
        ownNotifications,
        (value) => value.some((record) => record.maximum > 0),
        'Own ongoing notification unavailable',
      );
      // Keep the real transfer running but stop sending bytes briefly, so its
      // animated progress cannot prevent UiAutomator from obtaining an idle tree.
      holdTransferUntil = Date.now() + 30_000;
      let screenshotPath;
      try {
        screenshotPath = await clickOwnNotification('cancel');
      } catch (error) {
        error.screenshot ??= await screenshot('notification-cancel-unavailable');
        error.notificationRecords ??= await ownNotifications();
        throw error;
      } finally {
        holdTransferUntil = 0;
      }
      await adb(['shell', 'cmd', 'statusbar', 'collapse']);
      const cancelled = await waitUntil(state, (value) => value.outcome === 'cancelled', 'Notification cancellation');
      assert.ok(!cancelled.snapshot || cancelled.snapshot.phase === 'cancelled');
      assert.equal(isInstaller(await activity()), false);
      await cleanup();
      return { screenshot: screenshotPath, cancelled };
    });

    let backgroundStarted;
    await testCase('background', '按 Home 后仍为非前台，字节增长且 taskId 不变', async () => {
      bytesPerSecond = 1024 * 1024;
      await launch();
      backgroundStarted = await startDownload('background');
      await waitUntil(snapshot, (value) => value?.bytesWritten > 0, 'Download first bytes');
      await adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
      const before = await snapshot();
      await sleep(8_000);
      const after = await snapshot();
      assert.equal(after.taskId, before.taskId);
      assert.equal(after.destination, before.destination);
      assert.ok(after.bytesWritten > before.bytesWritten, 'Downloaded bytes did not increase in background');
      const current = await state();
      assert.notEqual(current.appState, 'active');
      assert.equal(isInstaller(await activity()), false);
      return { before, after, appState: current.appState, screenshot: await screenshot('background') };
    });

    await testCase('locked', '保持锁屏期间字节增长且 taskId 不变', async () => {
      assert.ok(backgroundStarted, 'The background download must already be running');
      await adb(['shell', 'input', 'keyevent', 'KEYCODE_SLEEP']);
      const before = await snapshot();
      await sleep(8_000);
      const after = await snapshot();
      assert.equal(after.taskId, before.taskId);
      assert.equal(after.destination, before.destination);
      assert.ok(after.bytesWritten > before.bytesWritten, 'Downloaded bytes did not increase while locked');
      return { before, after, screenshot: await screenshot('locked') };
    });

    await testCase('background-completion', '系统任务完成，但 App 未进入前台，安装界面未启动', async () => {
      bytesPerSecond = 64 * 1024 * 1024;
      const completed = await waitUntil(
        snapshot,
        (value) => value?.status === 'completed',
        'Background system download',
        60_000,
      );
      const current = await state();
      assert.notEqual(current.appState, 'active');
      const top = await activity();
      assert.equal(isInstaller(top), false);
      return {
        completed,
        appState: current.appState,
        topActivity: top,
        screenshot: await screenshot('background-completed'),
      };
    });

    await testCase('foreground-install', '返回 App 不自动安装，显式请求安装缓存 APK 后打开安装界面', async () => {
      await unlock();
      await launch();
      await sleep(2000);
      const beforeManualInstall = { activity: await activity(), state: await state() };
      assert.equal(isInstaller(beforeManualInstall.activity), false, 'Returning to App must not install automatically');
      assert.equal(beforeManualInstall.state.outcome, 'completed');
      assert.equal(
        await evaluate(
          `globalThis.__anitabiDeviceTest.service.isBinaryUpdateDownloaded(${JSON.stringify(activeUpdate.update)})`,
        ),
        true,
      );
      await evaluate(`(() => { const test = globalThis.__anitabiDeviceTest; const current = test.current;
        current.outcome = null;
        test.service.downloadAndInstallBinaryUpdate(current.update)
          .then(value => { current.outcome = value; }, error => { current.error = String(error?.message ?? error); });
        return true; })()`);
      return { beforeManualInstall, ...(await expectInstaller()) };
    });

    await testCase('reload-reconnect', 'JS reload 后 taskId 与进度保留，不发起新的完整下载', async () => {
      bytesPerSecond = 1024 * 1024;
      await launch();
      await startDownload('reload');
      const before = await waitUntil(snapshot, (value) => value?.bytesWritten > 0, 'Download first bytes');
      const transferCount = transfers.length;
      await evaluate(
        `(() => { setTimeout(() => globalThis.__anitabiDeviceTest.rn.DevSettings.reload(), 100); return true; })()`,
      );
      await sleep(2_000);
      inspector.close();
      await connectInspector();
      const recoveredTasks =
        await evaluate(`(async () => (await globalThis.__anitabiDeviceTest.library.getExistingDownloadTasks())
        .filter(task => task.metadata?.owner === 'anitabi-app-update')
        .map(task => ({ id:task.id,state:task.state,metadata:task.metadata,bytesDownloaded:task.bytesDownloaded,bytesTotal:task.bytesTotal })))()`);
      const afterReload = await snapshot();
      assert.equal(afterReload.taskId, before.taskId);
      assert.equal(afterReload.destination, before.destination);
      assert.ok(afterReload.bytesWritten >= before.bytesWritten);
      await evaluate(`(() => { const test = globalThis.__anitabiDeviceTest;
        test.current = { update: ${JSON.stringify(activeUpdate.update)}, key: ${JSON.stringify(activeUpdate.key)}, outcome: null, error: null, progress: null };
        const current = test.current;
        test.service.downloadAndInstallBinaryUpdate(current.update, value => { current.progress = value; }, { installWhenReady: false })
          .then(value => { current.outcome = value; }, error => { current.error = String(error?.message ?? error); });
        return true; })()`);
      const reattached = await snapshot();
      assert.equal(reattached.taskId, before.taskId);
      assert.equal(reattached.destination, before.destination);
      await sleep(1500);
      const additionalRequests = transfers.slice(transferCount);
      assert.ok(
        additionalRequests.every((value) => value.start > 0),
        'Reload started a second HTTP transfer from byte zero',
      );
      bytesPerSecond = 64 * 1024 * 1024;
      const completed = await waitUntil(
        state,
        (value) => value.outcome === 'completed',
        'Reattached download ready',
        60_000,
      );
      await sleep(2000);
      const afterCompletion = { activity: await activity(), state: await state() };
      assert.equal(isInstaller(afterCompletion.activity), false, 'Automatic reattachment must not open an installer');
      const hashes = await downloadedHashes();
      await cleanup();
      return {
        before,
        afterReload,
        reattached,
        additionalRequests,
        recoveredTasks,
        completed,
        afterCompletion,
        hashes,
      };
    });

    await testCase('cancel', '下载取消后系统任务被移除且不打开安装界面', async () => {
      await launch();
      const started = await startDownload('cancel');
      await waitUntil(snapshot, (value) => value?.bytesWritten > 0, 'Download first bytes');
      assert.equal(await evaluate('globalThis.__anitabiDeviceTest.service.cancelBinaryUpdateDownload()'), true);
      const cancelled = await waitUntil(state, (value) => value.outcome === 'cancelled', 'Download cancellation');
      assert.equal(cancelled.snapshot, null);
      assert.equal(isInstaller(await activity()), false);
      activeUpdate = null;
      return { started, cancelled, screenshot: await screenshot('cancelled') };
    });

    for (const [id, route] of [
      ['http-error', '/not-found.apk'],
      ['invalid-apk', '/invalid.apk'],
    ]) {
      await testCase(id, '下载或 APK 校验失败，无安装界面', async () => {
        await launch();
        const started = await startDownload(id, route);
        const failed = await waitUntil(state, (value) => Boolean(value.error), 'Expected download failure', 45_000);
        assert.equal(isInstaller(await activity()), false);
        assert.notEqual(failed.outcome, 'completed');
        await cleanup();
        return { started, failed, screenshot: await screenshot(id) };
      });
    }

    await testCase('notification-denied', 'POST_NOTIFICATIONS处于拒绝状态时仍能完成APK下载并打开安装界面', async () => {
      await cleanup();
      inspector?.close();
      inspector = undefined;
      await setNotificationPermission(false, { userSet: true, userFixed: true });
      const denied = await notificationPermissionState();
      assert.equal(denied.granted, false);
      await adb([
        'shell',
        'am',
        'start',
        '-a',
        'android.intent.action.VIEW',
        '-d',
        `anitabiapp-dev://expo-development-client/?url=${encodeURIComponent(`http://127.0.0.1:${options.metroPort}`)}`,
        '-p',
        packageName,
      ]);
      await connectInspector();
      await launch();
      bytesPerSecond = 16 * 1024 * 1024;
      const started = await startDownload('notification-denied');
      const installer = await expectInstaller();
      assert.equal((await notificationPermissionState()).granted, false);
      await cleanup();
      return { denied, started, installer };
    });
  } catch (error) {
    report.fatalError = error.message;
  } finally {
    await cleanup();
    inspector?.close();
    if (notificationPermissionChanged && originalNotificationPermission) {
      try {
        await setNotificationPermission(originalNotificationPermission.granted, originalNotificationPermission);
        report.notificationPermissionAfter = await notificationPermissionState();
        assert.deepEqual(report.notificationPermissionAfter, originalNotificationPermission);
      } catch (error) {
        report.fatalError =
          `${report.fatalError ?? ''} Notification permission restoration failed: ${error.message}`.trim();
      }
    }
    await adb(['shell', 'cmd', 'statusbar', 'collapse']).catch(() => {});
    await adb(['shell', 'am', 'start', '-n', `${packageName}/.MainActivity`]).catch(() => {});
    if (reverseInstalled) await adb(['reverse', '--remove', `tcp:${options.port}`]).catch(() => {});
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    report.finishedAt = new Date().toISOString();
    report.transfers = transfers;
    report.passed = report.cases.filter((entry) => entry.status === 'passed').length;
    report.failed = report.cases.filter((entry) => entry.status === 'failed').length;
    report.blocked = report.cases.filter((entry) => entry.status === 'blocked').length;
    await persist();
    console.log(
      JSON.stringify({
        event: 'finished',
        report: reportPath,
        passed: report.passed,
        failed: report.failed,
        blocked: report.blocked,
        fatalError: report.fatalError,
      }),
    );
    if (
      report.fatalError ||
      report.failed ||
      report.blocked ||
      report.cases.length !== (options.caseIds?.size ?? cases.length)
    )
      process.exitCode = 1;
  }
}

await main();
