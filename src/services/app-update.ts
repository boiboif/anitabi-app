import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

export type BinaryUpdate = {
  version: string;
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

function isBinaryUpdate(value: unknown): value is BinaryUpdate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BinaryUpdate>;
  return (
    typeof candidate.version === 'string' &&
    typeof candidate.apkUrl === 'string' &&
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
  if (typeof update.buildNumber === 'number') return update.buildNumber > currentBuildNumber;
  return isNewerVersion(update.version, currentVersion);
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

export async function checkBinaryUpdate(): Promise<BinaryUpdate | null> {
  if (Platform.OS !== 'android') return null;

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

  const fileName = update.fileName ?? `anitabi-${update.version}.apk`;
  const destination = new File(Paths.cache, fileName);
  if (destination.exists) destination.delete();

  const task = File.createDownloadTask(update.apkUrl, destination, {
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
    const contentUri = await FileSystemLegacy.getContentUriAsync(downloadedFile.uri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type: 'application/vnd.android.package-archive',
      flags: 1 | 2,
    });
  } finally {
    task.release();
  }
}
