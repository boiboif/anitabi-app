import { MAP_ICON_ZOOM_THRESHOLD } from '@/lib/constants';
import { getBangumiIcons } from '@/services/api';
import { baseUrl } from '@/services/handlers';
import type { Bangumi } from '@/services/types';
import { useSelectedBangumi } from '@/store/use-selected-bangumi';
import { Images, ShapeSource, SymbolLayer } from '@rnmapbox/maps';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ComponentProps, useCallback, useEffect, useMemo, useState } from 'react';

// ===========================================================================
// Tunable constants
// ===========================================================================

const ICON_BASE_SIZE = 60;
const ICON_SCALE = 0.5;
const OVERLAP_MULTIPLIER = 1.2;
const SPRITE_MAX_RETRIES = 3;

// ===========================================================================
// Cache helpers
// ===========================================================================

const CACHE_DIR = 'bangumi-icons';
const cacheDir = () => new Directory(Paths.document, CACHE_DIR);
const cacheFile = (name: string) => new File(cacheDir(), name);

// ===========================================================================
// Helpers
// ===========================================================================

/** Web Mercator 近似：两点在给定 zoom 下的像素距离 */
function pixelDistance(lat1: number, lng1: number, lat2: number, lng2: number, zoom: number): number {
  const avgLat = ((lat1 + lat2) / 2) * (Math.PI / 180);
  const cosLat = Math.cos(avgLat) || 1e-4;
  const mPerDeg = 111_320;
  const dx = (lng1 - lng2) * mPerDeg * cosLat;
  const dy = (lat1 - lat2) * mPerDeg;
  const meters = Math.sqrt(dx * dx + dy * dy);
  const resolution = (156_543.03 * cosLat) / Math.pow(2, zoom) / 2;
  return meters / Math.max(resolution, 1);
}

/**
 * 按 priority 降序挑选互不重叠的 icon。
 * 一个 item 与任一更高 priority 的 item 在像素上重叠即跳过。
 */
function selectVisible(candidates: Bangumi[], zoom: number): Bangumi[] {
  const thresholdPx = ICON_BASE_SIZE * ICON_SCALE * OVERLAP_MULTIPLIER;
  const sorted = [...candidates].sort((a, b) => (b.priority ?? -Infinity) - (a.priority ?? -Infinity));

  const picked: Bangumi[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const [lat, lng] = item.geo;
    let overlaps = false;
    for (let j = 0; j < i; j++) {
      if (pixelDistance(lat, lng, sorted[j].geo[0], sorted[j].geo[1], zoom) < thresholdPx) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) picked.push(item);
  }
  return picked;
}

// ===========================================================================
// Component
// ===========================================================================

type Props = {
  bangumis: Bangumi[];
  zoom: number;
  onIconPress?: (bangumi: Bangumi) => void;
};

