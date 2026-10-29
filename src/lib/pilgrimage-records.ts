export type PilgrimagePhoto = {
  id: string;
  fileName: string;
  width: number;
  height: number;
};

export type PilgrimageDay = {
  dateKey: string;
  firstRecordedAt: number;
  /** Latest new visit/photo event; absent when historical photo times are unknown. */
  lastRecordedAt?: number;
  photos: PilgrimagePhoto[];
};

export type PilgrimagePoint = {
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
  days: PilgrimageDay[];
};

export type PilgrimagePointInput = Omit<PilgrimagePoint, 'days'>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
}

export function isPilgrimagePhotoFileName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,170}\.(jpg|jpeg|png|webp)$/.test(value);
}

export function isPilgrimageDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Capture the device's local calendar day once; historical dates are never recalculated. */
export function getPilgrimageDateKey(at: number): string {
  if (!isTimestamp(at)) throw new Error('Invalid pilgrimage timestamp');
  const date = new Date(at);
  const key = `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (!isPilgrimageDateKey(key)) throw new Error('Invalid pilgrimage date');
  return key;
}

export function isPilgrimagePhoto(value: unknown): value is PilgrimagePhoto {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,170}$/.test(value.id) &&
    isPilgrimagePhotoFileName(value.fileName) &&
    typeof value.width === 'number' &&
    Number.isSafeInteger(value.width) &&
    value.width > 0 &&
    typeof value.height === 'number' &&
    Number.isSafeInteger(value.height) &&
    value.height > 0
  );
}

export function isPilgrimageDay(value: unknown): value is PilgrimageDay {
  return (
    isObject(value) &&
    isPilgrimageDateKey(value.dateKey) &&
    isTimestamp(value.firstRecordedAt) &&
    (value.lastRecordedAt === undefined ||
      (isTimestamp(value.lastRecordedAt) && value.lastRecordedAt >= value.firstRecordedAt)) &&
    Array.isArray(value.photos) &&
    value.photos.every(isPilgrimagePhoto)
  );
}

export function isPilgrimagePointInput(value: unknown): value is PilgrimagePointInput {
  if (
    !isObject(value) ||
    !Number.isSafeInteger(value.bangumiId) ||
    (value.bangumiId as number) <= 0 ||
    typeof value.pointId !== 'string' ||
    !value.pointId.trim() ||
    value.key !== `${value.bangumiId}:${value.pointId}` ||
    !isObject(value.snapshot)
  )
    return false;
  const snapshot = value.snapshot;
  if (typeof snapshot.bangumiName !== 'string' || typeof snapshot.pointName !== 'string') return false;
  for (const field of ['bangumiCover', 'bangumiColor', 'pointImage', 'pointMark']) {
    if (snapshot[field] !== undefined && typeof snapshot[field] !== 'string') return false;
  }
  return (
    snapshot.geo === undefined ||
    (Array.isArray(snapshot.geo) &&
      snapshot.geo.length === 2 &&
      snapshot.geo.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate)) &&
      Math.abs(snapshot.geo[0]) <= 90 &&
      Math.abs(snapshot.geo[1]) <= 180)
  );
}

export function isPilgrimagePoint(value: unknown): value is PilgrimagePoint {
  return (
    isPilgrimagePointInput(value) &&
    'days' in value &&
    Array.isArray(value.days) &&
    value.days.length > 0 &&
    value.days.every(isPilgrimageDay)
  );
}

function copyInput(point: PilgrimagePointInput): PilgrimagePointInput {
  const { bangumiName, pointName, bangumiCover, bangumiColor, pointImage, pointMark, geo } = point.snapshot;
  return {
    key: point.key,
    bangumiId: point.bangumiId,
    pointId: point.pointId,
    snapshot: {
      bangumiName,
      pointName,
      ...(bangumiCover !== undefined ? { bangumiCover } : {}),
      ...(bangumiColor !== undefined ? { bangumiColor } : {}),
      ...(pointImage !== undefined ? { pointImage } : {}),
      ...(pointMark !== undefined ? { pointMark } : {}),
      ...(geo !== undefined ? { geo: [...geo] as [number, number] } : {}),
    },
  };
}

/** Validate untrusted backup/storage values and retain only record-owned fields. */
export function validatePilgrimageRecords(value: unknown): PilgrimagePoint[] {
  if (!Array.isArray(value)) throw new Error('Invalid pilgrimage records');
  const pointKeys = new Set<string>();
  const photoIds = new Set<string>();
  const fileNames = new Set<string>();
  return value.map((point) => {
    if (!isPilgrimagePoint(point) || pointKeys.has(point.key)) throw new Error('Invalid pilgrimage point');
    pointKeys.add(point.key);
    const dates = new Set<string>();
    const days = point.days.map((day) => {
      if (dates.has(day.dateKey)) throw new Error('Duplicate pilgrimage date');
      dates.add(day.dateKey);
      const photos = day.photos.map((photo) => {
        if (photoIds.has(photo.id) || fileNames.has(photo.fileName)) throw new Error('Duplicate pilgrimage photo');
        photoIds.add(photo.id);
        fileNames.add(photo.fileName);
        return { id: photo.id, fileName: photo.fileName, width: photo.width, height: photo.height };
      });
      return {
        dateKey: day.dateKey,
        firstRecordedAt: day.firstRecordedAt,
        ...(day.lastRecordedAt !== undefined ? { lastRecordedAt: day.lastRecordedAt } : {}),
        photos,
      };
    });
    return { ...copyInput(point), days };
  });
}

export function getPilgrimageDayLatestTime(day: PilgrimageDay): number {
  return day.lastRecordedAt ?? day.firstRecordedAt;
}

export function getPilgrimageLatestTime(point: PilgrimagePoint): number {
  return point.days.reduce((latest, day) => Math.max(latest, getPilgrimageDayLatestTime(day)), 0);
}

export function upsertPilgrimageDay(
  points: PilgrimagePoint[],
  input: PilgrimagePointInput,
  at: number,
  photo?: PilgrimagePhoto,
): PilgrimagePoint[] {
  if (!isPilgrimagePointInput(input) || (photo !== undefined && !isPilgrimagePhoto(photo))) {
    throw new Error('Invalid pilgrimage record input');
  }
  const dateKey = getPilgrimageDateKey(at);
  const current = points.find((point) => point.key === input.key);
  const day = current?.days.find((entry) => entry.dateKey === dateKey);
  // A second check on the same day creates no additional visit and preserves its first time.
  if (day && !photo) return points;
  const nextDay: PilgrimageDay = day
    ? {
        ...day,
        lastRecordedAt: Math.max(getPilgrimageDayLatestTime(day), at),
        photos: photo ? [...day.photos, photo] : day.photos,
      }
    : { dateKey, firstRecordedAt: at, lastRecordedAt: at, photos: photo ? [photo] : [] };
  const nextPoint: PilgrimagePoint = {
    ...copyInput(input),
    days: [...(current?.days.filter((entry) => entry.dateKey !== dateKey) ?? []), nextDay].sort((left, right) =>
      right.dateKey.localeCompare(left.dateKey),
    ),
  };
  return [...points.filter((point) => point.key !== input.key), nextPoint].sort(
    (left, right) => getPilgrimageLatestTime(right) - getPilgrimageLatestTime(left),
  );
}

/** Stable photo IDs make restoring the same backup repeatedly idempotent. */
export function mergePilgrimageRecords(local: PilgrimagePoint[], incoming: PilgrimagePoint[]): PilgrimagePoint[] {
  const result = new Map(validatePilgrimageRecords(local).map((point) => [point.key, point]));
  for (const point of validatePilgrimageRecords(incoming)) {
    const existing = result.get(point.key);
    if (!existing) {
      result.set(point.key, point);
      continue;
    }
    const days = new Map(existing.days.map((day) => [day.dateKey, day]));
    for (const day of point.days) {
      const previous = days.get(day.dateKey);
      if (!previous) days.set(day.dateKey, day);
      else {
        const ids = new Set(previous.photos.map((photo) => photo.id));
        days.set(day.dateKey, {
          dateKey: day.dateKey,
          firstRecordedAt: Math.min(previous.firstRecordedAt, day.firstRecordedAt),
          ...(previous.lastRecordedAt !== undefined || day.lastRecordedAt !== undefined
            ? { lastRecordedAt: Math.max(getPilgrimageDayLatestTime(previous), getPilgrimageDayLatestTime(day)) }
            : {}),
          photos: [...previous.photos, ...day.photos.filter((photo) => !ids.has(photo.id))],
        });
      }
    }
    result.set(point.key, { ...existing, days: [...days.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey)) });
  }
  return validatePilgrimageRecords([...result.values()]).sort(
    (left, right) => getPilgrimageLatestTime(right) - getPilgrimageLatestTime(left),
  );
}
