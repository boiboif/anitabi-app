export const PILGRIMAGE_RECORD_VERSION_KEY = 'schema-version';

type StringStorage = {
  getAllKeys(): string[];
  getString(key: string): string | undefined;
  contains(key: string): boolean;
  set(key: string, value: string): void;
  remove(key: string): void;
};

type RecordSchema<Point extends { key: string }> = {
  version: number;
  migrate(data: unknown, sourceVersion: number): unknown;
  decode(data: unknown): Point[];
  encode(points: Point[]): { key: string }[];
};

export class PilgrimageRecordsRollbackError extends AggregateError {
  constructor(errors: unknown[]) {
    super(errors, 'Pilgrimage record write and rollback failed');
    this.name = 'PilgrimageRecordsRollbackError';
  }
}

/** Point namespaces are versioned; one final pointer write commits a migration. */
export function createPilgrimageRecordStorage<Point extends { key: string }>(
  storage: StringStorage | null,
  schema: RecordSchema<Point>,
) {
  if (!Number.isSafeInteger(schema.version) || schema.version < 1) throw new Error('Invalid pilgrimage storage schema');
  let loadError: string | null = storage ? null : 'Pilgrimage record storage is unavailable';
  const prefix = (version: number) => `point-v${version}:`;
  const pointKey = (version: number, key: string) => `${prefix(version)}${encodeURIComponent(key)}`;
  const requireStorage = () => {
    if (!storage) throw new Error('Pilgrimage record storage is unavailable');
    return storage;
  };
  const readVersion = () => {
    const database = requireStorage();
    const keys = database.getAllKeys();
    for (const key of keys.filter((entry) => entry.startsWith('point-v'))) {
      const match = /^point-v([1-9]\d*):/.exec(key);
      if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) > schema.version)
        throw new Error('Unsupported pilgrimage record storage namespace');
    }
    if (!keys.includes(PILGRIMAGE_RECORD_VERSION_KEY)) return 1;
    const raw = database.getString(PILGRIMAGE_RECORD_VERSION_KEY);
    if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)))
      throw new Error('Invalid pilgrimage record storage version');
    const version = Number(raw);
    if (version > schema.version) throw new Error('Unsupported pilgrimage record storage version');
    return version;
  };
  const rawPoints = (version: number) => {
    const database = requireStorage();
    return new Map(
      database
        .getAllKeys()
        .filter((key) => key.startsWith(prefix(version)))
        .map((key) => [key, database.getString(key)] as const),
    );
  };
  const apply = (values: Map<string, string | undefined>) => {
    const database = requireStorage();
    for (const [key, value] of values) {
      if (value === undefined) {
        if (!database.contains(key)) continue;
        database.remove(key);
        if (database.contains(key)) throw new Error('Pilgrimage record deletion verification failed');
      } else {
        if (database.getString(key) === value) continue;
        database.set(key, value);
        if (database.getString(key) !== value) throw new Error('Pilgrimage record storage verification failed');
      }
    }
  };
  const replaceNamespace = (values: Map<string, string | undefined>, version: number) => {
    apply(values);
    apply(new Map([...rawPoints(version).keys()].filter((key) => !values.has(key)).map((key) => [key, undefined])));
  };
  const encode = (points: Point[]) =>
    new Map(schema.encode(points).map((point) => [pointKey(schema.version, point.key), JSON.stringify(point)]));
  const versionValue = () => requireStorage().getString(PILGRIMAGE_RECORD_VERSION_KEY);
  const writeVersion = (value: string | undefined) => apply(new Map([[PILGRIMAGE_RECORD_VERSION_KEY, value]]));

  return {
    getLoadError: () => loadError,
    getRecords: (): Point[] => {
      if (!storage) return [];
      try {
        const version = readVersion();
        const raw = rawPoints(version);
        const data = [...raw.entries()].map(([key, value]) => {
          const point: unknown = JSON.parse(value ?? 'null');
          if (
            typeof point !== 'object' ||
            point === null ||
            !('key' in point) ||
            typeof point.key !== 'string' ||
            key !== pointKey(version, point.key)
          )
            throw new Error('Pilgrimage record storage key mismatch');
          return point;
        });
        const points = schema.decode(version === schema.version ? data : schema.migrate(data, version));
        if (version !== schema.version) {
          // Keep the source untouched, even if the pointer write mutates then throws.
          // A restart selects the complete target or safely repeats source migration.
          replaceNamespace(encode(points), schema.version);
          writeVersion(String(schema.version));
        }
        loadError = null;
        return points;
      } catch (error) {
        loadError = 'Could not read pilgrimage records';
        console.warn('Could not read pilgrimage records:', error);
        return [];
      }
    },
    createRestoreWrite: (points: Point[]) => {
      readVersion();
      const next = encode(points);
      const previous = rawPoints(schema.version);
      const previousVersion = versionValue();
      const previousError = loadError;
      let attempted = false;
      return {
        write: () => {
          readVersion();
          attempted = true;
          replaceNamespace(next, schema.version);
          writeVersion(String(schema.version));
          loadError = null;
        },
        rollback: () => {
          if (!attempted) return;
          try {
            readVersion();
            replaceNamespace(previous, schema.version);
            writeVersion(previousVersion);
            loadError = previousError;
          } catch (error) {
            loadError = 'Pilgrimage record write and rollback failed';
            throw error;
          }
        },
      };
    },
    setRecords: (points: Point[], previousPoints: Point[]) => {
      const version = readVersion();
      if (loadError) throw new Error(loadError);
      if (version !== schema.version) throw new Error('Pilgrimage records must be loaded before writing');
      const previousByKey = new Map(previousPoints.map((point) => [point.key, point]));
      const nextKeys = new Set(points.map((point) => point.key));
      const next: Map<string, string | undefined> = encode(
        points.filter((point) => previousByKey.get(point.key) !== point),
      );
      for (const point of previousPoints) {
        if (!nextKeys.has(point.key)) next.set(pointKey(schema.version, point.key), undefined);
      }
      if (!next.size) return;
      // Legacy reads and no-op visits are side effect free.
      if (versionValue() === undefined) next.set(PILGRIMAGE_RECORD_VERSION_KEY, String(schema.version));
      const previous = new Map([...next.keys()].map((key) => [key, requireStorage().getString(key)] as const));
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
    },
  };
}
