import type { DownloadTask } from '@kesha-antonov/react-native-background-downloader';
import i18n from '@/i18n';
import { Directory, File, Paths } from 'expo-file-system';
import { AppState, NativeModules, PermissionsAndroid, Platform, TurboModuleRegistry } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

type Downloader = typeof import('@kesha-antonov/react-native-background-downloader');
type Progress = { bytesWritten: number; totalBytes: number; percent: number };
type Phase = 'downloading' | 'paused' | 'downloaded' | 'ready' | 'failed' | 'cancelled';
type Journal = {
  schemaVersion: 1;
  updateKey: string;
  url: string;
  sourceUri: string;
  destinationUri: string;
  phase: Phase;
  expectedBytes: number;
  bytesWritten: number;
};
type Entry = Journal & {
  task?: DownloadTask;
  error?: Error;
  reason?: number;
  wake?: () => void;
  operation?: Promise<void>;
  stopped?: Promise<void>;
};
type Monitor = { updateKey: string; entry?: Entry; cancelled: boolean; detached: boolean };

const OWNER = 'anitabi-app-update';
const JOURNAL_KEY = 'current-download-v1';
const entries = new Map<string, Entry>();
let storage: ReturnType<typeof createMMKV> | null | undefined;
let libraryPromise: Promise<Downloader> | undefined;
let restoring: Promise<void> | undefined;
let restored = false;
let observedForeground = false;
let monitor: Monitor | null = null;

export function supportsBackgroundUpdateDownloads(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    return Boolean(TurboModuleRegistry.get('RNBackgroundDownloader') ?? NativeModules.RNBackgroundDownloader);
  } catch {
    return false;
  }
}

function journalStorage() {
  if (storage === undefined) {
    try {
      storage = createMMKV({ id: 'anitabi-background-update-download' });
    } catch {
      storage = null;
    }
  }
  return storage;
}
function sourceDirectory(): Directory {
  return new Directory(Paths.document, 'anitabi-update-downloads');
}
function fileUri(value: string): string {
  return value.startsWith('/') ? `file://${value}` : value;
}
function safePaths(source: string, destination: string): boolean {
  const sourceRoot = `${sourceDirectory().uri.replace(/\/+$/, '')}/`;
  const cacheRoot = `${Paths.cache.uri.replace(/\/+$/, '')}/`;
  return (
    source.startsWith(sourceRoot) &&
    destination.startsWith(cacheRoot) &&
    /^[a-zA-Z0-9._-]+\.ready\.apk$/.test(source.slice(sourceRoot.length)) &&
    /^[a-zA-Z0-9._-]+\.ready\.apk$/.test(destination.slice(cacheRoot.length))
  );
}
function persist(entry: Entry): void {
  const { updateKey, url, sourceUri, destinationUri, phase, expectedBytes, bytesWritten } = entry;
  journalStorage()?.set(
    JOURNAL_KEY,
    JSON.stringify({ schemaVersion: 1, updateKey, url, sourceUri, destinationUri, phase, expectedBytes, bytesWritten }),
  );
}
function loadJournal(): void {
  const raw = journalStorage()?.getString(JOURNAL_KEY);
  if (!raw) return;
  try {
    const value = JSON.parse(raw) as Journal;
    if (
      value.schemaVersion === 1 &&
      typeof value.updateKey === 'string' &&
      typeof value.url === 'string' &&
      typeof value.sourceUri === 'string' &&
      typeof value.destinationUri === 'string' &&
      safePaths(value.sourceUri, value.destinationUri) &&
      ['downloading', 'paused', 'downloaded', 'ready', 'failed', 'cancelled'].includes(value.phase) &&
      Number.isFinite(value.expectedBytes) &&
      value.expectedBytes >= 0 &&
      Number.isFinite(value.bytesWritten) &&
      value.bytesWritten >= 0 &&
      !entries.has(value.updateKey)
    ) {
      entries.set(value.updateKey, value);
    }
  } catch {
    /* A damaged journal cannot establish completion. */
  }
}
function wake(entry: Entry): void {
  const callback = entry.wake;
  entry.wake = undefined;
  callback?.();
}
function progress(entry: Entry): Progress {
  return {
    bytesWritten: Math.max(0, entry.bytesWritten),
    totalBytes: Math.max(0, entry.expectedBytes),
    percent:
      entry.phase === 'ready' || entry.phase === 'downloaded'
        ? 100
        : entry.expectedBytes > 0
          ? Math.min(100, Math.round((entry.bytesWritten / entry.expectedBytes) * 100))
          : 0,
  };
}
export function getBackgroundUpdateDownloadProgress(updateKey: string): Progress | null {
  const entry = entries.get(updateKey);
  return entry && entry.phase !== 'failed' && entry.phase !== 'cancelled' ? progress(entry) : null;
}
export function getBackgroundUpdateDownloadSnapshot(updateKey: string) {
  const entry = entries.get(updateKey);
  if (!entry) return null;
  const file = new File(entry.phase === 'ready' ? entry.destinationUri : entry.sourceUri);
  const status =
    entry.phase === 'ready' || entry.phase === 'downloaded'
      ? 'completed'
      : entry.phase === 'paused'
        ? 'paused'
        : entry.phase === 'failed' || entry.phase === 'cancelled'
          ? 'failed'
          : entry.task?.state === 'PENDING'
            ? 'pending'
            : 'running';
  return {
    updateKey,
    id: entry.task?.id ?? updateKey,
    taskId: entry.task?.id ?? updateKey,
    downloadId: entry.task?.id ?? updateKey,
    status,
    phase: entry.phase,
    sourceUri: entry.sourceUri,
    destinationUri: entry.destinationUri,
    expectedBytes: entry.expectedBytes,
    ...progress(entry),
    reason: entry.reason ?? null,
    fileUri: file.uri,
    fileExists: file.exists,
    fileSize: file.exists ? (file.size ?? 0) : 0,
  };
}

