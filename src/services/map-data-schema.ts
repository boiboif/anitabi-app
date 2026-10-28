import type { RawGBangumi, RawGDetail } from '@/services/types';

export type MapDataIndex = {
  bangumis: RawGBangumi[];
  batchSize: number;
  modified: number;
  revision: string;
};

export class MapDataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapDataValidationError';
  }
}

function assertValid(condition: boolean, message: string): asserts condition {
  if (!condition) throw new MapDataValidationError(message);
}

function isBangumiId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isPointId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCoordinate(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
}

function getIndexedPointIds(bangumi: readonly unknown[]): Set<string> {
  const metadata = bangumi[12];
  // Older/empty index entries can omit metadata or use a zero/null sentinel.
  if (metadata == null || metadata === 0) return new Set();

  assertValid(Array.isArray(metadata) && metadata.length % 4 === 0, `Invalid point metadata for ${bangumi[0]}`);
  const ids = new Set<string>();
  for (let offset = 0; offset < metadata.length; offset += 4) {
    const id: unknown = metadata[offset];
    assertValid(isPointId(id) && !ids.has(id), `Invalid or duplicate indexed point for ${bangumi[0]}`);
    assertValid(
      isCoordinate(metadata[offset + 1], 90) &&
        isCoordinate(metadata[offset + 2], 180) &&
        typeof metadata[offset + 3] === 'number' &&
        Number.isFinite(metadata[offset + 3]),
      `Invalid point coordinates or priority for ${bangumi[0]}:${id}`,
    );
    ids.add(id);
  }
  return ids;
}

/** Validate only fields needed to identify, assemble and match the downloaded data. */
export function parseMapDataIndex(value: unknown): MapDataIndex {
  assertValid(Array.isArray(value) && value.length >= 3, 'Invalid map data index');
  const [bangumis, batchSize, modified] = value;
  assertValid(Array.isArray(bangumis), 'Invalid map work list');
  assertValid(isBangumiId(batchSize), 'Invalid map detail batch size');
  assertValid(isTimestamp(modified), 'Invalid map data version');

  const ids = new Set<number>();
  for (const entry of bangumis) {
    assertValid(Array.isArray(entry) && isBangumiId(entry[0]), 'Invalid indexed work');
    assertValid(!ids.has(entry[0]), `Duplicate indexed work ${entry[0]}`);
    assertValid(isCoordinate(entry[9], 90) && isCoordinate(entry[10], 180), `Invalid work coordinates for ${entry[0]}`);
    getIndexedPointIds(entry);
    ids.add(entry[0]);
  }

  return {
    bangumis: bangumis as RawGBangumi[],
    batchSize,
    modified,
    revision: JSON.stringify([modified, batchSize, bangumis.map((entry) => entry[0])]),
  };
}

/** Reject a shard that cannot supply every work and indexed point expected from it. */
export function parseMapDetailShard(value: unknown, expectedBangumis: RawGBangumi[]): RawGDetail[] {
  assertValid(Array.isArray(value), 'Invalid map detail shard');
  const expected = new Map<number, Set<string>>();
  for (const bangumi of expectedBangumis) {
    assertValid(isBangumiId(bangumi[0]) && !expected.has(bangumi[0]), 'Invalid expected map works');
    expected.set(bangumi[0], getIndexedPointIds(bangumi));
  }

  const completed = new Set<number>();
  for (const entry of value) {
    assertValid(Array.isArray(entry) && isBangumiId(entry[0]), 'Invalid map work detail');
    const id = entry[0];
    const indexedPointIds = expected.get(id);
    assertValid(indexedPointIds !== undefined && !completed.has(id), `Unexpected or duplicate work detail ${id}`);
    assertValid(
      Array.isArray(entry[2]) && isTimestamp(entry[3]),
      `Invalid point details or modification time for ${id}`,
    );

    const pointIds = new Set<string>();
    for (const point of entry[2]) {
      assertValid(
        Array.isArray(point) && isPointId(point[0]) && !pointIds.has(point[0]),
        `Invalid or duplicate point for ${id}`,
      );
      pointIds.add(point[0]);
    }
    for (const pointId of indexedPointIds) {
      assertValid(pointIds.has(pointId), `Missing point detail ${id}:${pointId}`);
    }
    completed.add(id);
  }
  assertValid(completed.size === expected.size, 'Map detail shard is missing expected works');
  return value as RawGDetail[];
}
