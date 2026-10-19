import {
  BackupError,
  createDataBackupContent,
  getBackupFileName,
  MAX_BACKUP_FILE_BYTES,
  parseDataBackup,
  type BackupData,
  type DataBackup,
} from '@/lib/data-backup';
import i18n from '@/i18n';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function exportDataBackup(data: BackupData, appVersion: string): Promise<void> {
  const date = new Date();
  const content = createDataBackupContent(data, appVersion, date);
  const name = getBackupFileName(date);
  if (Platform.OS === 'web') {
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
    file.create({ overwrite: true });
    file.writeSync(content);
    await Sharing.shareAsync(file.uri, {
      dialogTitle: i18n.t('exportDataBackup'),
      mimeType: 'application/json',
      UTI: 'public.json',
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

export async function pickDataBackup(): Promise<{ name: string; backup: DataBackup } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const file = Platform.OS === 'web' ? null : new File(asset.uri);
  try {
    const size = asset.size ?? file?.size;
    if (typeof size === 'number' && size > MAX_BACKUP_FILE_BYTES) throw new BackupError('tooLarge');
    const content = asset.file ? await asset.file.text() : await file!.text();
    return { name: asset.name, backup: parseDataBackup(content) };
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
