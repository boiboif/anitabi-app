import { createMMKV } from 'react-native-mmkv';
import { validatePilgrimageRecords, type PilgrimagePoint } from '@/lib/pilgrimage-records';

export class PilgrimageRecordsRollbackError extends AggregateError {
  constructor(errors: unknown[]) {
    super(errors, 'Pilgrimage record write and rollback failed');
    this.name = 'PilgrimageRecordsRollbackError';
  }
}

let storage: ReturnType<typeof createMMKV> | null = null;
try {
  storage = createMMKV({ id: 'anitabi-pilgrimage-records' });
} catch (error) {
  console.warn('MMKV pilgrimage record storage is unavailable:', error);
}

const POINT_PREFIX = 'point-v1:';
let loadError: string | null = storage ? null : 'Pilgrimage record storage is unavailable';

export function getPilgrimageRecordsLoadError(): string | null {
  return loadError;
}

function pointStorageKey(point: Pick<PilgrimagePoint, 'key'>) {
  return `${POINT_PREFIX}${encodeURIComponent(point.key)}`;
}

function requireStorage() {
  if (!storage) throw new Error('Pilgrimage record storage is unavailable');
  return storage;
}

function getRawPoints() {
  const database = requireStorage();
  return new Map(
    database
      .getAllKeys()
      .filter((key) => key.startsWith(POINT_PREFIX))
      .map((key) => [key, database.getString(key)] as const),
  );
}

export function getPilgrimageRecords(): PilgrimagePoint[] {
  if (!storage) return [];
  try {
    const rawPoints = getRawPoints();
    const points = [...rawPoints.values()].map((raw) => JSON.parse(raw ?? 'null'));
    const validated = validatePilgrimageRecords(points);
    if (validated.some((point) => !rawPoints.has(pointStorageKey(point)))) {
      throw new Error('Pilgrimage record storage key mismatch');
    }
    loadError = null;
    return validated;
  } catch (error) {
    loadError = 'Could not read pilgrimage records';
    console.warn('Could not read pilgrimage records:', error);
    return [];
  }
}

/** Prepare rollback snapshots without publishing any Zustand state. */
export function createPilgrimageRecordsRestoreWrite(points: PilgrimagePoint[]) {
  const database = requireStorage();
  const next = new Map(
    validatePilgrimageRecords(points).map((point) => [pointStorageKey(point), JSON.stringify(point)]),
  );
  const previous = getRawPoints();
  const previousError = loadError;
  const apply = (values: Map<string, string | undefined>) => {
    for (const [key, value] of values) {
      if (database.getString(key) === value) continue;
      if (value === undefined) database.remove(key);
      else database.set(key, value);
      if (database.getString(key) !== value) throw new Error('Pilgrimage record storage verification failed');
    }
    for (const key of database.getAllKeys().filter((item) => item.startsWith(POINT_PREFIX))) {
      if (values.has(key)) continue;
      database.remove(key);
      if (database.getString(key) !== undefined) throw new Error('Pilgrimage record deletion verification failed');
    }
  };
  return {
    write: () => {
      apply(next);
      loadError = null;
    },
    rollback: () => {
      apply(previous);
      loadError = previousError;
    },
  };
}

/** Ordinary events serialize only changed point objects, leaving all other raw records untouched. */
export function setPilgrimageRecords(points: PilgrimagePoint[], previousPoints: PilgrimagePoint[]): void {
  const database = requireStorage();
  if (loadError) throw new Error(loadError);
  const previousByKey = new Map(previousPoints.map((point) => [point.key, point]));
  const nextKeys = new Set(points.map((point) => point.key));
  const changed = validatePilgrimageRecords(points.filter((point) => previousByKey.get(point.key) !== point));
  const next = new Map<string, string | undefined>(
    changed.map((point) => [pointStorageKey(point), JSON.stringify(point)]),
  );
  for (const point of previousPoints) {
    if (!nextKeys.has(point.key)) next.set(pointStorageKey(point), undefined);
  }
  const previous = new Map([...next.keys()].map((key) => [key, database.getString(key)] as const));
  const apply = (values: Map<string, string | undefined>) => {
    for (const [key, value] of values) {
      if (value === undefined) database.remove(key);
      else database.set(key, value);
      if (database.getString(key) !== value) throw new Error('Pilgrimage record storage verification failed');
    }
  };
  try {
    apply(next);
  } catch (error) {
    try {
      apply(previous);
    } catch (rollbackError) {
      loadError = 'Pilgrimage record write and rollback failed';
      throw new PilgrimageRecordsRollbackError([error, rollbackError]);
    }
    throw error;
  }
}
