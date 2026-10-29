import type {
  BackupFavoritePointV1,
  BackupPilgrimagePointV3,
  BackupPlanItemV1,
  BackupPlanV1,
  BackupPointSnapshotV1,
  DataBackupV2,
  DataBackupV3,
  DataBackupV4,
} from './data-backup-schema';
import type { FavoritePoint } from './favorite-storage';
import type { ItineraryPlan, PlanListSortOrder } from './plan-storage';
import type { PilgrimagePoint } from './pilgrimage-records';

export type BackupAppContents = {
  favoritePoints?: FavoritePoint[];
  plans?: ItineraryPlan[];
  planListSortOrder?: PlanListSortOrder;
  pilgrimageRecords?: PilgrimagePoint[];
};
export type BackupAppData = Required<BackupAppContents>;
type WireContentsV3 = DataBackupV3['data'];
type WireContentsV4 = DataBackupV4['data'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
}

function isSnapshotV1(value: unknown): value is BackupPointSnapshotV1 & { geo?: [number, number] } {
  if (!isRecord(value) || typeof value.bangumiName !== 'string' || typeof value.pointName !== 'string') return false;
  for (const key of ['bangumiCover', 'bangumiColor', 'pointImage', 'pointMark']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') return false;
  }
  if (value.geo !== undefined) {
    if (!Array.isArray(value.geo) || value.geo.length !== 2) return false;
    const [latitude, longitude] = value.geo;
    if (
      typeof latitude !== 'number' ||
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      typeof longitude !== 'number' ||
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180
    )
      return false;
  }
  return true;
}

function isFavoriteV1(value: unknown): value is BackupFavoritePointV1 {
  return (
    isRecord(value) &&
    typeof value.bangumiId === 'number' &&
    Number.isSafeInteger(value.bangumiId) &&
    value.bangumiId > 0 &&
    typeof value.pointId === 'string' &&
    value.pointId.length > 0 &&
    value.key === `${value.bangumiId}:${value.pointId}` &&
    isTimestamp(value.addedAt) &&
    isSnapshotV1(value.snapshot)
  );
}

function isPlanItemV1(value: unknown): value is BackupPlanItemV1 {
  return isRecord(value) && typeof value.completed === 'boolean' && isFavoriteV1(value);
}

function isUniqueArray<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
  getKey: (item: T) => string,
): value is T[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const item of value) {
    if (!isItem(item) || seen.has(getKey(item))) return false;
    seen.add(getKey(item));
  }
  return true;
}

function isPlanV1(value: unknown): value is BackupPlanV1 {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
    (value.description === undefined || typeof value.description === 'string') &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt) &&
    isUniqueArray(value.items, isPlanItemV1, (item) => item.key)
  );
}

export function isFullBackupDataV1(value: unknown): boolean {
  return (
    isRecord(value) &&
    isUniqueArray(value.favoritePoints, isFavoriteV1, (item) => item.key) &&
    isUniqueArray(value.plans, isPlanV1, (plan) => plan.id) &&
    (value.planListSortOrder === 'asc' || value.planListSortOrder === 'desc')
  );
}

// Frozen V3 rules deliberately do not import current record-model validators.
// Future app/local-schema changes must not change which historical files are valid.
export function isBackupPhotoFileNameV3(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,170}\.(jpg|jpeg|png|webp)$/.test(value);
}

