import { getBangumiIcons } from '@/services/api';
import { bangumiSpriteUrl } from '@/services/handlers';
import type { Bangumi } from '@/services/types';
import { Images, ShapeSource, SymbolLayer } from '@rnmapbox/maps';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ===========================================================================
// Tunable constants — adjust these freely
// ===========================================================================

/** zoom >= 此值时完全隐藏所有 icon（地图足够放大后靠 marker 展示） */
const ICON_HIDE_ZOOM = 11.5;

/** 图标图片的基础像素尺寸（宽度），作为重叠阈值基准 */
const ICON_BASE_SIZE = 60;

const ICON_SCALE = 0.5;

/** 重叠阈值倍率：实际阈值 = ICON_BASE_SIZE * ICON_SCALE * OVERLAP_MULTIPLIER */
const OVERLAP_MULTIPLIER = 1.2;

/** 雪碧图加载最大重试次数 */
const SPRITE_MAX_RETRIES = 3;

// ===========================================================================
// Helpers
// ===========================================================================

/** Web Mercator 近似：计算两点在给定 zoom 下的像素距离
 *
 * 注意：Mapbox GL 使用 512px 的 tile，分辨率公式比 256px tile 小一倍（/ 2）。
 * 如果不调整，像素距离会被低估约 2x，导致重叠检测过度激进。
 */
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
 *
 * 核心规则：一个 item 只要与任何一个 priority 更高的 item 在像素上重叠，
 * 就跳过它（不绘制）。注意这里不是只和「已被选中的」item 比较，而是和
 * sorted 中所有排在它前面的 item 比较——因为一个高 priority 的 item 可能
 * 因与更高 priority 重叠而被跳过，但低 priority 的 item 仍需避开它。
 *
 * 单调性保证（通过 ref 追踪上一帧 zoom 与可见集）：
 * - zoom 增大（放大）：上一帧可见的 icon 强制保留，再贪心补充新的
 * - zoom 减小（缩小）：重新贪心，低 priority 的 icon 在重叠时自然消失
 *
 * 这确保了：地图放大过程中已绘制的 icon 不会闪烁消失。
 */
function selectVisible(
  candidates: Bangumi[],
  zoom: number,
  prevZoom: number | null,
  prevVisibleIds: Set<number>,
): { visible: Bangumi[]; visibleIds: Set<number> } {
  const thresholdPx = ICON_BASE_SIZE * ICON_SCALE * OVERLAP_MULTIPLIER;
  const sorted = [...candidates].sort((a, b) => (b.priority ?? -Infinity) - (a.priority ?? -Infinity));

  const isZoomingIn = prevZoom !== null && zoom > prevZoom;

  if (!isZoomingIn) {
    // 缩小 / 首帧：比较与所有更高 priority item 是否重叠（不仅是已选中的）
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
    return { visible: picked, visibleIds: new Set(picked.map((x) => x.id)) };
  }

  // 放大：强制保留上一帧可见的 icon，其余按 priority 检查与所有更高 priority item
  const mustIncludeIds = new Set(prevVisibleIds);
  const picked: Bangumi[] = [];
  const pickedIds = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const [lat, lng] = item.geo;

    if (mustIncludeIds.has(item.id)) {
      picked.push(item);
      pickedIds.add(item.id);
      continue;
    }

    let overlaps = false;
    for (let j = 0; j < i; j++) {
      if (pixelDistance(lat, lng, sorted[j].geo[0], sorted[j].geo[1], zoom) < thresholdPx) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) {
      picked.push(item);
      pickedIds.add(item.id);
    }
  }

  return { visible: picked, visibleIds: pickedIds };
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
  // 1. 从 API 获取需要显示 icon 的番剧 ID 列表
  const [allowedIds, setAllowedIds] = useState<Set<number> | null>(null);
  const [allowedIdsList, setAllowedIdsList] = useState<number[]>([]);
  const [spriteCache, setSpriteCache] = useState<Map<number, string> | null>(null);

  useEffect(() => {
    getBangumiIcons()
      .then((resp) => {
        const ids = resp.ids.map(Number);
        setAllowedIds(new Set(ids));
        setAllowedIdsList(ids);
      })
      .catch((err) => {
        console.error('获取有图标的番剧列表失败:', err);
      });
  }, []);

  // 2. 下载雪碧图并裁剪所有 icon（失败时指数退避重试）
  useEffect(() => {
    if (!allowedIdsList.length) return;
    let cancelled = false;
    let retries = 0;
    const spriteUrl = bangumiSpriteUrl;

    const loadSprite = async () => {
      try {
        const results = await Promise.all(
          allowedIdsList.map(async (id, i) => {
            const row = Math.floor(i / 20);
            const col = i % 20;
            const result = await ImageManipulator.manipulate(spriteUrl)
              .crop({ originX: col * 60, originY: row * 60, width: 60, height: 60 })
              .renderAsync()
              .then((image) => image.saveAsync({ compress: 1, format: SaveFormat.PNG }));
            return [id, result.uri] as const;
          }),
        );
        if (!cancelled) setSpriteCache(new Map(results));
      } catch (err) {
        console.error('雪碧图加载/裁剪失败:', err);
        if (!cancelled && retries < SPRITE_MAX_RETRIES) {
          retries++;
          const delay = Math.pow(2, retries) * 1000;
          setTimeout(loadSprite, delay);
        }
      }
    };

    loadSprite();

    return () => {
      cancelled = true;
    };
  }, [allowedIdsList]);

  // 3. 过滤 + 重叠处理（带单调性保证）
  const prevZoomRef = useRef<number | null>(null);
  const prevVisibleIdsRef = useRef<Set<number>>(new Set());

  const visible = useMemo(() => {
    if (!allowedIds) {
      prevZoomRef.current = null;
      prevVisibleIdsRef.current = new Set();
      return [];
    }

    const candidates = bangumis.filter((b) => b.icon && b.cn && allowedIds.has(b.id));

    const result = selectVisible(candidates, zoom, prevZoomRef.current, prevVisibleIdsRef.current);

    prevZoomRef.current = zoom;
    prevVisibleIdsRef.current = result.visibleIds;
    return result.visible;
  }, [bangumis, allowedIds, zoom]);

  const { imagesMap, geojson } = useMemo(() => {
    if (!spriteCache) {
      return {
        imagesMap: {},
        geojson: { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection,
      };
    }

    const images: Record<string, { uri: string }> = {};
    const features: GeoJSON.Feature[] = [];

    for (const b of visible) {
      const url = spriteCache.get(b.id);
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
  }, [visible, spriteCache]);

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

  if (zoom >= ICON_HIDE_ZOOM || !allowedIds || !spriteCache) return null;

  return (
    <>
      <Images images={imagesMap} />
      <ShapeSource id="bangumi-icons" shape={geojson} onPress={handlePress as any}>
        <SymbolLayer
          id="bangumi-icons-layer"
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
