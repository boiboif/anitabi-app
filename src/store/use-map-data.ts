import { getCachedMapData, refreshMapData } from '@/services/map-data';
import type { AssembledData, FetchProgress } from '@/services/types';
import { create } from 'zustand';
import i18n from '@/i18n';

type MapDataStatus = 'idle' | 'loading' | 'ready' | 'error';

type MapDataStore = {
  data: AssembledData | null;
  status: MapDataStatus;
  isRefreshing: boolean;
  progress: FetchProgress | null;
  error: Error | null;
  initialize: () => Promise<void>;
};

let refreshPromise: Promise<void> | null = null;

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error(i18n.t('mapDataFailedToLoad', { defaultValue: '地图数据加载失败' }));
}

export const useMapData = create<MapDataStore>((set, get) => ({
  data: null,
  status: 'idle',
  isRefreshing: false,
  progress: null,
  error: null,

  initialize: async () => {
    if (refreshPromise) return refreshPromise;

    // Keep the large JSON parse out of module evaluation and the first app frame.
    const cachedData = getCachedMapData();
    const hasCachedData = cachedData !== null;
    set({
      data: cachedData,
      status: hasCachedData ? 'ready' : 'loading',
      isRefreshing: hasCachedData,
      progress: hasCachedData
        ? null
        : { phase: 'checking', message: i18n.t('checkingForDataUpdates', { defaultValue: '检查数据更新…' }) },
      error: null,
    });

    refreshPromise = refreshMapData((progress) => {
      if (!get().data) set({ progress });
    })
      .then((data) => {
        set({ data, status: 'ready', isRefreshing: false, progress: null, error: null });
      })
      .catch((error: unknown) => {
        const hasData = get().data !== null;
        set({
          status: hasData ? 'ready' : 'error',
          isRefreshing: false,
          progress: hasData
            ? null
            : { phase: 'error', message: i18n.t('dataFailedToLoad', { defaultValue: '数据加载失败' }) },
          error: toError(error),
        });
      })
      .finally(() => {
        refreshPromise = null;
      });

    return refreshPromise;
  },
}));
