import type { MapPointReference } from '@/store/use-map-browse';
import { getMapMarkerOpacity } from '@/utils/map-marker-opacity';
import { CircleLayer, SymbolLayer } from '@rnmapbox/maps';
import { createContext, useContext, type ComponentProps } from 'react';

// Only the paint layers consume selection. Their parent ShapeSources do not need
// to render/serialize the full dataset when selection changes.
export const MapMarkerSelectionContext = createContext<MapPointReference | null>(null);

export function SelectableCircleLayer({ style, ...props }: ComponentProps<typeof CircleLayer>) {
  const opacity = getMapMarkerOpacity(useContext(MapMarkerSelectionContext));
  return (
    <CircleLayer
      {...props}
      style={{
        ...style,
        circleOpacity: opacity,
        circleStrokeOpacity: opacity,
        circleOpacityTransition: { duration: 0, delay: 0 },
        circleStrokeOpacityTransition: { duration: 0, delay: 0 },
      }}
    />
  );
}

export function SelectableSymbolLayer({ style, ...props }: ComponentProps<typeof SymbolLayer>) {
  const opacity = getMapMarkerOpacity(useContext(MapMarkerSelectionContext));
  return (
    <SymbolLayer
      {...props}
      style={{ ...style, iconOpacity: opacity, iconOpacityTransition: { duration: 0, delay: 0 } }}
    />
  );
}
