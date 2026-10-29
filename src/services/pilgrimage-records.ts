import { File } from 'expo-file-system';
import {
  deletePilgrimagePhotoFiles,
  getPilgrimagePhotoDirectory,
  getPilgrimagePhotoFile,
} from '@/lib/pilgrimage-record-files';
import {
  getPilgrimageRecordsLoadError,
  PilgrimageRecordsRollbackError,
  setPilgrimageRecords,
} from '@/lib/pilgrimage-record-storage';
import {
  upsertPilgrimageDay,
  type PilgrimagePhoto,
  type PilgrimagePoint,
  type PilgrimagePointInput,
} from '@/lib/pilgrimage-records';
import { usePilgrimageRecords } from '@/store/use-pilgrimage-records';

let pending: Promise<unknown> = Promise.resolve();

export type PilgrimageDeleteSelection = {
  dateKeys: readonly string[];
  photoIds: readonly string[];
};

/** All record/file writes, including backup restoration, share this queue. */
export function withPilgrimageRecordsLock<T>(operation: () => Promise<T> | T): Promise<T> {
  const next = pending.then(operation);
  pending = next.catch(() => undefined);
  return next;
}

function commit(points: PilgrimagePoint[]) {
  try {
    setPilgrimageRecords(points, usePilgrimageRecords.getState().points);
  } catch (error) {
    const loadError = getPilgrimageRecordsLoadError();
    if (loadError) usePilgrimageRecords.setState({ loadError });
    throw error;
  }
  usePilgrimageRecords.setState({ points });
}

export function recordPilgrimageVisit(input: PilgrimagePointInput, at = Date.now()): Promise<void> {
  return withPilgrimageRecordsLock(() => {
    const points = usePilgrimageRecords.getState().points;
    const next = upsertPilgrimageDay(points, input, at);
    if (next !== points) commit(next);
  });
}

function createPhotoId() {
  return `photo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Call only after saving the completed export to the system photo library succeeded. */
export function savePilgrimagePhoto(
  input: PilgrimagePointInput,
  sourceUri: string,
  width: number,
  height: number,
  at = Date.now(),
): Promise<void> {
  return withPilgrimageRecordsLock(async () => {
    const source = new File(sourceUri);
    const extension = source.extension.toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) throw new Error('Unsupported pilgrimage photo format');
    const points = usePilgrimageRecords.getState().points;
    let id: string;
    let file: File;
    do {
      id = createPhotoId();
      file = getPilgrimagePhotoFile(`${id}${extension}`);
    } while (
      file.exists ||
      points.some((point) => point.days.some((day) => day.photos.some((photo) => photo.id === id)))
    );
    const photo: PilgrimagePhoto = { id, fileName: file.name, width, height };
    const next = upsertPilgrimageDay(points, input, at, photo);
    getPilgrimagePhotoDirectory().create({ intermediates: true, idempotent: true });
    try {
      await source.copy(file);
      if (!file.exists || file.size <= 0) throw new Error('Pilgrimage photo copy is empty');
      commit(next);
    } catch (error) {
      // A failed rollback leaves metadata uncertain. Keep its possible referenced image.
      if (error instanceof PilgrimageRecordsRollbackError) throw error;
      try {
        if (file.exists) file.delete();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Pilgrimage photo save and cleanup failed');
      }
      throw error;
    }
  });
}

export function deletePilgrimageSelection(pointKey: string, selection: PilgrimageDeleteSelection): Promise<void> {
  return withPilgrimageRecordsLock(() => {
    const points = usePilgrimageRecords.getState().points;
    const point = points.find((entry) => entry.key === pointKey);
    if (!point) return;
    const dateKeys = new Set(selection.dateKeys);
    const photoIds = new Set(selection.photoIds);
    const removedPhotos: PilgrimagePhoto[] = [];
    let changed = false;
    const days = point.days.flatMap((day) => {
      if (dateKeys.has(day.dateKey)) {
        changed = true;
        removedPhotos.push(...day.photos);
        return [];
      }
      const photos = day.photos.filter((photo) => {
        if (!photoIds.has(photo.id)) return true;
        removedPhotos.push(photo);
        return false;
      });
      if (photos.length === day.photos.length) return [day];
      changed = true;
      return [{ ...day, photos }];
    });
    if (!changed) return;
    commit(points.flatMap((entry) => (entry !== point ? [entry] : days.length ? [{ ...point, days }] : [])));
    deletePilgrimagePhotoFiles(removedPhotos);
  });
}

export function deletePilgrimageDay(key: string, dateKey: string): Promise<void> {
  return deletePilgrimageSelection(key, { dateKeys: [dateKey], photoIds: [] });
}

export function deletePilgrimagePhoto(pointKey: string, photoId: string): Promise<void> {
  return deletePilgrimageSelection(pointKey, { dateKeys: [], photoIds: [photoId] });
}

export function deletePilgrimagePoint(key: string): Promise<void> {
  return withPilgrimageRecordsLock(() => {
    const points = usePilgrimageRecords.getState().points;
    const point = points.find((entry) => entry.key === key);
    if (!point) return;
    commit(points.filter((entry) => entry.key !== key));
    deletePilgrimagePhotoFiles(point.days.flatMap((day) => day.photos));
  });
}