function isDateKeyV3(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isRecordsV3(value: unknown): value is BackupPilgrimagePointV3[] {
  if (!Array.isArray(value)) return false;
  const pointKeys = new Set<string>();
  const photoIds = new Set<string>();
  const fileNames = new Set<string>();
  for (const point of value) {
    if (
      !isRecord(point) ||
      typeof point.bangumiId !== 'number' ||
      !Number.isSafeInteger(point.bangumiId) ||
      point.bangumiId <= 0 ||
      typeof point.pointId !== 'string' ||
      !point.pointId.trim() ||
      point.key !== `${point.bangumiId}:${point.pointId}` ||
      pointKeys.has(point.key as string) ||
      !isSnapshotV1(point.snapshot) ||
      !Array.isArray(point.days) ||
      !point.days.length
    )
      return false;
    pointKeys.add(point.key as string);
    const dates = new Set<string>();
    for (const day of point.days) {
      if (
        !isRecord(day) ||
        !isDateKeyV3(day.dateKey) ||
        dates.has(day.dateKey) ||
        !isTimestamp(day.firstRecordedAt) ||
        !Array.isArray(day.photos)
      )
        return false;
      dates.add(day.dateKey);
      for (const photo of day.photos) {
        if (
          !isRecord(photo) ||
          typeof photo.id !== 'string' ||
          !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,170}$/.test(photo.id) ||
          photoIds.has(photo.id) ||
          !isBackupPhotoFileNameV3(photo.fileName) ||
          fileNames.has(photo.fileName) ||
          typeof photo.width !== 'number' ||
          !Number.isSafeInteger(photo.width) ||
          photo.width <= 0 ||
          typeof photo.height !== 'number' ||
          !Number.isSafeInteger(photo.height) ||
          photo.height <= 0
        )
          return false;
        photoIds.add(photo.id);
        fileNames.add(photo.fileName);
      }
    }
  }
  return true;
}

function isIncludedCategoriesV1(value: Record<string, unknown>): boolean {
  return (
    (value.favoritePoints === undefined || isUniqueArray(value.favoritePoints, isFavoriteV1, (item) => item.key)) &&
    (value.plans === undefined
      ? value.planListSortOrder === undefined
      : isUniqueArray(value.plans, isPlanV1, (plan) => plan.id) &&
        (value.planListSortOrder === 'asc' || value.planListSortOrder === 'desc'))
  );
}

export function isBackupContentsV2(value: unknown): value is DataBackupV2['data'] {
  return (
    isRecord(value) &&
    (value.favoritePoints !== undefined || value.plans !== undefined) &&
    value.pilgrimageRecords === undefined &&
    isIncludedCategoriesV1(value)
  );
}

export function isBackupContentsV3(value: unknown): value is WireContentsV3 {
  return (
    isRecord(value) &&
    (value.favoritePoints !== undefined || value.plans !== undefined || value.pilgrimageRecords !== undefined) &&
    (value.pilgrimageRecords === undefined || isRecordsV3(value.pilgrimageRecords)) &&
    isIncludedCategoriesV1(value)
  );
}

function copySnapshotV1(snapshot: BackupPointSnapshotV1): BackupPointSnapshotV1 {
  return {
    bangumiName: snapshot.bangumiName,
    pointName: snapshot.pointName,
    ...(snapshot.bangumiCover !== undefined ? { bangumiCover: snapshot.bangumiCover } : {}),
    ...(snapshot.bangumiColor !== undefined ? { bangumiColor: snapshot.bangumiColor } : {}),
    ...(snapshot.pointImage !== undefined ? { pointImage: snapshot.pointImage } : {}),
    ...(snapshot.pointMark !== undefined ? { pointMark: snapshot.pointMark } : {}),
  };
}

function copyLocatedSnapshotV1(snapshot: BackupPointSnapshotV1 & { geo?: [number, number] }) {
  return {
    ...copySnapshotV1(snapshot),
    ...(snapshot.geo !== undefined ? { geo: [...snapshot.geo] as [number, number] } : {}),
  };
}

