import { getCachedMapTextColor } from '@/services/map-text-color';
import { useState } from 'react';

export type MapPlaceFeature = { layerId: string; feature: GeoJSON.Feature };

/** Sample once for each explicit map selection. Late cache fills must not recolor an open card. */
export function useMapPlaceColor(styleURL: string, mapFeature: MapPlaceFeature | undefined, zoom: number) {
  const sample = () => ({
    styleURL,
    mapFeature,
    zoom,
    color: mapFeature ? getCachedMapTextColor(styleURL, mapFeature.layerId, mapFeature.feature, zoom) : null,
  });
  const [result, setResult] = useState(sample);

  if (result.styleURL !== styleURL || result.mapFeature !== mapFeature || !Object.is(result.zoom, zoom)) {
    const next = sample();
    // React retries this component before committing, so a new target never
    // paints with the previous target's color or an intermediate fallback.
    setResult(next);
    return next.color;
  }

  return result.color;
}
