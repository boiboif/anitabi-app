import { MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE } from '@/lib/constants';
import { baseUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { Images, ShapeSource, SymbolLayer } from '@rnmapbox/maps';
import { useMemo } from 'react';
import type { Bounds } from './map-container';

type Props = {
  bangumis: Bangumi[];
  zoom: number;
  bounds: Bounds | null;
};

/** 判断点位是否在可视区域内 */
function isInBounds(geo: [number, number], bounds: Bounds): boolean {
  const [lat, lng] = geo;
  const [swLng, swLat] = bounds.sw;
  const [neLng, neLat] = bounds.ne;
  return lat >= swLat && lat <= neLat && lng >= swLng && lng <= neLng;
}

export default function PointImageMarkers({ bangumis, zoom, bounds }: Props) {
  const visible = useMemo(() => {
    if (zoom < MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE || !bounds) return [];

    const items: { point: Point; imageUrl: string }[] = [];

    for (const b of bangumis) {
      for (const p of b.points) {
        if (!p.image) continue;
        if (p.geo[0] === 0 && p.geo[1] === 0) continue;
        if (!isInBounds(p.geo, bounds)) continue;
        items.push({
          point: p,
          imageUrl: `${baseUrl}${p.image}?plan=h160`,
        });
      }
    }

    return items;
  }, [bangumis, zoom, bounds]);

  const { imagesMap, geojson } = useMemo(() => {
    const images: Record<string, { uri: string }> = {};
    const features: GeoJSON.Feature[] = [];

    for (const item of visible) {
      const key = `point_img_${item.point.id}`;
      images[key] = { uri: item.imageUrl };
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [item.point.geo[1], item.point.geo[0]],
        },
        properties: {
          iconImage: key,
        },
      });
    }

    return {
      imagesMap: images,
      geojson: { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection,
    };
  }, [visible]);

  if (zoom < MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE || !bounds || visible.length === 0) return null;

  return (
    <>
      <Images images={imagesMap} />
      <ShapeSource id="point-images-source" shape={geojson}>
        <SymbolLayer
          id="point-images-layer"
          style={{
            iconImage: ['get', 'iconImage'],
            iconSize: 0.4,
            iconAllowOverlap: true,
            iconAnchor: 'bottom',
            iconOffset: [0, -16],
          }}
        />
      </ShapeSource>
    </>
  );
}