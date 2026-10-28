import {
  commitCachedMapData,
  getCachedData,
  getGModified,
  getMapCacheGeneration,
  getStagedMapDetail,
  isMapCacheGenerationCurrent,
  prepareMapDownload,
  setStagedMapDetail,
  subscribeMapCacheInvalidation,
} from '@/lib/map-storage';
import i18n from '@/i18n';
import { getGDetailJSON, getGJSON } from '@/services/api';
import { MapDataValidationError, parseMapDataIndex, parseMapDetailShard, type MapDataIndex } from './map-data-schema';
import type { AssembledData, Bangumi, FetchProgress, Point, RawGBangumi, RawGDetail, Theme } from '@/services/types';

// ---------------------------------------------------------------------------
// Helpers：将原始数组转为业务对象
// ---------------------------------------------------------------------------

const toTheme = (input: unknown): Theme => {
  if (!Array.isArray(input)) {
    return { src: '', ids: [], modified: 0, w: 0, h: 0 };
  }
  const [src, ids, modified, w, h] = input;
  return {
    src: src ?? '',
    ids: Array.isArray(ids) ? ids : [],
    modified: typeof modified === 'number' ? modified : 0,
    w: typeof w === 'number' ? w : 0,
    h: typeof h === 'number' ? h : 0,
  };
};

const toPoint = (input: unknown): Omit<Point, 'geo' | 'priority'> => {
  if (!Array.isArray(input)) {
    return { id: '', cn: '', isFolder: false };
  }
  const [id, name, cn, isFolder, mid, uid, image, fid, ep, s, mark, origin, originLink, folder, density] = input;
  return {
    id,
    name: name || undefined,
    cn: typeof cn === 'number' ? '' : String(cn ?? ''),
    isFolder: isFolder !== 0,
    mid: mid ? String(mid) : undefined,
    uid: uid || undefined,
    image: image || undefined,
    fid: fid ? String(fid) : undefined,
    ep: ep ?? undefined,
    s: s ? Number(s) : undefined,
    mark: mark || undefined,
    origin: origin ? String(origin) : undefined,
    originLink: originLink ? String(originLink) : undefined,
    folder: folder || undefined,
    density: density || undefined,
  };
};

// ---------------------------------------------------------------------------
// 组装：将 g.json 信息与分片详情合并
// ---------------------------------------------------------------------------

function assembleBangumis(gList: RawGBangumi[], detailMap: Map<number, RawGDetail>): AssembledData {
  let maxModified = 0;

  const bangumis: Bangumi[] = gList.map((item) => {
    const [
      id,
      cn,
      en,
      title,
      city,
      color,
      cover,
      fade,
      cat,
      lat,
      lng,
      zoom,
      pointMeta,
      abbr,
      tags,
      priority,
      icon,
      tAbbr,
    ] = item;
    const detail = detailMap.get(id);

    // 从 pointMeta 构建所有点位 geo/priority 索引
    // pointMeta 是扁平数组: [id, lat, lng, priority, id, lat, lng, priority, ...]
    const pointLookup: Record<string, { geo: [number, number]; priority: number }> = {};
    if (Array.isArray(pointMeta)) {
      for (let i = 0; i < pointMeta.length; i += 4) {
        const pid = pointMeta[i] as string;
        const plat = pointMeta[i + 1] as number;
        const plng = pointMeta[i + 2] as number;
        const ppriority = pointMeta[i + 3] as number;
        pointLookup[pid] = { geo: [plat, plng], priority: ppriority };
      }
    }

    const theme: Theme = detail ? toTheme(detail[1]) : { src: '', ids: [], modified: 0, w: 0, h: 0 };
    const rawPoints = detail && Array.isArray(detail[2]) ? detail[2] : [];

    const points: Point[] = rawPoints.map((rp: unknown) => {
      const base = toPoint(rp);
      const meta = pointLookup[base.id];
      return {
        ...base,
        geo: meta?.geo ?? ([0, 0] as [number, number]),
        priority: meta?.priority ?? 0,
      };
    });

    if (detail) {
      const m = detail[3];
      if (m > maxModified) maxModified = m;
    }

    return {
      id,
      cn: cn || '',
      en: typeof en === 'number' ? '' : en || '',
      title: title || '',
      city: city || '',
      color: color || '',
      cover: cover || '',
      fade: fade ?? 0,
      cat: cat || '',
      geo: [lat, lng] as [number, number],
      zoom: zoom ?? 0,
      modified: detail?.[3] ?? 0,
      points,
      theme,
      abbr: abbr ? String(abbr) : '',
      tAbbr: tAbbr ? String(tAbbr) : '',
      tags: Array.isArray(tags) ? tags : [],
      // 官网保留缺失 priority 的状态；为其填默认值会改变 zoom filter 的显隐结果。
      priority: priority ?? undefined,
      icon: icon || '',
    };
  });

  bangumis.sort((a, b) => b.modified - a.modified);

  return {
    data: { bangumis, modified: maxModified },
  };
}

