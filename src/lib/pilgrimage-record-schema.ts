import type { PilgrimagePoint } from './pilgrimage-records';

// Frozen original persisted shape. Add a schema and migration instead of editing V1.
export type StoredPilgrimagePointV1 = {
  key: string;
  bangumiId: number;
  pointId: string;
  snapshot: {
    bangumiName: string;
    pointName: string;
    bangumiCover?: string;
    bangumiColor?: string;
    pointImage?: string;
    pointMark?: string;
    geo?: [number, number];
  };
  days: {
    dateKey: string;
    firstRecordedAt: number;
    photos: { id: string; fileName: string; width: number; height: number }[];
  }[];
};

// Frozen V2 adds an optional latest activity time; V1 history has no such value.
export type StoredPilgrimagePointV2 = Omit<StoredPilgrimagePointV1, 'days'> & {
  days: {
    dateKey: string;
    firstRecordedAt: number;
    lastRecordedAt?: number;
    photos: StoredPilgrimagePointV1['days'][number]['photos'];
  }[];
};

export const PILGRIMAGE_RECORD_STORAGE_VERSION = 2;
export type PilgrimageRecordMigrations = Readonly<Partial<Record<number, (data: unknown) => unknown>>>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
}

/** Frozen V1 validation and copying, independent of current application validation. */
export function validateStoredPilgrimageRecordsV1(value: unknown): StoredPilgrimagePointV1[] {
  if (!Array.isArray(value)) throw new Error('Invalid stored pilgrimage records');
  const keys = new Set<string>();
  const ids = new Set<string>();
  const fileNames = new Set<string>();
  return value.map((point) => {
    if (
      !isObject(point) ||
      !Number.isSafeInteger(point.bangumiId) ||
      (point.bangumiId as number) <= 0 ||
      typeof point.pointId !== 'string' ||
      !point.pointId.trim() ||
      point.key !== `${point.bangumiId}:${point.pointId}` ||
      keys.has(point.key as string) ||
      !isObject(point.snapshot) ||
      !Array.isArray(point.days) ||
      point.days.length === 0
    )
      throw new Error('Invalid stored pilgrimage point');
    keys.add(point.key as string);
    const snapshot = point.snapshot;
    if (typeof snapshot.bangumiName !== 'string' || typeof snapshot.pointName !== 'string')
      throw new Error('Invalid stored pilgrimage snapshot');
    for (const field of ['bangumiCover', 'bangumiColor', 'pointImage', 'pointMark']) {
      if (snapshot[field] !== undefined && typeof snapshot[field] !== 'string')
        throw new Error('Invalid stored pilgrimage snapshot');
    }
    if (
      snapshot.geo !== undefined &&
      (!Array.isArray(snapshot.geo) ||
        snapshot.geo.length !== 2 ||
        !snapshot.geo.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate)) ||
        Math.abs(snapshot.geo[0]) > 90 ||
        Math.abs(snapshot.geo[1]) > 180)
    )
      throw new Error('Invalid stored pilgrimage coordinates');
    const dates = new Set<string>();
    const days = point.days.map((day) => {
      if (
        !isObject(day) ||
        typeof day.dateKey !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(day.dateKey) ||
        dates.has(day.dateKey) ||
        !isTimestamp(day.firstRecordedAt) ||
        !Array.isArray(day.photos)
      )
        throw new Error('Invalid stored pilgrimage day');
      const date = new Date(`${day.dateKey}T12:00:00Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day.dateKey)
        throw new Error('Invalid stored pilgrimage date');
      dates.add(day.dateKey);
      const photos = day.photos.map((photo) => {
        if (
          !isObject(photo) ||
          typeof photo.id !== 'string' ||
          !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,170}$/.test(photo.id) ||
          ids.has(photo.id) ||
          typeof photo.fileName !== 'string' ||
          !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,170}\.(jpg|jpeg|png|webp)$/.test(photo.fileName) ||
          fileNames.has(photo.fileName) ||
          typeof photo.width !== 'number' ||
          !Number.isSafeInteger(photo.width) ||
          photo.width <= 0 ||
          typeof photo.height !== 'number' ||
          !Number.isSafeInteger(photo.height) ||
          photo.height <= 0
        )
          throw new Error('Invalid stored pilgrimage photo');
        ids.add(photo.id);
        fileNames.add(photo.fileName);
        return { id: photo.id, fileName: photo.fileName, width: photo.width, height: photo.height };
      });
      return { dateKey: day.dateKey, firstRecordedAt: day.firstRecordedAt, photos };
    });
    return {
      key: point.key as string,
      bangumiId: point.bangumiId as number,
      pointId: point.pointId,
      snapshot: {
        bangumiName: snapshot.bangumiName,
        pointName: snapshot.pointName,
        ...(snapshot.bangumiCover !== undefined ? { bangumiCover: snapshot.bangumiCover as string } : {}),
        ...(snapshot.bangumiColor !== undefined ? { bangumiColor: snapshot.bangumiColor as string } : {}),
        ...(snapshot.pointImage !== undefined ? { pointImage: snapshot.pointImage as string } : {}),
        ...(snapshot.pointMark !== undefined ? { pointMark: snapshot.pointMark as string } : {}),
        ...(snapshot.geo !== undefined ? { geo: [...(snapshot.geo as [number, number])] as [number, number] } : {}),
      },
      days,
    };
  });
}

/** Frozen V2 validation and copying retain only its explicitly owned fields. */
export function validateStoredPilgrimageRecordsV2(value: unknown): StoredPilgrimagePointV2[] {
  const points = validateStoredPilgrimageRecordsV1(value);
  const source = value as StoredPilgrimagePointV2[];
  return points.map((point, pointIndex) => ({
    ...point,
    days: point.days.map((day, dayIndex) => {
      const lastRecordedAt = source[pointIndex].days[dayIndex].lastRecordedAt;
      if (lastRecordedAt !== undefined && (!isTimestamp(lastRecordedAt) || lastRecordedAt < day.firstRecordedAt))
        throw new Error('Invalid stored pilgrimage latest time');
      return { ...day, ...(lastRecordedAt !== undefined ? { lastRecordedAt } : {}) };
    }),
  }));
}

/** Migrations receive a private copy. Each step validates its historical input. */
export function migratePilgrimageRecordData(
  value: unknown,
  sourceVersion: number,
  targetVersion: number,
  migrations: PilgrimageRecordMigrations,
): unknown {
  if (
    !Number.isSafeInteger(sourceVersion) ||
    sourceVersion < 1 ||
    !Number.isSafeInteger(targetVersion) ||
    targetVersion < 1
  )
    throw new Error('Invalid pilgrimage record storage version');
  if (sourceVersion > targetVersion) throw new Error('Unsupported pilgrimage record storage version');
  for (let version = sourceVersion; version < targetVersion; version++) {
    if (typeof migrations[version] !== 'function') throw new Error('Missing pilgrimage record storage migration');
  }
  let data: unknown = JSON.parse(JSON.stringify(value));
  if (!Array.isArray(data)) throw new Error('Invalid stored pilgrimage records');
  for (let version = sourceVersion; version < targetVersion; version++) {
    data = migrations[version]!(data);
    if (!Array.isArray(data)) throw new Error('Invalid pilgrimage record migration result');
  }
  return data;
}

const MIGRATIONS: PilgrimageRecordMigrations = {
  // V1 contains no last activity time. Preserve that absence instead of guessing.
  1: validateStoredPilgrimageRecordsV1,
};

export const pilgrimageRecordStorageSchema = {
  version: PILGRIMAGE_RECORD_STORAGE_VERSION,
  migrate: (data: unknown, sourceVersion: number) =>
    migratePilgrimageRecordData(data, sourceVersion, PILGRIMAGE_RECORD_STORAGE_VERSION, MIGRATIONS),
  // Update these explicit adapters when the application's model evolves.
  decode: (data: unknown): PilgrimagePoint[] => validateStoredPilgrimageRecordsV2(data),
  encode: (points: PilgrimagePoint[]): StoredPilgrimagePointV2[] => validateStoredPilgrimageRecordsV2(points),
};
