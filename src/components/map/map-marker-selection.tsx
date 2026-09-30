import type { MapPointReference } from '@/store/use-map-browse';
import { getUnselectedMapPointFilter } from '@/utils/map-point-style';
import { CircleLayer, SymbolLayer } from '@rnmapbox/maps';
import { createContext, useContext, useMemo, type ComponentProps } from 'react';

type MarkerFilter = ComponentProps<typeof SymbolLayer>['filter'];

// Keep the sources stable while removing the selected feature from rendering and hit testing.
export const MapMarkerSelectionContext = createContext<MapPointReference | null>(null);

function useSelectedPointFilter(filter: MarkerFilter): MarkerFilter {
  const selected = useContext(MapMarkerSelectionContext);
  const bangumiId = selected?.bangumiId;
  const pointId = selected?.pointId;
  // Keep the native layer filter stable across camera-driven renders.
  return useMemo(() => getUnselectedMapPointFilter(filter, bangumiId, pointId), [filter, bangumiId, pointId]);
}

export function SelectableCircleLayer({ filter, ...props }: ComponentProps<typeof CircleLayer>) {
  const selectedFilter = useSelectedPointFilter(filter);
  return <CircleLayer {...props} filter={selectedFilter} />;
}

export function SelectableSymbolLayer({ filter, ...props }: ComponentProps<typeof SymbolLayer>) {
  const selectedFilter = useSelectedPointFilter(filter);
  return <SymbolLayer {...props} filter={selectedFilter} />;
}
