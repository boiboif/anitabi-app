// Frozen wire format: never change V1 when the application's models evolve.
// Add a new version and an explicit migration instead.
// Keep versioned runtime validation in data-backup-codec.ts frozen as well.
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

// Omitted categories are left untouched during restore; an empty array clears
// that included category in overwrite mode. Plans always include their sorting.
export type DataBackupV2 = {
  type: 'anitabi-backup';
  version: 2;
  appVersion: string;
  exportedAt: string;
  data: {
    favoritePoints?: BackupFavoritePointV1[];
    plans?: BackupPlanV1[];
    planListSortOrder?: 'asc' | 'desc';
  };
};

// V3 stores photo bytes beside data.json in a ZIP. Keep these wire types frozen.
export type BackupPilgrimagePhotoV3 = {
  id: string;
  fileName: string;
  width: number;
  height: number;
};

export type BackupPilgrimagePointV3 = {
  key: string;
  bangumiId: number;
  pointId: string;
  snapshot: BackupPointSnapshotV1 & { geo?: [number, number] };
  days: {
    dateKey: string;
    firstRecordedAt: number;
    photos: BackupPilgrimagePhotoV3[];
  }[];
};

export type DataBackupV3 = {
  type: 'anitabi-backup';
  version: 3;
  appVersion: string;
  exportedAt: string;
  data: {
    favoritePoints?: BackupFavoritePointV1[];
    plans?: BackupPlanV1[];
    planListSortOrder?: 'asc' | 'desc';
    pilgrimageRecords?: BackupPilgrimagePointV3[];
  };
};

// V4 preserves the last record-added event without changing historical first times.
export type BackupPilgrimagePointV4 = Omit<BackupPilgrimagePointV3, 'days'> & {
  days: (BackupPilgrimagePointV3['days'][number] & { lastRecordedAt?: number })[];
};

export type DataBackupV4 = Omit<DataBackupV3, 'version' | 'data'> & {
  version: 4;
  data: Omit<DataBackupV3['data'], 'pilgrimageRecords'> & {
    pilgrimageRecords?: BackupPilgrimagePointV4[];
  };
};