async function downloader(): Promise<Downloader> {
  libraryPromise ??= import('@kesha-antonov/react-native-background-downloader')
    .then((library) => {
      library.setConfig({
        progressInterval: 750,
        progressMinBytes: 128 * 1024,
        showNotificationsEnabled: true,
        showCompletionNotification: true,
        showCancelAction: true,
        notificationsGrouping: {
          enabled: false,
          texts: {
            downloadTitle: i18n.t('appUpdateDownloadTitle', { defaultValue: 'Anitabi 更新' }),
            downloadStarting: i18n.t('downloadingInstaller', { defaultValue: '正在下载安装包' }),
            downloadProgress: `${i18n.t('downloadingInstaller', { defaultValue: '正在下载安装包' })} {progress}%`,
            downloadPaused: i18n.t('downloadPaused', { defaultValue: '下载已暂停' }),
            downloadFinished: i18n.t('installerDownloadFinished', { defaultValue: '下载完成，返回应用安装' }),
            downloadCancel: i18n.t('cancel', { defaultValue: '取消' }),
          },
        },
      });
      return library;
    })
    .catch((error) => {
      libraryPromise = undefined;
      throw error;
    });
  return libraryPromise;
}
function bind(entry: Entry, task: DownloadTask): void {
  entry.task = task;
  const current = () => entries.get(entry.updateKey) === entry && entry.phase !== 'cancelled';
  task
    .begin(({ expectedBytes }) => {
      if (!current()) return;
      if (expectedBytes > 0) entry.expectedBytes = expectedBytes;
      if (entry.phase !== 'downloaded' && entry.phase !== 'ready') entry.phase = 'downloading';
      persist(entry);
      wake(entry);
    })
    .progress(({ bytesDownloaded, bytesTotal }) => {
      if (!current()) return;
      entry.bytesWritten = Math.max(0, bytesDownloaded);
      if (bytesTotal > 0) entry.expectedBytes = bytesTotal;
      persist(entry);
      wake(entry);
    })
    .done(({ bytesDownloaded, bytesTotal }) => {
      if (!current()) return;
      entry.bytesWritten = Math.max(0, bytesDownloaded);
      if (bytesTotal > 0) entry.expectedBytes = bytesTotal;
      entry.phase = 'downloaded';
      persist(entry);
      wake(entry);
    })
    .error(({ error, errorCode }) => {
      if (!current()) return;
      const cancelledByUser = errorCode === -1 && /download cancelled by user/i.test(error);
      entry.phase = cancelledByUser ? 'cancelled' : 'failed';
      entry.reason = errorCode;
      entry.error = cancelledByUser ? undefined : new Error(`Update download failed (${errorCode}): ${error}`);
      if (cancelledByUser && monitor?.entry === entry) monitor.cancelled = true;
      persist(entry);
      wake(entry);
      if (!monitor || monitor.entry !== entry) void removeEntry(entry).catch(() => {});
    });
}
class InvalidApkError extends Error {}
async function verifyApk(file: File, expectedBytes: number): Promise<number> {
  const size = file.exists ? (file.size ?? 0) : 0;
  if (size < 4 || (expectedBytes > 0 && size !== expectedBytes))
    throw new InvalidApkError('Downloaded APK is missing or incomplete');
  const handle = file.open();
  try {
    const header = await handle.readBytes(4);
    if (header.length !== 4 || header[0] !== 0x50 || header[1] !== 0x4b || header[2] !== 3 || header[3] !== 4) {
      throw new InvalidApkError('Downloaded file is not an APK ZIP archive');
    }
  } finally {
    handle.close();
  }
  return size;
}
function deleteFile(uri: string): void {
  const file = new File(uri);
  if (file.exists) file.delete();
}
async function removeEntry(entry: Entry): Promise<void> {
  entry.stopped ??= (async () => {
    await entry.task?.stop();
    deleteFile(entry.sourceUri);
    deleteFile(entry.destinationUri);
    if (entries.get(entry.updateKey) === entry) entries.delete(entry.updateKey);
    const raw = journalStorage()?.getString(JOURNAL_KEY);
    if (raw) {
      try {
        if (JSON.parse(raw).updateKey === entry.updateKey) journalStorage()?.remove(JOURNAL_KEY);
      } catch {
        journalStorage()?.remove(JOURNAL_KEY);
      }
    }
  })();
  await entry.stopped;
}

