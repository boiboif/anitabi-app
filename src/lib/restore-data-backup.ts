import {
  prepareBackupRestore,
  runBackupWrites,
  type BackupContents,
  type BackupData,
  type BackupRestoreMode,
} from '@/lib/data-backup';
import { createFavoritePointsRestoreWrite } from '@/lib/favorite-storage';
import { createPlansRestoreWrites } from '@/lib/plan-storage';
import { useFavoritePoints } from '@/store/use-favorite-points';
import { usePlans } from '@/store/use-plans';

export function getCurrentBackupData(): BackupData {
  const { plans, planListSortOrder } = usePlans.getState();
  return { favoritePoints: useFavoritePoints.getState().favoritePoints, plans, planListSortOrder };
}

export function restoreDataBackup(incoming: BackupContents, mode: BackupRestoreMode): BackupData {
  const next = prepareBackupRestore(getCurrentBackupData(), incoming, mode);
  // Prepare every write (including availability checks and raw rollback snapshots)
  // before changing any data. Publish to the UI only after all writes succeed.
  const steps = [
    ...(incoming.favoritePoints !== undefined ? [createFavoritePointsRestoreWrite(next.favoritePoints)] : []),
    ...(incoming.plans !== undefined ? createPlansRestoreWrites(next.plans, next.planListSortOrder) : []),
  ];
  runBackupWrites(steps);
  if (incoming.favoritePoints !== undefined) {
    useFavoritePoints.setState({
      favoritePoints: next.favoritePoints,
      favoriteKeys: new Set(next.favoritePoints.map((item) => item.key)),
    });
  }
  if (incoming.plans !== undefined) {
    usePlans.setState({ plans: next.plans, planListSortOrder: next.planListSortOrder });
  }
  return next;
}
