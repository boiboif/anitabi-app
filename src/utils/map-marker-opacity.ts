/** Paint-only selection changes leave source data and symbol placement intact. */
export function getMapMarkerOpacity(selected?: { bangumiId: number; pointId: string } | null) {
  if (!selected) return 1;
  return [
    'case',
    ['all', ['==', ['get', 'bangumiId'], selected.bangumiId], ['==', ['get', 'id'], selected.pointId]],
    0,
    1,
  ] as const;
}
