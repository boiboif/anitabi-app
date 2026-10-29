import {
  prepareBackupRestore,
  runBackupWrites,
  BackupError,
  type BackupContents,
  type BackupData,
  type BackupRestoreMode,
} from '@/lib/data-backup';
import { createFavoritePointsRestoreWrite } from '@/lib/favorite-storage';
import { createPlansRestoreWrites } from '@/lib/plan-storage';
import { useFavoritePoints } from '@/store/use-favorite-points';
import { usePlans } from '@/store/use-plans';
import { usePilgrimageRecords } from '@/store/use-pilgrimage-records';
import { createPilgrimageRecordsRestoreWrite } from '@/lib/pilgrimage-record-storage';
import {
  deletePilgrimagePhotoFiles,
  getPilgrimagePhotoDirectory,
  getPilgrimagePhotoFile,
} from '@/lib/pilgrimage-record-files';
import { withPilgrimageRecordsLock } from '@/services/pilgrimage-records';
import {
  getBackupPhotos,
  type BackupProgressHandler,
  type PreparedBackupArchive,
} from '@/lib/pilgrimage-backup-archive';
import type { BackupPilgrimagePhotoV3 } from '@/lib/data-backup-schema';

export function getCurrentBackupData(): BackupData {
  const { plans, planListSortOrder } = usePlans.getState();
  return {
    favoritePoints: useFavoritePoints.getState().favoritePoints,
    plans,
    planListSortOrder,
    pilgrimageRecords: usePilgrimageRecords.getState().points,
  };
}

export async function restoreDataBackup(
  incoming: BackupContents,
  mode: BackupRestoreMode,
  archive?: PreparedBackupArchive,
  onProgress?: BackupProgressHandler,
): Promise<BackupData> {
  return withPilgrimageRecordsLock(async () => {
    if (incoming.pilgrimageRecords !== undefined && mode === 'merge' && usePilgrimageRecords.getState().loadError)
      throw new BackupError('recordsUnavailable');
    const current = getCurrentBackupData();
    const previousPhotos = getBackupPhotos(current);
    const localPhotos = new Map(previousPhotos.map((photo) => [photo.id, photo]));
    const staged: BackupPilgrimagePhotoV3[] = [];
    let committed = false;
    let prepared = incoming;
    try {
      if (incoming.pilgrimageRecords !== undefined) {
        const photos = getBackupPhotos(incoming);
        onProgress?.({ phase: 'restore', completed: 0, total: photos.length });
        const importedNames = new Map<string, string>();
        for (const [index, photo] of photos.entries()) {
          const local = localPhotos.get(photo.id);
          // A merge can reuse an existing photo without overwriting its bytes.
          const localFile = local ? getPilgrimagePhotoFile(local.fileName) : undefined;
          if (mode === 'merge' && local && localFile?.exists && localFile.size > 0) {
            importedNames.set(photo.id, local.fileName);
            onProgress?.({ phase: 'restore', completed: index + 1, total: photos.length });
            continue;
          }
          const source = archive?.photos.get(photo.fileName);
          if (!source?.exists || !source.size) throw new BackupError('invalid');
          const extension = photo.fileName.slice(photo.fileName.lastIndexOf('.'));
          let fileName: string;
          do {
            fileName = `restore-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${extension}`;
          } while (getPilgrimagePhotoFile(fileName).exists);
          getPilgrimagePhotoDirectory().create({ intermediates: true, idempotent: true });
          staged.push({ ...photo, fileName });
          const target = getPilgrimagePhotoFile(fileName);
          await source.copy(target);
          if (!target.exists || target.size !== source.size) throw new BackupError('writeFailed');
          importedNames.set(photo.id, fileName);
          onProgress?.({ phase: 'restore', completed: index + 1, total: photos.length });
        }
        prepared = {
          ...incoming,
          pilgrimageRecords: incoming.pilgrimageRecords.map((point) => ({
            ...point,
            days: point.days.map((day) => ({
              ...day,
              photos: day.photos.map((photo) => ({ ...photo, fileName: importedNames.get(photo.id)! })),
            })),
          })),
        };
      }
      // Recover a missing local file from the backup while retaining its stable ID.
      const stagedNames = new Map(staged.map((photo) => [photo.id, photo.fileName]));
      // Filesystem awaits must not erase plan/favorite edits made meanwhile.
      const latest = getCurrentBackupData();
      const mergeCurrent =
        mode === 'merge' && stagedNames.size
          ? {
              ...latest,
              pilgrimageRecords: current.pilgrimageRecords.map((point) => ({
                ...point,
                days: point.days.map((day) => ({
                  ...day,
                  photos: day.photos.map((photo) =>
                    stagedNames.has(photo.id) ? { ...photo, fileName: stagedNames.get(photo.id)! } : photo,
                  ),
                })),
              })),
            }
          : latest;
      const next = prepareBackupRestore(mergeCurrent, prepared, mode);
      // Prepare every write (including availability checks and raw rollback snapshots)
      // before changing any data. Publish to the UI only after all writes succeed.
      const steps = [
        ...(incoming.favoritePoints !== undefined ? [createFavoritePointsRestoreWrite(next.favoritePoints)] : []),
        ...(incoming.plans !== undefined ? createPlansRestoreWrites(next.plans, next.planListSortOrder) : []),
        ...(incoming.pilgrimageRecords !== undefined
          ? [createPilgrimageRecordsRestoreWrite(next.pilgrimageRecords)]
          : []),
      ];
      runBackupWrites(steps);
      committed = true;
      if (incoming.favoritePoints !== undefined) {
        useFavoritePoints.setState({
          favoritePoints: next.favoritePoints,
          favoriteKeys: new Set(next.favoritePoints.map((item) => item.key)),
        });
      }
      if (incoming.plans !== undefined) {
        usePlans.setState({ plans: next.plans, planListSortOrder: next.planListSortOrder });
      }
      if (incoming.pilgrimageRecords !== undefined) {
        usePilgrimageRecords.setState({ points: next.pilgrimageRecords, loadError: null });
        const retainedFiles = new Set(getBackupPhotos(next).map((photo) => photo.fileName));
        try {
          // Deletion happens only after persistence and publication have succeeded.
          deletePilgrimagePhotoFiles(previousPhotos.filter((photo) => !retainedFiles.has(photo.fileName)));
        } catch (error) {
          console.warn('Restored records; old photo cleanup failed:', error);
        }
      }
      return next;
    } catch (error) {
      // If a raw-storage rollback failed it may still reference staged files.
      if (!committed && !(error instanceof BackupError && error.code === 'rollbackFailed')) {
        try {
          deletePilgrimagePhotoFiles(staged);
        } catch (cleanupError) {
          console.warn('Restore staging cleanup failed:', cleanupError);
        }
      }
      throw error;
    }
  });
}