export async function restoreBackgroundUpdateDownloads(force = false): Promise<void> {
  if (!supportsBackgroundUpdateDownloads() || (restored && !force)) return;
  if (restoring) return restoring;
  restoring = (async () => {
    loadJournal();
    const library = await downloader();
    const tasks = await library.getExistingDownloadTasks();
    const found = new Set<string>();
    for (const task of tasks) {
      const metadata = task.metadata;
      const key = metadata?.updateKey;
      if (metadata?.owner !== OWNER || typeof key !== 'string') continue;
      let entry = entries.get(key);
      if (!entry) {
        const sourceUri = typeof metadata.sourceUri === 'string' ? metadata.sourceUri : task.destination;
        const destinationUri = metadata.destinationUri;
        if (
          typeof sourceUri !== 'string' ||
          typeof destinationUri !== 'string' ||
          !safePaths(fileUri(sourceUri), destinationUri)
        )
          continue;
        entry = {
          schemaVersion: 1,
          updateKey: key,
          url: String(metadata.url ?? ''),
          sourceUri: fileUri(sourceUri),
          destinationUri,
          expectedBytes: 0,
          bytesWritten: 0,
          phase: 'downloading',
        };
        entries.set(key, entry);
      }
      if (entry.phase === 'cancelled' || entry.stopped) continue;
      found.add(key);
      bind(entry, task);
      entry.bytesWritten = Math.max(0, task.bytesDownloaded);
      if (task.bytesTotal > 0) entry.expectedBytes = task.bytesTotal;
      if (entry.phase !== 'ready' && entry.phase !== 'downloaded')
        entry.phase =
          task.state === 'DONE'
            ? 'downloaded'
            : task.state === 'PAUSED'
              ? 'paused'
              : task.state === 'FAILED' || task.state === 'STOPPED'
                ? 'failed'
                : 'downloading';
      persist(entry);
      wake(entry);
    }
    for (const entry of entries.values()) {
      if (found.has(entry.updateKey) || entry.phase === 'cancelled' || entry.phase === 'failed') continue;
      try {
        if (entry.phase === 'ready') await verifyApk(new File(entry.destinationUri), entry.expectedBytes);
        else {
          const source = new File(entry.sourceUri);
          if (
            entry.phase !== 'downloaded' &&
            !(entry.expectedBytes > 0 && source.exists && source.size === entry.expectedBytes)
          ) {
            // An active native transfer may be between snapshots. Keep waiting
            // for it; a non-empty partial file is not completion evidence.
            if (monitor?.entry === entry) continue;
            throw new InvalidApkError('Interrupted APK download has no completion evidence');
          }
          await verifyApk(source, entry.expectedBytes || entry.bytesWritten);
          if (!['ready', 'cancelled'].includes(entry.phase)) entry.phase = 'downloaded';
        }
        if (entries.get(entry.updateKey) === entry && !['cancelled'].includes(entry.phase)) {
          persist(entry);
          wake(entry);
        }
      } catch (error) {
        if (entries.get(entry.updateKey) === entry && !['cancelled'].includes(entry.phase)) {
          entry.phase = 'failed';
          entry.error = error instanceof Error ? error : new Error('APK recovery failed');
          persist(entry);
          wake(entry);
        }
      }
    }
    restored = true;
    if (!observedForeground) {
      observedForeground = true;
      AppState.addEventListener('change', (state) => {
        if (state === 'active') void restoreBackgroundUpdateDownloads(true).catch(() => {});
      });
    }
  })().finally(() => {
    restoring = undefined;
  });
  return restoring;
}
export async function discardBackgroundUpdateDownload(updateKey: string): Promise<void> {
  if (!supportsBackgroundUpdateDownloads()) return;
  if (!entries.has(updateKey)) await restoreBackgroundUpdateDownloads();
  const entry = entries.get(updateKey);
  if (!entry) return;
  entry.phase = 'cancelled';
  if (monitor?.entry === entry) monitor.cancelled = true;
  wake(entry);
  await removeEntry(entry);
}

