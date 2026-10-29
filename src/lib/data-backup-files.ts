import {
  BackupError,
  createDataBackupContent,
  getBackupFileName,
  MAX_BACKUP_FILE_BYTES,
  parseDataBackup,
  type BackupContents,
  type DataBackup,
} from '@/lib/data-backup';
import i18n from '@/i18n';
import * as DocumentPicker from 'expo-document-picker';
import { File, FileMode, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import {
  createPilgrimageBackupArchive,
  getBackupPhotos,
  MAX_BACKUP_ARCHIVE_BYTES,
  readPilgrimageBackupArchive,
  type BackupProgressHandler,
  type PreparedBackupArchive,
} from '@/lib/pilgrimage-backup-archive';
import { withPilgrimageRecordsLock } from '@/services/pilgrimage-records';
import { usePilgrimageRecords } from '@/store/use-pilgrimage-records';

export async function exportDataBackup(
  data: BackupContents,
  appVersion: string,
  onProgress?: BackupProgressHandler,
): Promise<void> {
  const date = new Date();
  const content = createDataBackupContent(data, appVersion, date);
  const archive = data.pilgrimageRecords !== undefined;
  if (archive && usePilgrimageRecords.getState().loadError) throw new BackupError('recordsUnavailable');
  const name = getBackupFileName(date, archive);
  if (Platform.OS === 'web') {
    if (archive) throw new BackupError('nativeOnly');
    const uri = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = uri;
    anchor.download = name;
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      // Allow the browser to start reading the download before revoking its URL.
      setTimeout(() => URL.revokeObjectURL(uri), 1000);
    }
    return;
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(i18n.t('systemSharingIsNotSupportedOnThisDevice'));
  }
  const file = new File(Paths.cache, name);
  try {
    if (archive) {
      await withPilgrimageRecordsLock(() => createPilgrimageBackupArchive(data, content, file, onProgress));
    } else {
      file.create({ overwrite: true });
      file.writeSync(content);
    }
    await Sharing.shareAsync(file.uri, {
      dialogTitle: i18n.t('exportDataBackup'),
      mimeType: archive ? 'application/zip' : 'application/json',
      UTI: archive ? 'public.zip-archive' : 'public.json',
    });
  } catch (error) {
    try {
      if (file.exists) file.delete();
    } catch {
      // Preserve the original export error if cleanup fails.
    }
    throw error;
  }
  // Keep the cache file after sharing: the receiving app may read it later.
  // The OS can reclaim cache files without affecting a saved backup.
}

export type PickedDataBackup = { name: string; backup: DataBackup; archive?: PreparedBackupArchive };

export async function pickDataBackup(onProgress?: BackupProgressHandler): Promise<PickedDataBackup | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const file = Platform.OS === 'web' ? null : new File(asset.uri);
  try {
    const size = file?.size ?? asset.size;
    if (typeof size === 'number' && size > MAX_BACKUP_ARCHIVE_BYTES) throw new BackupError('tooLarge');
    if (file) {
      const handle = file.open(FileMode.ReadOnly);
      let zip = false;
      try {
        const prefix = await handle.readBytes(4);
        zip = prefix[0] === 0x50 && prefix[1] === 0x4b;
      } finally {
        handle.close();
      }
      if (zip) return { name: asset.name, ...(await readPilgrimageBackupArchive(file, onProgress)) };
    }
    if (typeof size === 'number' && size > MAX_BACKUP_FILE_BYTES) throw new BackupError('tooLarge');
    const content = asset.file ? await asset.file.text() : await file!.text();
    const backup = parseDataBackup(content);
    // JSON cannot carry photo bytes. Never silently import broken references.
    if (getBackupPhotos(backup.data).length) throw new BackupError('invalid');
    return { name: asset.name, backup };
  } finally {
    // Only delete the app-owned picker copy, never the user's original file.
    if (file && file.uri.startsWith(Paths.cache.uri)) {
      try {
        file.delete();
      } catch {
        // Cache cleanup must not hide the import result.
      }
    }
  }
}
