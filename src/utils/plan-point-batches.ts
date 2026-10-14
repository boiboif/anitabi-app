import type { Bangumi, Point } from '@/services/types';

export type PlanPointEntry = { point: Point; bangumi: Bangumi };

export type PointGroup = {
  key: string;
  title: string;
  data: Point[];
};

/** Preserve the existing detail display: fid collections take precedence over folder sections. */
export function groupPointsForDetails(
  points: Point[],
  ungroupedLabel: string,
  unnamedCollectionLabel: string,
): PointGroup[] {
  const collections = new Map<string, { title: string; data: Point[] }>();
  for (const point of points) {
    if (!point.isFolder) continue;
    // Some upstream names are numbers; the existing detail view skips those as group titles.
    const name = typeof point.name === 'string' ? point.name : '';
    collections.set(point.id, {
      title: name || point.folder || point.cn || unnamedCollectionLabel,
      data: [point],
    });
  }

  const folders = new Map<string, Point[]>();
  const ungrouped: Point[] = [];
  for (const point of points) {
    if (point.isFolder) continue;
    const collection = point.fid ? collections.get(point.fid) : undefined;
    if (collection) {
      collection.data.push(point);
    } else if (point.folder) {
      const group = folders.get(point.folder) ?? [];
      group.push(point);
      folders.set(point.folder, group);
    } else {
      ungrouped.push(point);
    }
  }

  return [
    ...(ungrouped.length ? [{ key: 'folder-bangumi', title: ungroupedLabel, data: ungrouped }] : []),
    ...[...collections.entries()]
      .sort(([, a], [, b]) => a.title.localeCompare(b.title))
      .map(([id, group]) => ({ key: `pilgrimage-${id}`, ...group })),
    ...[...folders.keys()]
      .sort()
      .map((folder) => ({ key: `folder-${folder}`, title: folder, data: folders.get(folder)! })),
  ];
}
