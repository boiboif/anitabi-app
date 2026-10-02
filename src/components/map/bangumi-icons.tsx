import {
  MAP_BANGUMI_ICON_PRIORITY_ZOOM_STOPS,
  MAP_ICON_ZOOM_THRESHOLD,
  SELECTED_MAP_POINT_LAYER_ID,
} from '@/lib/constants';
import { getBangumiMapLabel } from '@/lib/localized-data';
import { logStartup, logStartupDuration, startupNow } from '@/lib/startup-timing';
import { getBangumiIcons } from '@/services/api';
import { baseUrl } from '@/services/handlers';
import type { Bangumi } from '@/services/types';
import { useMapBangumiFilter } from '@/store/use-map-bangumi-filter';
import { useMapBrowse } from '@/store/use-map-browse';
import { Images, ShapeSource, SymbolLayer } from '@rnmapbox/maps';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ComponentProps, memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// ===========================================================================
// Tunable constants
// ===========================================================================

const ICON_SCALE = 0.5;
const SPRITE_MAX_RETRIES = 3;
const PERSIST_CROPS_DELAY_MS = 1_200;
const CACHE_DIR = 'bangumi-icons';
const cacheDir = () => new Directory(Paths.document, CACHE_DIR);
const cacheFile = (name: string) => new File(cacheDir(), name);

type SpriteMeta = { ids: number[]; url: string; fingerprint?: string };

function cropDirectory(spriteMeta: SpriteMeta): Directory | null {
  if (!spriteMeta.fingerprint) return null;
  let idsHash = 2166136261;
  for (const id of spriteMeta.ids) {
    for (const char of `${id},`) idsHash = Math.imul(idsHash ^ char.charCodeAt(0), 16777619);
  }
  return new Directory(cacheDir(), 'crops', `${spriteMeta.fingerprint}-${(idsHash >>> 0).toString(16)}`);
}

function readCroppedIcons(spriteMeta: SpriteMeta): Map<number, string> | null {
  const dir = cropDirectory(spriteMeta);
  if (!dir?.exists) return null;
  const manifestFile = new File(dir, 'meta.json');
  if (!manifestFile.exists) return null;
  try {
    const manifest = JSON.parse(manifestFile.textSync()) as { fingerprint: string; ids: number[] };
    if (
      manifest.fingerprint !== spriteMeta.fingerprint ||
      !Array.isArray(manifest.ids) ||
      manifest.ids.length !== spriteMeta.ids.length ||
      manifest.ids.some((id, index) => id !== spriteMeta.ids[index])
    )
      return null;

    // The manifest is written only after every crop has been copied. Avoid
    // listing hundreds of files synchronously during startup.
    const lastIndex = spriteMeta.ids.length - 1;
    if (lastIndex >= 0 && (!new File(dir, '0.png').exists || !new File(dir, `${lastIndex}.png`).exists))
      return null;
    const uriPrefix = dir.uri.endsWith('/') ? dir.uri : `${dir.uri}/`;
    return new Map(spriteMeta.ids.map((id, index) => [id, `${uriPrefix}${index}.png`]));
  } catch {
    return null;
  }
}

async function persistCroppedIcons(spriteMeta: SpriteMeta, icons: Map<number, string>): Promise<void> {
  const dir = cropDirectory(spriteMeta);
  if (!dir) return;
  try {
    if (dir.exists) dir.delete();
    dir.create({ intermediates: true });
    for (let start = 0; start < spriteMeta.ids.length; start += 32) {
      const copies = await Promise.allSettled(
        spriteMeta.ids.slice(start, start + 32).map(async (id, offset) => {
          const uri = icons.get(id);
          if (!uri) throw new Error(`Missing cropped icon ${id}`);
          await new File(uri).copy(new File(dir, `${start + offset}.png`));
        }),
      );
      const failedCopy = copies.find((copy) => copy.status === 'rejected');
      if (failedCopy?.status === 'rejected') throw failedCopy.reason;
    }
    new File(dir, 'meta.json').write(JSON.stringify({ fingerprint: spriteMeta.fingerprint, ids: spriteMeta.ids }));
    logStartup('sprite-crop-cache-saved', { count: icons.size });
  } catch (error) {
    logStartup('sprite-crop-cache-save-error', { message: String(error) });
    try {
      if (dir.exists) dir.delete();
    } catch {}
  }
}

// Map style reloads unmount BangumiIcons. Keep completed (and in-flight) crops
// outside the component so remounting does not manipulate the same sprite again.
const croppedIconsCache = new Map<string, Promise<Map<number, string>>>();

function getCroppedIcons(spriteMeta: SpriteMeta) {
  const cacheKey = `${spriteMeta.fingerprint ?? spriteMeta.url}:${spriteMeta.ids.join(',')}`;
  const cached = croppedIconsCache.get(cacheKey);
  if (cached) return cached;

  const startedAt = startupNow();
  const persisted = readCroppedIcons(spriteMeta);
  if (persisted) {
    logStartupDuration('sprite-crop-cache-hit', startedAt, { count: persisted.size });
    const task = Promise.resolve(persisted);
    croppedIconsCache.set(cacheKey, task);
    return task;
  }

  logStartup('sprite-crop-start', { count: spriteMeta.ids.length });

  const crop = async (retries = 0): Promise<Map<number, string>> => {
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
      return new Map(results);
    } catch (err) {
      if (retries < SPRITE_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retries + 1) * 1000));
        return crop(retries + 1);
      }
      throw err;
    }
  };

  const task = crop()
    .then((result) => {
      logStartupDuration('sprite-crop-complete', startedAt, { count: result.size });
      // Disk copies should not compete with the first map frame.
      setTimeout(() => void persistCroppedIcons(spriteMeta, result), PERSIST_CROPS_DELAY_MS);
      return result;
    })
    .catch((err) => {
      logStartupDuration('sprite-crop-error', startedAt);
      // Let a later mount retry after a failed crop instead of caching a rejection.
      croppedIconsCache.delete(cacheKey);
      throw err;
    });
  croppedIconsCache.set(cacheKey, task);
  return task;
}

