import { FILTER_MODE_MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE, MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE } from '@/lib/constants';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { useSelectedBangumi } from '@/store/use-selected-bangumi';
import { Images, ShapeSource, SymbolLayer } from '@rnmapbox/maps';
import { useCallback, useMemo } from 'react';
import type { Bounds } from './map-container';

type Props = {
  bangumis: Bangumi[];
  zoom: number;
  bounds: Bounds | null;
  onPointSelect?: (point: Point, bangumi: Bangumi) => void;
};

/** 判断点位是否在可视区域内 */
function isInBounds(geo: [number, number], bounds: Bounds): boolean {
  const [lat, lng] = geo;
  const [swLng, swLat] = bounds.sw;
  const [neLng, neLat] = bounds.ne;
  return lat >= swLat && lat <= neLat && lng >= swLng && lng <= neLng;
}

export default function PointImageMarkers({ bangumis, zoom, bounds, onPointSelect }: Props) {
  const { selectedBangumi } = useSelectedBangumi();

  const zoomThreshold = useMemo(() => {
    return selectedBangumi ? FILTER_MODE_MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE : MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE;
  }, [zoom]);

  const visible = useMemo(() => {
    if (zoom < zoomThreshold || !bounds) return [];

    const items: { point: Point; bangumi: Bangumi; imageUrl: string }[] = [];

    for (const b of bangumis) {
      for (const p of b.points) {
        if (!p.image) continue;
        if (p.geo[0] === 0 && p.geo[1] === 0) continue;
        if (!isInBounds(p.geo, bounds)) continue;
        items.push({
          point: p,
          bangumi: b,
          imageUrl: buildImageUrl(p.image, 'plan=h160'),
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
          id: item.point.id,
          bangumiId: item.bangumi.id,
          iconImage: key,
        },
      });
    }

    return {
      imagesMap: images,
      geojson: { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection,
    };
  }, [visible]);

  /** 点击图片标记 → 查找完整点/番数据 → 弹出详情 */
  const handlePress = useCallback(
    (e: { features: GeoJSON.Feature[] }) => {
      const feature = e.features?.[0];
      if (!feature?.properties) return;
      const pointId = feature.properties.id as string | undefined;
      const bangumiId = feature.properties.bangumiId as number | undefined;
      if (!pointId || bangumiId == null) return;

      for (const b of bangumis) {
        if (b.id !== bangumiId) continue;
        for (const p of b.points) {
          if (p.id === pointId) {
            onPointSelect?.(p, b);
            return;
          }
        }
      }
    },
    [bangumis, onPointSelect],
  );

  if (zoom < zoomThreshold || !bounds || visible.length === 0) return null;

  return (
    <>
      <Images images={imagesMap} />
      <ShapeSource id="point-images-source" shape={geojson} onPress={handlePress}>
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
