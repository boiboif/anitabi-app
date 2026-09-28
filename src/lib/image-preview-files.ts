import { getImageFileFormat } from '@/utils/image-file-format';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { Image } from 'expo-image';

export class PreviewImageFileError extends Error {
  constructor(public reason: 'download' | 'format') {
    super(reason);
  }
}

export function deletePreviewFile(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup must not turn a successful save/share into an error.
  }
}

export async function preparePreviewImage(uri: string, signal: AbortSignal) {
  const checkCancelled = () => {
    if (signal.aborted) throw new Error('Image operation cancelled');
  };
  checkCancelled();
  const directory = new Directory(Paths.cache, 'image-preview-actions');
  directory.create({ idempotent: true, intermediates: true });
  // Android's share promise may resolve before the receiving app reads the file.
  // Keep shared copies for a day; never remove the expo-image cache or the source.
  for (const entry of directory.list()) {
    // A copied cache file can retain the source's old modification timestamp.
    const createdAt = Number(/^image-(\d+)-/.exec(entry.name)?.[1]);
    if (entry instanceof File && createdAt && createdAt < Date.now() - 86_400_000) deletePreviewFile(entry);
  }
  const file = new File(directory, `image-${Date.now()}-${Math.random().toString(36).slice(2)}.download`);
  try {
    checkCancelled();
    if (/^https?:\/\//i.test(uri)) {
      const cached = await Image.getCachePathAsync(uri).catch(() => null);
      checkCancelled();
      const cachedFile = cached ? new File(cached.startsWith('/') ? `file://${cached}` : cached) : null;
      if (cachedFile?.exists) await cachedFile.copy(file);
      else {
        try {
          await File.downloadFileAsync(uri, file, { signal });
        } catch (error) {
          if (signal.aborted) throw error;
          throw new PreviewImageFileError('download');
        }
      }
    } else {
      await new File(uri).copy(file);
    }
    checkCancelled();
    const handle = file.open(FileMode.ReadOnly);
    const format = (() => {
      try {
        return getImageFileFormat(handle.readBytes(Math.min(file.size, 32)));
      } finally {
        handle.close();
      }
    })();
    if (!format) throw new PreviewImageFileError('format');
    file.rename(file.name.replace(/\.download$/, `.${format.extension}`));
    return { file, ...format };
  } catch (error) {
    deletePreviewFile(file);
    throw error;
  }
}