const BANGUMI_ICON_PRIORITY_FILTER = [
  'step',
  ['zoom'],
  ['>', ['get', 'priority'], MAP_BANGUMI_ICON_PRIORITY_ZOOM_STOPS[0][1]],
  ...MAP_BANGUMI_ICON_PRIORITY_ZOOM_STOPS.slice(1).flatMap(([zoom, priority]) => [
    zoom,
    ['>', ['get', 'priority'], priority],
  ]),
  MAP_ICON_ZOOM_THRESHOLD,
  true,
] as unknown as ComponentProps<typeof SymbolLayer>['filter'];

// ===========================================================================
// Component
// ===========================================================================

type Props = {
  bangumis: Bangumi[];
  onIconPress?: (bangumi: Bangumi) => void;
};

function BangumiIcons({ bangumis, onIconPress }: Props) {
  const { i18n } = useTranslation();
  const openedBangumiDetailsId = useMapBrowse((state) => state.openedBangumiDetailsId);
  const selectedMapBangumiIds = useMapBangumiFilter((state) => state.selectedBangumiIds);

  const [spriteMeta, setSpriteMeta] = useState<SpriteMeta | null>(null);
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
            setSpriteMeta({ ids: cached.ids.map(Number), url: cacheUrl, fingerprint: sprite.md5 ?? undefined });
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
          if (!cacheLoaded && !cancelled) {
            setSpriteMeta({ ids, url: target.contentUri ?? target.uri, fingerprint: target.md5 ?? undefined });
          }
        } catch {
          // A failed download can still use the remote sprite for this session.
          if (!cacheLoaded && !cancelled) setSpriteMeta({ ids, url });
        }
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
    getCroppedIcons(spriteMeta)
      .then((result) => {
        if (!cancelled) setIcons(result);
      })
      .catch((err) => {
        console.error('雪碧图加载/裁剪失败:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [spriteMeta]);

  // =====================================================================
  // 3. 按官网逻辑一次性组装 Mapbox 数据
  // =====================================================================

  const candidates = useMemo(() => {
    if (!allowedIds) return [];
    return bangumis.filter((b) => b.geo?.[0] && b.geo?.[1] && allowedIds.has(b.id));
  }, [bangumis, allowedIds]);

  const { imagesMap, geojson } = useMemo(() => {
    if (!icons) {
      return {
        imagesMap: {} as Record<string, { uri: string }>,
        geojson: { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection,
      };
    }

    const images: Record<string, { uri: string }> = {};
    const features: GeoJSON.Feature[] = [];

    for (const b of candidates) {
      const url = icons.get(b.id);
      if (!url) continue;
      const key = `icon_${b.id}`;
      const imagePointCount = b.points.filter((point) => point.image).length;
      images[key] = { uri: url };
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [b.geo[1], b.geo[0]] },
        properties: {
          iconImage: key,
          label: getBangumiMapLabel(b, i18n.resolvedLanguage),
          color: b.color || '#11b4da',
          bangumiId: b.id,
          priority: b.priority,
          order: 9_999_999_999_999 - b.modified - b.points.length * 60_000 - imagePointCount * 180_000,
        },
      });
    }

    return {
      imagesMap: images,
      geojson: { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection,
    };
  }, [candidates, i18n.resolvedLanguage, icons]);

  const handlePress = useCallback(
    (
      e: GeoJSON.FeatureCollection & {
        features?: (GeoJSON.Feature & { properties?: { bangumiId?: number } })[];
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

  if (!spriteMeta || !icons) return null;

  // 官网在作品详情或多作品筛选模式下隐藏整个作品 icon 图层。
  const bangumiIconFilter: ComponentProps<typeof SymbolLayer>['filter'] =
    openedBangumiDetailsId !== null || selectedMapBangumiIds.length > 0
      ? ['==', ['get', 'bangumiId'], -1]
      : BANGUMI_ICON_PRIORITY_FILTER;

  return (
    <>
      <Images images={imagesMap} />
      <ShapeSource id="bangumi-icons" shape={geojson} onPress={handlePress as any}>
        <SymbolLayer
          id="bangumi-icons-layer"
          belowLayerID={SELECTED_MAP_POINT_LAYER_ID}
          filter={bangumiIconFilter}
          maxZoomLevel={MAP_ICON_ZOOM_THRESHOLD}
          style={{
            iconImage: ['get', 'iconImage'],
            iconSize: ICON_SCALE,
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
            iconAnchor: 'center',
            symbolSortKey: ['get', 'order'],
            textField: ['get', 'label'],
            textFont: ['DIN Pro Bold', 'Arial Unicode MS Bold'],
            textColor: ['get', 'color'],
            textSize: 11,
            textMaxWidth: 7,
            textLineHeight: 1.1,
            textHaloColor: '#fff',
            textHaloWidth: 1,
            textHaloBlur: 0,
            textAllowOverlap: true,
            textIgnorePlacement: true,
            textOffset: [0, 1],
            textAnchor: 'top',
          }}
        />
      </ShapeSource>
    </>
  );
}

export default memo(BangumiIcons);