// ---------------------------------------------------------------------------
// 主入口：获取或刷新数据，通过回调报告进度
// ---------------------------------------------------------------------------

const REQUEST_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const DOWNLOAD_CONCURRENCY = 3;

export { getMapCacheGeneration as getMapDataGeneration } from '@/lib/map-storage';
export { subscribeMapCacheInvalidation as subscribeMapDataInvalidation } from '@/lib/map-storage';

export class MapDataCancelledError extends Error {
  constructor() {
    super('Map data refresh was invalidated');
    this.name = 'AbortError';
  }
}

export class MapDataDownloadError extends Error {
  readonly failedShards: number[];

  constructor(failedShards: number[]) {
    super(i18n.t('mapDataIncomplete'));
    this.name = 'MapDataDownloadError';
    this.failedShards = failedShards;
  }
}

export type MapDataRefreshResult = {
  data: AssembledData;
  cachePersisted: boolean;
};

export type MapDataRefreshOptions = {
  signal?: AbortSignal;
};

function assertCurrent(generation: number, signal: AbortSignal): void {
  if (signal.aborted || !isMapCacheGenerationCurrent(generation)) throw new MapDataCancelledError();
}

/** Stop waiting even if a transport ignores its signal and returns a late result. */
function awaitRequest<T>(request: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(new MapDataCancelledError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    request.then(
      (result) => {
        signal.removeEventListener('abort', onAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
  });
}

function waitForRetry(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new MapDataCancelledError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delay);
  });
}

function canRetry(error: unknown): boolean {
  if (error instanceof MapDataValidationError || error instanceof SyntaxError) return true;
  const requestError = error as { code?: string; name?: string; response?: { status?: number } } | null;
  if (requestError?.name === 'AbortError' || requestError?.code === 'ERR_CANCELED') return false;
  const status = requestError?.response?.status;
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

async function withRetry<T>(
  request: (attempt: number) => Promise<T>,
  generation: number,
  signal: AbortSignal,
  onRetry?: () => void,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    assertCurrent(generation, signal);
    try {
      const result = await awaitRequest(request(attempt), signal);
      assertCurrent(generation, signal);
      return result;
    } catch (error) {
      assertCurrent(generation, signal);
      if (attempt + 1 >= REQUEST_ATTEMPTS || !canRetry(error)) throw error;
      onRetry?.();
      // Bounded exponential backoff with jitter avoids synchronized retries on a weak connection.
      await waitForRetry(500 * 2 ** attempt * (0.5 + Math.random()), signal);
    }
  }
}

async function fetchIndex(generation: number, signal: AbortSignal, onRetry?: () => void): Promise<MapDataIndex> {
  return withRetry(
    async () =>
      parseMapDataIndex(
        await getGJSON({ signal, timeout: REQUEST_TIMEOUT_MS, suppressErrorToast: true, bypassCache: true }),
      ),
    generation,
    signal,
    onRetry,
  );
}

function isCachedDataComplete(cached: AssembledData, index: MapDataIndex): boolean {
  const byId = new Map(cached.data.bangumis.map((bangumi) => [bangumi.id, bangumi]));
  if (byId.size !== index.bangumis.length) return false;
  return index.bangumis.every((raw) => {
    const bangumi = byId.get(raw[0]);
    if (!bangumi || !Array.isArray(bangumi.points)) return false;
    if (!Array.isArray(raw[12])) return true;
    const pointIds = new Set(bangumi.points.map((point) => point?.id));
    for (let offset = 0; offset < raw[12].length; offset += 4) {
      if (!pointIds.has(raw[12][offset] as string)) return false;
    }
    return true;
  });
}

/** 读取持久化缓存，不发起网络请求。 */
export function getCachedMapData(): AssembledData | null {
  return getCachedData();
}

/** Old split-key caches have no reliable completeness marker. */
export function isCachedMapDataVerified(): boolean {
  return getGModified() !== null;
}

/**
 * 检查远端版本并返回当前最新数据。
 *
 * 调用方负责决定何时刷新，以及如何把刷新结果同步到 UI。这样缓存更新
 * 不会发生在页面订阅范围之外。
 */
