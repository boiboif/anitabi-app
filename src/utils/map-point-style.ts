import type { CircleLayer, SymbolLayer } from '@rnmapbox/maps';
import type { ComponentProps } from 'react';

type MapPointLayerFilter = ComponentProps<typeof SymbolLayer>['filter'];

/** Exclude the selected feature from both native rendering and source hit testing. */
export function getUnselectedMapPointFilter(
  filter: MapPointLayerFilter,
  bangumiId?: number,
  pointId?: string,
): MapPointLayerFilter {
  if (bangumiId === undefined || pointId === undefined) return filter;
  const unselected = ['any', ['!=', ['get', 'bangumiId'], bangumiId], ['!=', ['get', 'id'], pointId]] as const;
  return filter ? ['all', filter, unselected] : unselected;
}

/** Shared native zoom expressions keep the selected overlay exactly aligned with its underlying dot. */
export function getMapPointCircleStyle(maxVisualDiameter?: number): ComponentProps<typeof CircleLayer>['style'] {
  // Mapbox draws the stroke outside the radius: the maximum diameter is 2 * (16 + 6) = 44.
  const radiusCap = maxVisualDiameter === undefined ? Infinity : (maxVisualDiameter * 16) / 44;
  const strokeCap = maxVisualDiameter === undefined ? Infinity : (maxVisualDiameter * 6) / 44;
  return {
    circleSortKey: 90_001,
    circleColor: ['get', 'color'],
    circleRadius: [
      'interpolate',
      ['exponential', 1.75],
      ['zoom'],
      12,
      Math.min(4, radiusCap),
      18,
      Math.min(8, radiusCap),
      22,
      Math.min(16, radiusCap),
    ],
    circleStrokeWidth: [
      'interpolate',
      ['exponential', 1.75],
      ['zoom'],
      12,
      Math.min(1.5, strokeCap),
      18,
      Math.min(3, strokeCap),
      22,
      Math.min(6, strokeCap),
    ],
    circleStrokeColor: '#ffffff',
  };
}
