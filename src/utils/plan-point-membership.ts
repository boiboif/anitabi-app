type PointReference = { bangumiId: number; pointId: string };

export function getPlanPointMembership(items: readonly PointReference[]): string {
  const references = items.map((item) => [item.bangumiId, item.pointId] as const);
  // This is an internal membership key, not a display order. Compare IDs by code
  // unit: localeCompare constructs Java/ICU Collators on every Hermes comparison.
  references.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return JSON.stringify(references);
}
