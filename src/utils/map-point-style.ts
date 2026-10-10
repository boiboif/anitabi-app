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
  // The original maximum diameter, including the outside stroke, is 2 * (16 + 6) = 44px.
  const maxDiameter = maxVisualDiameter ?? 24;
  const radiusCap = (maxDiameter * 16) / 44;
  const strokeCap = (maxDiameter * 6) / 44;
  // End the home interpolation where the original curve reaches 24px, then hold its size.
  // Moving only the final value at zoom 22 would also slow growth before reaching the cap.
  // Explicit caps preserve the plan map's existing curve.
  const maxSizeZoom =
    maxVisualDiameter === undefined
      ? 18 + Math.log(1 + ((radiusCap - 8) / (16 - 8)) * (1.75 ** (22 - 18) - 1)) / Math.log(1.75)
      : 22;
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
      maxSizeZoom,
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
      maxSizeZoom,
      Math.min(6, strokeCap),
    ],
    circleStrokeColor: '#ffffff',
  };
}