/** Pause an existing transfer discovered before an in-app monitor has attached. */
export async function pauseBackgroundUpdateDownload(updateKey: string): Promise<boolean> {
  if (!supportsBackgroundUpdateDownloads()) return false;
  await restoreBackgroundUpdateDownloads();
  const entry = entries.get(updateKey);
  if (!entry || entry.phase === 'failed' || entry.phase === 'cancelled') return false;
  if (entry.phase === 'paused' || entry.phase === 'downloaded' || entry.phase === 'ready') return true;
  if (!entry.task) return false;
  const task = entry.task;
  entry.operation = (async () => {
    await task.pause();
    if (entries.get(updateKey) === entry && !['downloaded', 'ready', 'cancelled'].includes(entry.phase)) {
      entry.phase = 'paused';
      persist(entry);
    }
    wake(entry);
  })();
  await entry.operation;
  return true;
}

export async function cleanupBackgroundUpdateDownloads(keepKeys: Set<string>): Promise<void> {
  if (!supportsBackgroundUpdateDownloads()) return;
  await restoreBackgroundUpdateDownloads();
  for (const entry of entries.values()) {
    if (!keepKeys.has(entry.updateKey) && monitor?.entry !== entry)
      await discardBackgroundUpdateDownload(entry.updateKey);
  }
  const protectedUris = new Set([...entries.values()].map((entry) => entry.sourceUri));
  try {
    for (const file of sourceDirectory().list())
      if (file instanceof File && !protectedUris.has(file.uri)) file.delete();
  } catch {
    /* Source directory need not exist before the first download. */
  }
}
async function permissionForNewDownload(): Promise<void> {
  if (Number(Platform.Version) < 33 || !PermissionsAndroid?.PERMISSIONS?.POST_NOTIFICATIONS) return;
  try {
    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (!(await PermissionsAndroid.check(permission))) await PermissionsAndroid.request(permission);
  } catch {
    /* Notification denial never prevents downloading. */
  }
}
async function finalize(entry: Entry, active: Monitor): Promise<void> {
  const source = new File(entry.sourceUri);
  const destination = new File(entry.destinationUri);
  try {
    const size = await verifyApk(source, entry.expectedBytes || entry.bytesWritten);
    if (active.cancelled) return;
    if (destination.exists) deleteFile(destination.uri);
    await source.copy(destination, { overwrite: true });
    if (active.cancelled) {
      deleteFile(destination.uri);
      return;
    }
    await verifyApk(destination, size);
    if (active.cancelled || entries.get(entry.updateKey) !== entry) {
      deleteFile(destination.uri);
      return;
    }
    entry.bytesWritten = size;
    entry.expectedBytes = size;
    entry.phase = 'ready';
    persist(entry);
    await (await downloader()).completeHandler(entry.updateKey);
  } catch (error) {
    deleteFile(destination.uri);
    if (active.cancelled || active.detached) return;
    if (error instanceof InvalidApkError) await removeEntry(entry);
    throw error;
  }
}

