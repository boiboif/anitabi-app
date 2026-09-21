import * as Application from 'expo-application';
import i18n from '@/i18n';
import Constants from 'expo-constants';
import {
  Directory,
  DownloadTask,
  File,
  Paths,
  type DownloadPauseState,
  type DownloadTaskOptions,
} from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import * as Updates from 'expo-updates';
import { AppState, Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

export type BinaryUpdate = {
  version: string;
  displayVersion?: string;
  buildNumber?: number;
  title?: string;
  releaseNotes?: string;
  apkUrl: string;
  releaseUrl?: string;
  mandatory?: boolean;
  minSupportedVersion?: string;
  minSupportedBuildNumber?: number;
  fileName?: string;
};

export type BinaryDownloadProgress = {
  bytesWritten: number;
  totalBytes: number;
  percent: number;
};

export type BinaryDownloadResult = 'completed' | 'paused' | 'cancelled';

type PersistedBinaryDownload = {
  schemaVersion: 1;
  updateKey: string;
  pauseState: DownloadPauseState;
  progress: BinaryDownloadProgress;
};

type ActiveBinaryDownload = {
  task: DownloadTask;
  update: BinaryUpdate;
  progress: BinaryDownloadProgress;
  cancelled: boolean;
};

const DEFAULT_MANIFEST_URL = 'https://raw.githubusercontent.com/boiboif/anitabi-app/main/docs/releases/latest.json';
const BINARY_DOWNLOAD_STATE_KEY = 'binary-download-v1';
const BINARY_READY_FILE_SUFFIX = '.ready.apk';
const BINARY_TEMPORARY_FILE_SUFFIX = `${BINARY_READY_FILE_SUFFIX}.download`;

let downloadStorage: ReturnType<typeof createMMKV> | null = null;
let activeBinaryDownload: ActiveBinaryDownload | null = null;

try {
  downloadStorage = createMMKV({ id: 'anitabi-app-update' });
} catch (error) {
  console.warn('MMKV init failed, resumable app downloads are disabled:', error);
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

function getCurrentVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

function getCurrentBuildNumber(): number {
  const buildNumber = Number(Application.nativeBuildVersion ?? Constants.platform?.android?.versionCode ?? 0);
  return Number.isFinite(buildNumber) ? buildNumber : 0;
}

function getManifestUrl(): string {
  return Constants.expoConfig?.extra?.binaryUpdateManifestUrl ?? DEFAULT_MANIFEST_URL;
}

export function areAppUpdatesEnabled(): boolean {
  return Constants.expoConfig?.extra?.appUpdatesEnabled === true;
}

export function getCurrentAppDisplayVersion(): string {
  const configuredVersion = Constants.expoConfig?.version;
  const displayVersion = configuredVersion?.includes('-')
    ? configuredVersion
    : !__DEV__ && Application.nativeApplicationVersion
      ? Application.nativeApplicationVersion
      : (configuredVersion ?? Application.nativeApplicationVersion ?? i18n.t('unknown', { defaultValue: '未知' }));
  const hotUpdateId =
    Platform.OS !== 'web' && Updates.isEnabled && !Updates.isEmbeddedLaunch && !Updates.isEmergencyLaunch
      ? Updates.updateId
      : null;

  return hotUpdateId ? `${displayVersion}-${hotUpdateId.slice(0, 8)}` : displayVersion;
}

export function getBinaryUpdateDisplayVersion(update: BinaryUpdate): string {
  if (update.displayVersion?.trim()) return update.displayVersion.trim().replace(/^v/i, '');
  const title = update.title?.trim();
  if (title && /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(title)) {
    return title.replace(/^v/i, '');
  }
  return update.version;
}

function isBinaryUpdate(value: unknown): value is BinaryUpdate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BinaryUpdate>;
  return (
    typeof candidate.version === 'string' &&
    typeof candidate.apkUrl === 'string' &&
    (candidate.displayVersion === undefined || typeof candidate.displayVersion === 'string') &&
    (candidate.buildNumber === undefined || typeof candidate.buildNumber === 'number')
  );
}

export function isNewerVersion(version: string, currentVersion = getCurrentVersion()): boolean {
  return compareVersions(version, currentVersion) > 0;
}

export function isNewerBinaryUpdate(
  update: BinaryUpdate,
  currentVersion = getCurrentVersion(),
  currentBuildNumber = getCurrentBuildNumber(),
): boolean {
  const versionComparison = compareVersions(update.version, currentVersion);
  if (versionComparison !== 0) return versionComparison > 0;
  return typeof update.buildNumber === 'number' && update.buildNumber > currentBuildNumber;
}

export function isMandatoryUpdate(
  update: BinaryUpdate,
  currentVersion = getCurrentVersion(),
  currentBuildNumber = getCurrentBuildNumber(),
): boolean {
  return (
    Boolean(update.mandatory) ||
    Boolean(
      typeof update.minSupportedBuildNumber === 'number' && currentBuildNumber < update.minSupportedBuildNumber,
    ) ||
    Boolean(update.minSupportedVersion && compareVersions(currentVersion, update.minSupportedVersion) < 0)
  );
}

function getBinaryUpdateFile(update: BinaryUpdate): File {
  const baseName = (update.fileName?.replace(/\.apk$/i, '') ?? 'anitabi').replace(/[^a-zA-Z0-9._-]/g, '-');
  const buildIdentifier =
    typeof update.buildNumber === 'number' ? `${update.version}-${update.buildNumber}` : update.version;
  return new File(Paths.cache, `${baseName}-${buildIdentifier}.ready.apk`);
}

function getBinaryUpdateTemporaryFile(update: BinaryUpdate): File {
  const destination = getBinaryUpdateFile(update);
  return new File(Paths.document, `${destination.name}.download`);
}

function getBinaryUpdateKey(update: BinaryUpdate): string {
  return `${update.version}:${update.buildNumber ?? ''}:${update.apkUrl}`;
}

function isBinaryDownloadProgress(value: unknown): value is BinaryDownloadProgress {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BinaryDownloadProgress>;
  return (
    typeof candidate.bytesWritten === 'number' &&
    typeof candidate.totalBytes === 'number' &&
    typeof candidate.percent === 'number'
  );
}

function readPersistedBinaryDownload(update: BinaryUpdate): PersistedBinaryDownload | null {
  const raw = downloadStorage?.getString(BINARY_DOWNLOAD_STATE_KEY);
  if (!raw) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Partial<PersistedBinaryDownload>;
    const pauseState = candidate.pauseState;
    const temporaryFile = getBinaryUpdateTemporaryFile(update);
    if (
      candidate.schemaVersion !== 1 ||
      candidate.updateKey !== getBinaryUpdateKey(update) ||
      !pauseState ||
      typeof pauseState.url !== 'string' ||
      typeof pauseState.fileUri !== 'string' ||
      typeof pauseState.resumeData !== 'string' ||
      pauseState.resumeData.length === 0 ||
      pauseState.url !== update.apkUrl ||
      pauseState.fileUri !== temporaryFile.uri ||
      !temporaryFile.exists ||
      !isBinaryDownloadProgress(candidate.progress)
    ) {
      return null;
    }
    return candidate as PersistedBinaryDownload;
  } catch {
    return null;
  }
}

