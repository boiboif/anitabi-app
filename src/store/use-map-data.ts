import type { AssembledData, FetchProgress } from '@/services/types';
import { create } from 'zustand';
import i18n from '@/i18n';

type MapDataStatus = 'idle' | 'loading' | 'ready' | 'error';

type MapDataStore = {
  data: AssembledData | null;
  status: MapDataStatus;
  isRefreshing: boolean;
  isPartial: boolean;
  progress: FetchProgress | null;
  error: Error | null;
  initialize: () => Promise<void>;
};

let initializePromise: Promise<void> | null = null;
let initializeGeneration: number | null = null;
let loadedService: typeof import('@/services/map-data') | null = null;

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error(i18n.t('mapDataFailedToLoad', { defaultValue: '地图数据加载失败' }));
}

export const useMapData = create<MapDataStore>((set, get) => ({
  data: null,
  status: 'idle',
  isRefreshing: false,
  isPartial: false,
  progress: null,
  error: null,

  initialize: () => {
    const currentGeneration = loadedService?.getMapDataGeneration() ?? null;
    if (initializePromise && initializeGeneration === currentGeneration) return initializePromise;
    initializeGeneration = currentGeneration;
    let generation = currentGeneration;
    const isCurrent = () =>
      initializePromise === operation && (generation === null || loadedService?.getMapDataGeneration() === generation);

    const operation = (async () => {
      // Load the map service only after the native splash hide request.
      const service = await import('@/services/map-data');
      loadedService = service;
      generation = service.getMapDataGeneration();
      initializeGeneration = generation;
      if (!isCurrent()) return;

      const cachedData = service.getCachedMapData();
      const previous = get();
      // Keep the current map during retries. Successful shards stay in download
      // staging; only a complete dataset may replace the visible map.
      const baseline = previous.data ?? cachedData;
      const visibleData = baseline;
      const isPartial = visibleData ? (previous.data ? previous.isPartial : !service.isCachedMapDataVerified()) : false;
      set({
        data: visibleData,
        status: visibleData ? 'ready' : 'loading',
        isRefreshing: true,
        isPartial,
        progress: baseline
          ? null
          : { phase: 'checking', message: i18n.t('checkingForDataUpdates', { defaultValue: '检查数据更新…' }) },
        error: null,
      });

      const result = await service.refreshMapData(baseline, (progress) => {
        if (isCurrent() && (!get().data || get().isPartial)) set({ progress });
      });
      if (!isCurrent()) return;
      const cacheError = result.cachePersisted ? null : new Error(i18n.t('mapDataCacheSaveFailed'));
      set({
        data: result.data,
        status: 'ready',
        isRefreshing: false,
        isPartial: false,
        progress: cacheError ? { phase: 'error', message: cacheError.message } : null,
        error: cacheError,
      });
    })()
      .catch((error: unknown) => {
        if (!isCurrent()) return;
        const state = get();
        const hasData = state.data !== null;
        const message = i18n.t(
          hasData ? (state.isPartial ? 'mapDataPartialFailed' : 'mapDataRefreshFailed') : 'mapDataLoadFailed',
        );
        set({
          status: hasData ? 'ready' : 'error',
          isRefreshing: false,
          progress: { phase: 'error', message },
          error: toError(error),
        });
      })
      .finally(() => {
        if (initializePromise !== operation) return;
        // Clearing the cache invalidates in-flight work without discarding the
        // already visible map. A late result cannot write back or publish data.
        if (!isCurrent()) {
          const paused = new Error(i18n.t('mapDataLoadPaused'));
          set({
            status: get().data ? 'ready' : 'error',
            isRefreshing: false,
            progress: { phase: 'error', message: paused.message },
            error: paused,
          });
        }
        initializePromise = null;
        initializeGeneration = null;
      });

    initializePromise = operation;
    return operation;
  },
}));
