// Frozen wire format: never change V1 when the application's models evolve.
// Add a new version and an explicit migration instead.
export type BackupPointSnapshotV1 = {
  bangumiName: string;
  bangumiCover?: string;
  bangumiColor?: string;
  pointName: string;
  pointImage?: string;
  pointMark?: string;
};

export type BackupFavoritePointV1 = {
  key: string;
  bangumiId: number;
  pointId: string;
  addedAt: number;
  snapshot: BackupPointSnapshotV1;
};

export type BackupPlanItemV1 = {
  key: string;
  bangumiId: number;
  pointId: string;
  addedAt: number;
  completed: boolean;
  snapshot: BackupPointSnapshotV1 & { geo?: [number, number] };
};

export type BackupPlanV1 = {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  items: BackupPlanItemV1[];
};

export type DataBackupV1 = {
  type: 'anitabi-backup';
  version: 1;
  appVersion: string;
  exportedAt: string;
  data: {
    favoritePoints: BackupFavoritePointV1[];
    plans: BackupPlanV1[];
    planListSortOrder: 'asc' | 'desc';
  };
};