/** A whitelist also normalizes parsed wire values: unknown fields never persist. */
export function copyBackupContentsV3(data: WireContentsV3): WireContentsV3 {
  return {
    ...(data.favoritePoints !== undefined
      ? {
          favoritePoints: data.favoritePoints.map((point) => ({
            key: point.key,
            bangumiId: point.bangumiId,
            pointId: point.pointId,
            addedAt: point.addedAt,
            snapshot: copySnapshotV1(point.snapshot),
          })),
        }
      : {}),
    ...(data.plans !== undefined
      ? {
          plans: data.plans.map((plan) => ({
            id: plan.id,
            title: plan.title,
            ...(plan.description !== undefined ? { description: plan.description } : {}),
            createdAt: plan.createdAt,
            updatedAt: plan.updatedAt,
            items: plan.items.map((item) => ({
              key: item.key,
              bangumiId: item.bangumiId,
              pointId: item.pointId,
              addedAt: item.addedAt,
              completed: item.completed,
              snapshot: copyLocatedSnapshotV1(item.snapshot),
            })),
          })),
          planListSortOrder: data.planListSortOrder,
        }
      : {}),
    ...(data.pilgrimageRecords !== undefined
      ? {
          pilgrimageRecords: data.pilgrimageRecords.map((point) => ({
            key: point.key,
            bangumiId: point.bangumiId,
            pointId: point.pointId,
            snapshot: copyLocatedSnapshotV1(point.snapshot),
            days: point.days.map((day) => ({
              dateKey: day.dateKey,
              firstRecordedAt: day.firstRecordedAt,
              photos: day.photos.map((photo) => ({
                id: photo.id,
                fileName: photo.fileName,
                width: photo.width,
                height: photo.height,
              })),
            })),
          })),
        }
      : {}),
  };
}

/** App -> frozen wire. Update this adapter explicitly when the app model evolves. */
export function encodeBackupContentsV3(data: BackupAppContents): WireContentsV3 {
  return copyBackupContentsV3({
    ...(data.favoritePoints !== undefined ? { favoritePoints: data.favoritePoints } : {}),
    ...(data.plans !== undefined ? { plans: data.plans, planListSortOrder: data.planListSortOrder } : {}),
    ...(data.pilgrimageRecords !== undefined ? { pilgrimageRecords: data.pilgrimageRecords } : {}),
  });
}

/** Frozen wire -> app. Keep defaults/conversions for future app fields here. */
export function decodeBackupContentsV3(data: WireContentsV3): BackupAppContents {
  const wire = copyBackupContentsV3(data);
  return {
    ...(wire.favoritePoints !== undefined ? { favoritePoints: wire.favoritePoints } : {}),
    ...(wire.plans !== undefined ? { plans: wire.plans, planListSortOrder: wire.planListSortOrder } : {}),
    ...(wire.pilgrimageRecords !== undefined ? { pilgrimageRecords: wire.pilgrimageRecords } : {}),
  };
}

/** V4 retains the frozen V3 constraints and validates its additional event time. */
export function isBackupContentsV4(value: unknown): value is WireContentsV4 {
  if (!isBackupContentsV3(value)) return false;
  return (value.pilgrimageRecords ?? []).every((point) =>
    point.days.every((day) => {
      const latest = (day as { lastRecordedAt?: unknown }).lastRecordedAt;
      return latest === undefined || (isTimestamp(latest) && latest >= day.firstRecordedAt);
    }),
  );
}

export function copyBackupContentsV4(data: WireContentsV4): WireContentsV4 {
  const wire = copyBackupContentsV3(data);
  return {
    ...wire,
    ...(wire.pilgrimageRecords !== undefined
      ? {
          pilgrimageRecords: wire.pilgrimageRecords.map((point, index) => ({
            ...point,
            days: point.days.map((day, dayIndex) => {
              const latest = data.pilgrimageRecords![index].days[dayIndex].lastRecordedAt;
              return { ...day, ...(latest !== undefined ? { lastRecordedAt: latest } : {}) };
            }),
          })),
        }
      : {}),
  };
}

export function encodeBackupContentsV4(data: BackupAppContents): WireContentsV4 {
  return copyBackupContentsV4(data);
}

export function decodeBackupContentsV4(data: WireContentsV4): BackupAppContents {
  return copyBackupContentsV4(data);
}
