import {
  BackupError,
  MAX_BACKUP_FILE_BYTES,
  parseDataBackup,
  type BackupContents,
  type DataBackup,
} from '@/lib/data-backup';
import { getPilgrimagePhotoFile } from '@/lib/pilgrimage-record-files';
import { isBackupPhotoFileNameV3 } from '@/lib/data-backup-codec';
import { Directory, File, FileMode, Paths, type FileHandle } from 'expo-file-system';
import { strFromU8, strToU8, Unzip, Zip, ZipPassThrough } from 'fflate';

export const MAX_BACKUP_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_BACKUP_PHOTO_BYTES = 128 * 1024 * 1024;
export const MAX_BACKUP_ARCHIVE_ENTRIES = 10000;
const CHUNK_BYTES = 256 * 1024;
const MAX_DIRECTORY_BYTES = 4 * 1024 * 1024;

export type BackupProgress = { phase: 'export' | 'read' | 'restore'; completed: number; total: number };
export type BackupProgressHandler = (progress: BackupProgress) => void;
export type PreparedBackupArchive = { photos: Map<string, File>; cleanup: () => void };
type ZipEntry = {
  name: string;
  crc: number;
  size: number;
  compressedSize: number;
  offset: number;
  compression: number;
};

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

export function updateBackupCrc(crc: number, bytes: Uint8Array): number {
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return crc >>> 0;
}

function validEntryName(name: string) {
  return name === 'data.json' || (name.startsWith('images/') && isBackupPhotoFileNameV3(name.slice(7)));
}

// Validate the central directory before allocating extraction files. ZIP64,
// encryption, links, nested paths and unexpected files are outside our format.
export function parseBackupZipDirectory(bytes: Uint8Array, count: number, dataEnd: number): ZipEntry[] {
  if (!count || count > MAX_BACKUP_ARCHIVE_ENTRIES || bytes.byteLength > MAX_DIRECTORY_BYTES)
    throw new BackupError('tooLarge');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let at = 0;
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new BackupError('invalid');
    const flags = view.getUint16(at + 8, true);
    const compression = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const disk = view.getUint16(at + 34, true);
    const attrs = view.getUint32(at + 38, true);
    const offset = view.getUint32(at + 42, true);
    const end = at + 46 + nameLength + extraLength + commentLength;
    if (
      end > bytes.length ||
      flags & 1 ||
      disk ||
      compression !== 0 ||
      compressedSize !== size ||
      ((attrs >>> 16) & 0xf000) === 0xa000
    )
      throw new BackupError('invalid');
    const name = strFromU8(bytes.subarray(at + 46, at + 46 + nameLength));
    if (!validEntryName(name) || names.has(name) || offset + 30 + nameLength + compressedSize > dataEnd)
      throw new BackupError('invalid');
    if (size > (name === 'data.json' ? MAX_BACKUP_FILE_BYTES : MAX_BACKUP_PHOTO_BYTES))
      throw new BackupError('tooLarge');
    total += size;
    if (total > MAX_BACKUP_ARCHIVE_BYTES) throw new BackupError('tooLarge');
    if (name !== 'data.json' && !size) throw new BackupError('invalid');
    names.add(name);
    entries.push({ name, crc, size, compressedSize, offset, compression });
    at = end;
  }
  if (at !== bytes.length || !names.has('data.json')) throw new BackupError('invalid');
  return entries;
}

async function readExact(handle: FileHandle, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = await handle.readBytes(length);
  if (bytes.byteLength !== length) throw new BackupError('invalid');
  return bytes;
}

async function readZipDirectory(file: File): Promise<ZipEntry[]> {
  if (!file.size || file.size > MAX_BACKUP_ARCHIVE_BYTES) throw new BackupError('tooLarge');
  const handle = file.open(FileMode.ReadOnly);
  try {
    const tailSize = Math.min(file.size, 65557);
    handle.offset = file.size - tailSize;
    const tail = await readExact(handle, tailSize);
    const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    let end = tail.length - 22;
    while (
      end >= 0 &&
      (view.getUint32(end, true) !== 0x06054b50 || end + 22 + view.getUint16(end + 20, true) !== tail.length)
    )
      end--;
    if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new BackupError('invalid');
    const count = view.getUint16(end + 10, true);
    const directorySize = view.getUint32(end + 12, true);
    const directoryOffset = view.getUint32(end + 16, true);
    if (count !== view.getUint16(end + 8, true) || directoryOffset + directorySize !== file.size - tailSize + end)
      throw new BackupError('invalid');
    if (directorySize > MAX_DIRECTORY_BYTES) throw new BackupError('tooLarge');
    handle.offset = directoryOffset;
    return parseBackupZipDirectory(await readExact(handle, directorySize), count, directoryOffset);
  } finally {
    handle.close();
  }
}

type PhotoReferences<Photo> = {
  pilgrimageRecords?: readonly { days: readonly { photos: readonly Photo[] }[] }[];
};

// These readers accept only the fields they consume, on either side of the codec.
export function getBackupPhotos<Photo>(data: PhotoReferences<Photo>): Photo[] {
  return (data.pilgrimageRecords ?? []).flatMap((point) => point.days.flatMap((day) => day.photos));
}

export function getBackupPhotoBytes(data: PhotoReferences<{ fileName: string }>): number {
  return getBackupPhotos(data).reduce((size, photo) => size + (getPilgrimagePhotoFile(photo.fileName).size ?? 0), 0);
}