function persistBinaryDownload(
  update: BinaryUpdate,
  pauseState: DownloadPauseState,
  progress: BinaryDownloadProgress,
): void {
  if (!downloadStorage || !pauseState.resumeData) return;
  const state: PersistedBinaryDownload = {
    schemaVersion: 1,
    updateKey: getBinaryUpdateKey(update),
    pauseState,
    progress,
  };
  downloadStorage.set(BINARY_DOWNLOAD_STATE_KEY, JSON.stringify(state));
}

function persistInterruptedBinaryDownload(
  update: BinaryUpdate,
  temporaryFile: File,
  progress: BinaryDownloadProgress,
): BinaryDownloadProgress | null {
  const bytesWritten = temporaryFile.exists ? (temporaryFile.size ?? 0) : 0;
  if (bytesWritten <= 0) return null;

  const totalBytes = Math.max(progress.totalBytes, bytesWritten);
  const recoveredProgress = {
    bytesWritten,
    totalBytes,
    percent: totalBytes > 0 ? Math.min(100, Math.round((bytesWritten / totalBytes) * 100)) : 0,
  };

  persistBinaryDownload(
    update,
    {
      url: update.apkUrl,
      fileUri: temporaryFile.uri,
      isDirectory: false,
      resumeData: String(bytesWritten),
    },
    recoveredProgress,
  );
  return recoveredProgress;
}