export default function BangumiIcons({ bangumis, zoom, onIconPress }: Props) {
  const { selectedBangumi } = useSelectedBangumi();

  const [spriteMeta, setSpriteMeta] = useState<{
    ids: number[];
    url: string;
  } | null>(null);
  const [icons, setIcons] = useState<Map<number, string> | null>(null);

  // 从 spriteMeta 衍生允许显示的 id 集合
  const allowedIds = useMemo(() => (spriteMeta ? new Set(spriteMeta.ids) : null), [spriteMeta]);

  // =====================================================================
  // 1. 获取雪碧图来源（缓存优先，后台静默更新远程）
  // =====================================================================

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // 优先从本地缓存加载，无网时也能立即显示
      let cacheLoaded = false;
      try {
        const metaFile = cacheFile('meta.json');
        const sprite = cacheFile('sprite.png');
        if (metaFile.exists && sprite.exists) {
          const cached = JSON.parse(metaFile.textSync());
          if (!cancelled) {
            const cacheUrl = sprite.contentUri ?? sprite.uri;
            console.log('[bangumi-icons] 缓存命中, size:', sprite.size, 'url:', cacheUrl);
            setSpriteMeta({ ids: cached.ids.map(Number), url: cacheUrl });
            cacheLoaded = true;
          }
        } else {
          console.warn('[bangumi-icons] 缓存不存在, meta:', metaFile.exists, 'sprite:', sprite.exists);
        }
      } catch (e) {
        console.warn('[bangumi-icons] 缓存读取异常:', e);
      }

      // 后台从远程获取最新数据，成功后更新缓存
      // 注意：缓存已加载时不要覆盖 spriteMeta（本地 contentUri），
      // 否则 crop 会尝试用远程 URL 裁剪，离线时必然失败。

      try {
        const resp = await getBangumiIcons();
        if (cancelled) return;
        const ids = resp.ids.map(Number);
        const url = `${baseUrl}${resp.src}`;
        if (!cacheLoaded) {
          setSpriteMeta({ ids, url });
        }

        // 更新本地缓存（先写临时文件再原子替换）
        try {
          const dir = cacheDir();
          if (!dir.exists) dir.create();
          const tmp = cacheFile('sprite.tmp');
          if (tmp.exists) tmp.delete();
          await File.downloadFileAsync(url, tmp);
          const target = cacheFile('sprite.png');
          if (target.exists) target.delete();
          tmp.rename('sprite.png');
          cacheFile('meta.json').write(JSON.stringify({ ids: resp.ids }));
        } catch {}
      } catch (err) {
        if (!cancelled) {
          const metaFile = cacheFile('meta.json');
          const sprite = cacheFile('sprite.png');
          if (!metaFile.exists || !sprite.exists) {
            console.error('[bangumi-icons] 缓存不存在且远程获取失败:', err);
          } else {
            console.log(
              '[bangumi-icons] 远程获取失败，使用缓存, meta存在:',
              metaFile.exists,
              'sprite存在:',
              sprite.exists,
              'sprite大小:',
              sprite.size,
            );
          }
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // =====================================================================
  // 2. 从雪碧图中裁剪出每个番剧的独立图标
  // =====================================================================

  useEffect(() => {
    if (!spriteMeta) return;
    let cancelled = false;
    let retries = 0;

    const crop = async () => {
      console.log('[bangumi-icons] crop 开始, url:', spriteMeta.url, 'ids count:', spriteMeta.ids.length);
      try {
        const results = await Promise.all(
          spriteMeta.ids.map(async (id, i) => {
            const row = Math.floor(i / 20);
            const col = i % 20;
            const { uri } = await ImageManipulator.manipulate(spriteMeta.url)
              .crop({ originX: col * 60, originY: row * 60, width: 60, height: 60 })
              .renderAsync()
              .then((img) => img.saveAsync({ compress: 1, format: SaveFormat.PNG }));
            return [id, uri] as const;
          }),
        );
        if (!cancelled) setIcons(new Map(results));
      } catch (err) {
        console.error('雪碧图加载/裁剪失败:', err);
        if (!cancelled && retries < SPRITE_MAX_RETRIES) {
          retries++;
          setTimeout(crop, Math.pow(2, retries) * 1000);
        }
      }
    };

    crop();
    return () => {
      cancelled = true;
    };
  }, [spriteMeta]);

  // =====================================================================
  // 3. 重叠过滤 + 组装 Mapbox 数据
  // =====================================================================

  const visible = useMemo(() => {
    if (!allowedIds) return [];
    const candidates = bangumis.filter((b) => b.cn && allowedIds.has(b.id));
    return selectVisible(candidates, zoom);
  }, [bangumis, allowedIds, zoom]);

  const { imagesMap, geojson } = useMemo(() => {
    if (!icons) {
      return {
        imagesMap: {},
        geojson: { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection,
      };
    }

    const images: Record<string, { uri: string }> = {};
    const features: GeoJSON.Feature[] = [];

    for (const b of visible) {
      const url = icons.get(b.id);
      if (!url) continue;
      const key = `icon_${b.id}`;
      images[key] = { uri: url };
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [b.geo[1], b.geo[0]] },
        properties: {
          iconImage: key,
          label: b.cn,
          color: b.color ?? '#000',
          bangumiId: b.id,
        },
      });
    }

    return {
      imagesMap: images,
      geojson: { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection,
    };
  }, [visible, icons]);

  const handlePress = useCallback(
    (
      e: GeoJSON.FeatureCollection & {
        features?: Array<GeoJSON.Feature & { properties?: { bangumiId?: number } }>;
      },
    ) => {
      const feature = (e as any).features?.[0];
      if (feature?.properties?.bangumiId != null) {
        const b = bangumis.find((x) => x.id === feature.properties.bangumiId);
        if (b) onIconPress?.(b);
      }
    },
    [bangumis, onIconPress],
  );

  if (zoom >= MAP_ICON_ZOOM_THRESHOLD || !spriteMeta || !icons) return null;

  // 筛选模式下在底层隐藏所有 icon（保留图层结构）
  const bangumiIconFilter: ComponentProps<typeof SymbolLayer>['filter'] = selectedBangumi
    ? ['==', ['get', 'bangumiId'], -1]
    : undefined;

  return (
    <>
      <Images images={imagesMap} />
      <ShapeSource id="bangumi-icons" shape={geojson} onPress={handlePress as any}>
        <SymbolLayer
          id="bangumi-icons-layer"
          filter={bangumiIconFilter}
          style={{
            iconImage: ['get', 'iconImage'],
            iconSize: ICON_SCALE,
            iconAllowOverlap: true,
            iconAnchor: 'bottom',
            textField: ['get', 'label'],
            textColor: ['get', 'color'],
            textSize: 10,
            textMaxWidth: 8,
            textLineHeight: 1.2,
            textHaloColor: '#fff',
            textHaloWidth: 1,
            textAllowOverlap: true,
            textOptional: true,
            textOffset: [0, 0],
            textAnchor: 'top',
          }}
        />
      </ShapeSource>
    </>
  );
}