export async function createPilgrimageBackupArchive(
  data: BackupContents,
  metadata: string,
  output: File,
  onProgress?: BackupProgressHandler,
): Promise<void> {
  const photos = getBackupPhotos(data);
  if (photos.length + 1 > MAX_BACKUP_ARCHIVE_ENTRIES) throw new BackupError('tooLarge');
  let totalSize = strToU8(metadata).byteLength;
  for (const photo of photos) {
    const file = getPilgrimagePhotoFile(photo.fileName);
    if (!file.exists || !file.size) throw new BackupError('invalid');
    if (file.size > MAX_BACKUP_PHOTO_BYTES) throw new BackupError('tooLarge');
    totalSize += file.size;
  }
  if (totalSize > MAX_BACKUP_ARCHIVE_BYTES) throw new BackupError('tooLarge');
  output.create({ overwrite: false });
  const handle = output.open(FileMode.WriteOnly);
  let failure: unknown;
  let ended = false;
  const zip = new Zip((error, bytes, final) => {
    if (error) {
      failure = error;
      return;
    }
    try {
      if ((handle.offset ?? 0) + bytes.byteLength > MAX_BACKUP_ARCHIVE_BYTES) throw new BackupError('tooLarge');
      handle.writeBytesSync(bytes);
      if (final) ended = true;
    } catch (error) {
      failure = error;
    }
  });
  try {
    const json = new ZipPassThrough('data.json');
    zip.add(json);
    json.push(strToU8(metadata), true);
    onProgress?.({ phase: 'export', completed: 0, total: photos.length });
    for (const [index, photo] of photos.entries()) {
      if (failure) throw failure;
      const source = getPilgrimagePhotoFile(photo.fileName);
      const sourceHandle = source.open(FileMode.ReadOnly);
      const entry = new ZipPassThrough(`images/${photo.fileName}`);
      zip.add(entry);
      try {
        let remaining = source.size;
        while (remaining > 0) {
          const chunk = await readExact(sourceHandle, Math.min(remaining, CHUNK_BYTES));
          remaining -= chunk.length;
          entry.push(chunk, remaining === 0);
          if (failure) throw failure;
        }
      } finally {
        sourceHandle.close();
      }
      onProgress?.({ phase: 'export', completed: index + 1, total: photos.length });
    }
    zip.end();
    if (failure) throw failure;
    if (!ended) throw new BackupError('invalid');
  } catch (error) {
    zip.terminate();
    throw error;
  } finally {
    handle.close();
  }
}

export async function readPilgrimageBackupArchive(
  file: File,
  onProgress?: BackupProgressHandler,
): Promise<{ backup: DataBackup; archive: PreparedBackupArchive }> {
  const entries = await readZipDirectory(file);
  const expected = new Map(entries.map((entry) => [entry.name, entry]));
  const directory = new Directory(
    Paths.cache,
    `pilgrimage-backup-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  directory.create();
  const cleanup = () => {
    try {
      if (directory.exists) directory.delete();
    } catch {
      /* Cache cleanup must not hide the operation result. */
    }
  };
  const photos = new Map<string, File>();
  const seen = new Set<string>();
  const completed = new Set<string>();
  const handles = new Set<FileHandle>();
  const active = new Set<() => void>();
  let failure: unknown;
  let expandedBytes = 0;
  const unzip = new Unzip((entry) => {
    if (failure) return;
    const metadata = expected.get(entry.name);
    if (!metadata || seen.has(entry.name) || entry.compression !== metadata.compression) {
      failure = new BackupError('invalid');
      return;
    }
    seen.add(entry.name);
    const name = entry.name === 'data.json' ? 'data.json' : entry.name.slice(7);
    const output = new File(directory, name);
    output.create();
    const handle = output.open(FileMode.WriteOnly);
    handles.add(handle);
    active.add(entry.terminate);
    let size = 0;
    let crc = 0xffffffff;
    entry.ondata = (error, chunk, final) => {
      if (failure) return;
      if (error) {
        failure = error;
        return;
      }
      try {
        size += chunk.byteLength;
        expandedBytes += chunk.byteLength;
        if (size > metadata.size || expandedBytes > MAX_BACKUP_ARCHIVE_BYTES) throw new BackupError('tooLarge');
        crc = updateBackupCrc(crc, chunk);
        handle.writeBytesSync(chunk);
        if (final) {
          if (size !== metadata.size || (crc ^ 0xffffffff) >>> 0 !== metadata.crc) throw new BackupError('invalid');
          handle.close();
          handles.delete(handle);
          active.delete(entry.terminate);
          completed.add(entry.name);
          if (entry.name !== 'data.json') photos.set(name, output);
          onProgress?.({ phase: 'read', completed: completed.size, total: entries.length });
        }
      } catch (error) {
        failure = error;
      }
    };
    entry.start();
  });
  const sourceHandle = file.open(FileMode.ReadOnly);
  try {
    let remaining = file.size;
    while (remaining > 0) {
      const chunk = await readExact(sourceHandle, Math.min(remaining, CHUNK_BYTES));
      remaining -= chunk.length;
      unzip.push(chunk, remaining === 0);
      if (failure) throw failure;
    }
    if (completed.size !== entries.length) throw new BackupError('invalid');
    const backup = parseDataBackup(await new File(directory, 'data.json').text());
    if (backup.data.pilgrimageRecords === undefined) throw new BackupError('invalid');
    const declaredPhotos = getBackupPhotos(backup.data);
    if (declaredPhotos.length !== photos.size || declaredPhotos.some((photo) => !photos.has(photo.fileName)))
      throw new BackupError('invalid');
    return { backup, archive: { photos, cleanup } };
  } catch (error) {
    for (const terminate of active) terminate();
    for (const handle of handles) {
      try {
        handle.close();
      } catch {
        /* Preserve parse error. */
      }
    }
    cleanup();
    throw error instanceof BackupError ? error : new BackupError('invalid');
  } finally {
    sourceHandle.close();
  }
}
