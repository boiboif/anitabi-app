import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

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

const DEFAULT_MANIFEST_URL =
  'https://raw.githubusercontent.com/boiboif/anitabi-app/main/docs/releases/latest.json';

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
  if (configuredVersion?.includes('-')) return configuredVersion;
  if (!__DEV__ && Application.nativeApplicationVersion) return Application.nativeApplicationVersion;
  return configuredVersion ?? Application.nativeApplicationVersion ?? '未知';
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
      typeof update.minSupportedBuildNumber === 'number' &&
        currentBuildNumber < update.minSupportedBuildNumber,
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

export async function checkBinaryUpdate(): Promise<BinaryUpdate | null> {
  if (Platform.OS !== 'android' || !areAppUpdatesEnabled()) return null;

  const manifestUrl = `${getManifestUrl()}${getManifestUrl().includes('?') ? '&' : '?'}t=${Date.now()}`;
  const response = await fetch(manifestUrl, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) throw new Error(`Binary update manifest request failed: ${response.status}`);

  const manifest: unknown = await response.json();
  if (!isBinaryUpdate(manifest) || !isNewerBinaryUpdate(manifest)) return null;
  return manifest;
}

export async function downloadAndInstallBinaryUpdate(
  update: BinaryUpdate,
  onProgress?: (progress: BinaryDownloadProgress) => void,
): Promise<void> {
  if (Platform.OS !== 'android') {
    await Linking.openURL(update.releaseUrl ?? update.apkUrl);
    return;
  }

  const destination = getBinaryUpdateFile(update);
  if (isBinaryUpdateDownloaded(update)) {
    const totalBytes = destination.size ?? 0;
    onProgress?.({ bytesWritten: totalBytes, totalBytes, percent: 100 });
    await openBinaryUpdateFile(destination);
    return;
  }

  const temporaryFile = new File(Paths.cache, `${destination.name}.download`);
  if (temporaryFile.exists) temporaryFile.delete();

  const task = File.createDownloadTask(update.apkUrl, temporaryFile, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      onProgress?.({
        bytesWritten,
        totalBytes,
        percent: totalBytes > 0 ? Math.min(100, Math.round((bytesWritten / totalBytes) * 100)) : 0,
      });
    },
  });

  try {
    const downloadedFile = await task.downloadAsync();
    if (!downloadedFile) throw new Error('APK download did not produce a file');
    if (!downloadedFile.exists || (downloadedFile.size ?? 0) <= 0) {
      throw new Error('Downloaded APK is empty');
    }
    await downloadedFile.move(destination, { overwrite: true });
    await openBinaryUpdateFile(destination);
  } finally {
    task.release();
  }
}