export async function refreshMapData(
  cachedData: AssembledData | null,
  onProgress?: (p: FetchProgress) => void,
  options: MapDataRefreshOptions = {},
): Promise<MapDataRefreshResult> {
  const generation = getMapCacheGeneration();
  const controller = new AbortController();
  const unsubscribe = subscribeMapCacheInvalidation(() => controller.abort());
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    assertCurrent(generation, controller.signal);
    onProgress?.({ phase: 'checking', message: i18n.t('checkingForDataUpdates', { defaultValue: '检查数据更新…' }) });
    const index = await fetchIndex(generation, controller.signal, () => {
      onProgress?.({ phase: 'checking', message: i18n.t('mapDataReconnecting') });
    });
    assertCurrent(generation, controller.signal);
    if (
      cachedData &&
      cachedData === getCachedData() &&
      index.modified === getGModified() &&
      isCachedDataComplete(cachedData, index)
    ) {
      return { data: cachedData, cachePersisted: true };
    }
    // An empty response during an upstream outage must not erase an existing map.
    if (cachedData?.data.bangumis.length && index.bangumis.length === 0) {
      throw new MapDataValidationError('The map index unexpectedly contains no works');
    }
    return await fetchDetails(index, generation, controller.signal, onProgress);
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    unsubscribe();
  }
}

async function fetchDetails(
  index: MapDataIndex,
  generation: number,
  signal: AbortSignal,
  onProgress?: (p: FetchProgress) => void,
): Promise<MapDataRefreshResult> {
  const total = Math.ceil(index.bangumis.length / index.batchSize);
  const detailMap = new Map<number, RawGDetail>();
  const pending: number[] = [];
  const failed: number[] = [];
  let completed = 0;

  assertCurrent(generation, signal);
  prepareMapDownload(index.revision, generation);

  const reportProgress = (retrying = false) => {
    assertCurrent(generation, signal);
    onProgress?.({
      phase: 'downloading',
      batch: completed,
      total,
      message: i18n.t(retrying ? 'retryingMapData' : 'loadingDataCurrentTotal', {
        current: completed,
        total,
      }),
    });
  };
  const acceptShard = (raw: RawGDetail[]) => {
    for (const detail of raw) detailMap.set(detail[0], detail);
    completed++;
  };
  const getExpected = (shard: number) => index.bangumis.slice(shard * index.batchSize, (shard + 1) * index.batchSize);

  // Only validated shards from this exact index may be reused after a retry or restart.
  for (let shard = 0; shard < total; shard++) {
    assertCurrent(generation, signal);
    const staged = getStagedMapDetail(index.revision, shard);
    try {
      if (!staged) throw new MapDataValidationError('No staged shard');
      acceptShard(parseMapDetailShard(staged, getExpected(shard)));
    } catch {
      pending.push(shard);
    }
  }
  reportProgress();

  let nextShard = 0;
  const worker = async () => {
    while (nextShard < pending.length) {
      assertCurrent(generation, signal);
      const shard = pending[nextShard++];
      const expected = getExpected(shard);
      try {
        const raw = await withRetry(
          async (attempt) =>
            parseMapDetailShard(
              await getGDetailJSON(shard, {
                signal,
                timeout: REQUEST_TIMEOUT_MS,
                suppressErrorToast: true,
                revision: index.modified,
                bypassCache: attempt > 0,
              }),
              expected,
            ),
          generation,
          signal,
          () => reportProgress(true),
        );
        assertCurrent(generation, signal);
        setStagedMapDetail(index.revision, shard, raw, generation);
        acceptShard(raw);
        reportProgress();
      } catch {
        assertCurrent(generation, signal);
        failed.push(shard);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, pending.length) }, worker));
  assertCurrent(generation, signal);
  if (failed.length) throw new MapDataDownloadError(failed.sort((a, b) => a - b));

  onProgress?.({ phase: 'assembling', batch: completed, total, message: i18n.t('preparingData') });
  // The upstream shards are not immutable URLs. Re-read the index before committing
  // so a refresh interrupted by an upstream publication cannot be labelled current.
  const latestIndex = await fetchIndex(generation, signal, () => {
    onProgress?.({ phase: 'assembling', batch: completed, total, message: i18n.t('mapDataReconnecting') });
  });
  assertCurrent(generation, signal);
  if (
    latestIndex.revision !== index.revision ||
    JSON.stringify(latestIndex.bangumis) !== JSON.stringify(index.bangumis)
  ) {
    throw new Error(i18n.t('mapDataChangedDuringDownload'));
  }

  // Publish one complete dataset so Mapbox serializes the new GeoJSON only once.
  const data = assembleBangumis(index.bangumis, detailMap);
  assertCurrent(generation, signal);
  const cachePersisted = commitCachedMapData(data, index.modified, generation);
  assertCurrent(generation, signal);
  if (cachePersisted) onProgress?.({ phase: 'done', batch: total, total, message: i18n.t('loaded') });
  return { data, cachePersisted };
}
