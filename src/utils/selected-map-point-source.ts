import type { Bangumi, Point } from '../services/types';

export type SelectedMapPointData = { point: Point; bangumi: Bangumi };

/** Selection updates serialize at most one feature, independent of the ordinary marker dataset. */
export function getSelectedMapPointSource(selected?: SelectedMapPointData | null): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (selected) {
    const { point, bangumi } = selected;
    const [latitude, longitude] = point.geo;
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0)) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [longitude, latitude] },
        properties: { id: point.id, bangumiId: bangumi.id, color: bangumi.color },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
