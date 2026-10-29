import { Directory, File, Paths } from 'expo-file-system';
import { isPilgrimagePhotoFileName, type PilgrimagePhoto } from '@/lib/pilgrimage-records';

/** The record metadata is already deleted; this reports only remaining app-owned files. */
export class PilgrimagePhotoCleanupError extends Error {
  readonly errors: unknown[];

  constructor(errors: unknown[]) {
    super('Records were deleted, but some app-owned photo files could not be removed');
    this.name = 'PilgrimagePhotoCleanupError';
    this.errors = errors;
  }
}

export function getPilgrimagePhotoDirectory(): Directory {
  return new Directory(Paths.document, 'pilgrimage-records', 'images');
}

export function getPilgrimagePhotoFile(fileName: string): File {
  if (!isPilgrimagePhotoFileName(fileName)) throw new Error('Invalid pilgrimage photo file name');
  return new File(getPilgrimagePhotoDirectory(), fileName);
}

export function getPilgrimagePhotoUri(photo: PilgrimagePhoto): string {
  return getPilgrimagePhotoFile(photo.fileName).uri;
}

/** File names are validated before resolving paths or deleting any app-owned file. */
export function deletePilgrimagePhotoFiles(photos: readonly Pick<PilgrimagePhoto, 'fileName'>[]): void {
  const files = photos.map((photo) => getPilgrimagePhotoFile(photo.fileName));
  const errors: unknown[] = [];
  for (const file of files) {
    try {
      if (file.exists) file.delete();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new PilgrimagePhotoCleanupError(errors);
}