function clearPersistedBinaryDownload(): void {
  downloadStorage?.remove(BINARY_DOWNLOAD_STATE_KEY);
}

function cleanupBinaryUpdateDirectory(directory: Directory, suffix: string, protectedUris: Set<string>): void {
  try {
    for (const entry of directory.list()) {
      if (!(entry instanceof File) || !entry.name.endsWith(suffix) || protectedUris.has(entry.uri)) continue;

      try {
        entry.delete();
      } catch (error) {
        console.warn('Failed to remove obsolete binary update file:', entry.uri, error);
      }
    }
  } catch (error) {
    console.warn('Failed to inspect binary update directory:', directory.uri, error);
  }
}

/**
 * Removes APK artifacts that no longer belong to the current update.
 *
 * Cleanup only runs after a manifest has been fetched successfully. The active
 * task is protected as well, so a manual update check cannot delete a file that
 * is still being written.
 */
function cleanupObsoleteBinaryUpdateFiles(currentUpdate: BinaryUpdate | null): void {
  const protectedUpdates = [currentUpdate, activeBinaryDownload?.update].filter(
    (update): update is BinaryUpdate => update !== null && update !== undefined,
  );
  const protectedUris = new Set<string>();
  const protectedUpdateKeys = new Set<string>();

  for (const update of protectedUpdates) {
    protectedUris.add(getBinaryUpdateFile(update).uri);
    protectedUris.add(getBinaryUpdateTemporaryFile(update).uri);
    protectedUpdateKeys.add(getBinaryUpdateKey(update));
  }

  cleanupBinaryUpdateDirectory(Paths.document, BINARY_TEMPORARY_FILE_SUFFIX, protectedUris);
  // Older app versions stored partial APKs in the cache directory.
  cleanupBinaryUpdateDirectory(Paths.cache, BINARY_TEMPORARY_FILE_SUFFIX, protectedUris);
  cleanupBinaryUpdateDirectory(Paths.cache, BINARY_READY_FILE_SUFFIX, protectedUris);

  const raw = downloadStorage?.getString(BINARY_DOWNLOAD_STATE_KEY);
  if (!raw) return;

  try {
    const persisted = JSON.parse(raw) as Partial<PersistedBinaryDownload>;
    if (typeof persisted.updateKey === 'string' && protectedUpdateKeys.has(persisted.updateKey)) return;
  } catch {
    // Invalid state is cleared below together with stale state.
  }

  clearPersistedBinaryDownload();
}

export function getResumableBinaryDownloadProgress(update: BinaryUpdate): BinaryDownloadProgress | null {
  return readPersistedBinaryDownload(update)?.progress ?? null;
}

export function isBinaryUpdateDownloaded(update: BinaryUpdate): boolean {
  if (Platform.OS !== 'android') return false;
  const file = getBinaryUpdateFile(update);
  return file.exists && (file.size ?? 0) > 0;
}

async function openBinaryUpdateFile(file: File): Promise<void> {
  const contentUri = await FileSystemLegacy.getContentUriAsync(file.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1 | 2,
  });
}

async function waitForAppForeground(): Promise<void> {
  if (AppState.currentState === 'active') return;

  await new Promise<void>((resolve) => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      subscription.remove();
      resolve();
    });
  });
}

export async function openBinaryUpdateInBrowser(update: BinaryUpdate): Promise<void> {
  await Linking.openURL(update.apkUrl);
}

export async function checkBinaryUpdate(): Promise<BinaryUpdate | null> {
  if (Platform.OS !== 'android' || !areAppUpdatesEnabled()) return null;

  const manifestUrl = `${getManifestUrl()}${getManifestUrl().includes('?') ? '&' : '?'}t=${Date.now()}`;
  const response = await fetch(manifestUrl, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) throw new Error(`Binary update manifest request failed: ${response.status}`);

  const manifest: unknown = await response.json();
  if (!isBinaryUpdate(manifest)) return null;

  const update = isNewerBinaryUpdate(manifest) ? manifest : null;
  cleanupObsoleteBinaryUpdateFiles(update);
  if (!update) return null;
  return update;
}

