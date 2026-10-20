import type { Bangumi, Point } from '@/services/types';

type IndexedBangumiPoints = {
  bangumi: Bangumi;
  pointsById: ReadonlyMap<string, Point>;
};

/** Create a lookup for one version of the input data, indexing only queried works. */
export function createBangumiPointLookup(bangumis: readonly Bangumi[]) {
  // Match the existing work lookup: the last work with a duplicate ID wins.
  const bangumiById = new Map(bangumis.map((bangumi) => [bangumi.id, bangumi]));
  const indexedBangumis = new Map<number, IndexedBangumiPoints>();

  return function getBangumiPoints(bangumiId: number): IndexedBangumiPoints | undefined {
    const indexed = indexedBangumis.get(bangumiId);
    if (indexed) return indexed;

    const bangumi = bangumiById.get(bangumiId);
    if (!bangumi) return undefined;

    const pointsById = new Map<string, Point>();
    for (const point of bangumi.points) {
      // Match Array.find: the first point with a duplicate ID wins.
      if (!pointsById.has(point.id)) pointsById.set(point.id, point);
    }
    const entry = { bangumi, pointsById };
    indexedBangumis.set(bangumiId, entry);
    return entry;
  };
}