export async function downloadUpdateInBackground(
  updateKey: string,
  url: string,
  fileName: string,
  title: string,
  destinationUri: string,
  onProgress?: (value: Progress) => void,
): Promise<'completed' | 'paused' | 'cancelled'> {
  if (!supportsBackgroundUpdateDownloads()) throw new Error('Background update downloader is unavailable');
  if (monitor) throw new Error('An update download is already being monitored');
  const active: Monitor = { updateKey, cancelled: false, detached: false };
  monitor = active;
  try {
    await restoreBackgroundUpdateDownloads();
    if (active.cancelled) return 'cancelled';
    if (active.detached) return 'paused';
    let entry = entries.get(updateKey);
    if (entry?.phase === 'failed' || entry?.phase === 'cancelled') {
      await removeEntry(entry);
      entry = undefined;
    }
    if (!entry) {
      await permissionForNewDownload();
      if (active.cancelled) return 'cancelled';
      if (active.detached) return 'paused';
      sourceDirectory().create({ intermediates: true, idempotent: true });
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
      const source = new File(sourceDirectory(), safeName.endsWith('.ready.apk') ? safeName : `${safeName}.ready.apk`);
      if (!safePaths(source.uri, destinationUri)) throw new Error('Invalid APK download destination');
      deleteFile(source.uri);
      entry = {
        schemaVersion: 1,
        updateKey,
        url,
        sourceUri: source.uri,
        destinationUri,
        phase: 'downloading',
        expectedBytes: 0,
        bytesWritten: 0,
      };
      entries.set(updateKey, entry);
      active.entry = entry;
      persist(entry);
      const library = await downloader();
      if (active.cancelled || active.detached) return active.cancelled ? 'cancelled' : 'paused';
      const task = library.createDownloadTask({
        id: updateKey,
        url,
        destination: source.uri,
        metadata: {
          owner: OWNER,
          updateKey,
          url,
          sourceUri: source.uri,
          destinationUri,
          notificationTitle: title,
          fileName: source.name,
        },
        notificationTitle: title,
        isAllowedOverMetered: true,
        isAllowedOverRoaming: true,
      });
      bind(entry, task);
      task.start();
    } else {
      active.entry = entry;
      if (entry.phase === 'paused') {
        entry.phase = 'downloading';
        await entry.task?.resume();
        persist(entry);
      }
    }
    for (;;) {
      if (active.cancelled || entry.phase === 'cancelled') return 'cancelled';
      if (active.detached) {
        await entry.operation;
        return 'paused';
      }
      if (entry.phase === 'failed') throw entry.error ?? new Error('Background APK download failed');
      onProgress?.(progress(entry));
      if (entry.phase === 'downloaded') {
        await finalize(entry, active);
        if (active.cancelled) return 'cancelled';
        if (active.detached) return 'paused';
      }
      if (entry.phase === 'ready') {
        onProgress?.(progress(entry));
        return 'completed';
      }
      await new Promise<void>((resolve) => {
        entry.wake = resolve;
        if (active.cancelled || active.detached || entry.phase === 'downloaded' || entry.phase === 'failed')
          wake(entry);
      });
    }
  } finally {
    try {
      if (active.cancelled && active.entry) {
        await removeEntry(active.entry);
        deleteFile(active.entry.destinationUri);
      }
    } finally {
      if (monitor === active) monitor = null;
    }
  }
}
export function cancelBackgroundUpdateDownload(): boolean {
  const active = monitor;
  if (!active || active.cancelled) return false;
  active.cancelled = true;
  if (active.entry) {
    active.entry.phase = 'cancelled';
    wake(active.entry);
    active.entry.operation = removeEntry(active.entry);
    void active.entry.operation.catch(() => {});
  }
  return true;
}
export function detachBackgroundUpdateDownload(): boolean {
  const active = monitor;
  if (!active) return false;
  active.detached = true;
  const entry = active.entry;
  if (entry) {
    entry.operation = (async () => {
      if (entry.task && entry.phase !== 'downloaded' && entry.phase !== 'ready') {
        await entry.task.pause();
        if (!['downloaded', 'ready'].includes(entry.phase)) entry.phase = 'paused';
        persist(entry);
      }
      wake(entry);
    })();
    void entry.operation.catch((error) => {
      entry.error = error;
      wake(entry);
    });
    wake(entry);
  }
  return true;
}