export async function downloadAndInstallBinaryUpdate(
  update: BinaryUpdate,
  onProgress?: (progress: BinaryDownloadProgress) => void,
): Promise<BinaryDownloadResult> {
  if (Platform.OS !== 'android') {
    await Linking.openURL(update.releaseUrl ?? update.apkUrl);
    return 'completed';
  }

  cleanupObsoleteBinaryUpdateFiles(update);
  const destination = getBinaryUpdateFile(update);
  if (isBinaryUpdateDownloaded(update)) {
    const totalBytes = destination.size ?? 0;
    onProgress?.({ bytesWritten: totalBytes, totalBytes, percent: 100 });
    await waitForAppForeground();
    await openBinaryUpdateFile(destination);
    return 'completed';
  }

  const temporaryFile = getBinaryUpdateTemporaryFile(update);
  const persisted = readPersistedBinaryDownload(update);
  let currentProgress = persisted?.progress ?? { bytesWritten: 0, totalBytes: 0, percent: 0 };
  const options: DownloadTaskOptions = {
    onProgress: ({ bytesWritten, totalBytes }) => {
      currentProgress = {
        bytesWritten,
        totalBytes,
        percent: totalBytes > 0 ? Math.min(100, Math.round((bytesWritten / totalBytes) * 100)) : 0,
      };
      if (activeBinaryDownload) activeBinaryDownload.progress = currentProgress;
      onProgress?.(currentProgress);
    },
  };

  let task: DownloadTask;
  if (persisted) {
    try {
      task = DownloadTask.fromSavable(persisted.pauseState, options);
      onProgress?.(persisted.progress);
    } catch (error) {
      console.warn('Failed to restore binary update download, restarting it:', error);
      clearPersistedBinaryDownload();
      if (temporaryFile.exists) temporaryFile.delete();
      currentProgress = { bytesWritten: 0, totalBytes: 0, percent: 0 };
      onProgress?.(currentProgress);
      task = File.createDownloadTask(update.apkUrl, temporaryFile, options);
    }
  } else {
    clearPersistedBinaryDownload();
    if (temporaryFile.exists) temporaryFile.delete();
    onProgress?.(currentProgress);
    task = File.createDownloadTask(update.apkUrl, temporaryFile, options);
  }

  const download = { task, update, progress: currentProgress, cancelled: false };
  activeBinaryDownload = download;

  try {
    const downloadedFile = task.state === 'paused' ? await task.resumeAsync() : await task.downloadAsync();
    if (!downloadedFile) {
      if (task.state === 'paused') {
        persistBinaryDownload(update, task.savable(), activeBinaryDownload?.progress ?? currentProgress);
        return 'paused';
      }
      throw new Error('APK download did not produce a file');
    }
    if (!downloadedFile.exists || (downloadedFile.size ?? 0) <= 0) {
      throw new Error('Downloaded APK is empty');
    }
    clearPersistedBinaryDownload();
    await downloadedFile.move(destination, { overwrite: true });
    await waitForAppForeground();
    await openBinaryUpdateFile(destination);
    return 'completed';
  } catch (error) {
    if (download.cancelled) return 'cancelled';
    const recoveredProgress = persistInterruptedBinaryDownload(update, temporaryFile, download.progress);
    if (recoveredProgress) onProgress?.(recoveredProgress);
    throw error;
  } finally {
    if (activeBinaryDownload?.task === task) activeBinaryDownload = null;
    task.release();
    if (download.cancelled && temporaryFile.exists) {
      try {
        temporaryFile.delete();
      } catch (error) {
        console.warn('Failed to remove cancelled binary update download:', error);
      }
    }
  }
}

export function cancelBinaryUpdateDownload(): boolean {
  const activeDownload = activeBinaryDownload;
  if (!activeDownload || activeDownload.task.state !== 'active') return false;

  activeDownload.cancelled = true;
  clearPersistedBinaryDownload();
  activeDownload.task.cancel();
  return true;
}

export async function pauseBinaryUpdateDownload(): Promise<boolean> {
  const activeDownload = activeBinaryDownload;
  if (!activeDownload || activeDownload.task.state !== 'active') return false;

  await activeDownload.task.pauseAsync();
  if ((activeDownload.task.state as DownloadTask['state']) !== 'paused') return false;

  persistBinaryDownload(activeDownload.update, activeDownload.task.savable(), activeDownload.progress);
  return true;
}
