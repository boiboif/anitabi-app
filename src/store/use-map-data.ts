import type { AssembledData, FetchProgress } from '@/services/types';
import type { AppState } from 'react-native';
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
const REFRESH_RETRY_DELAYS = [30_000, 120_000, 300_000] as const;
let retryStep = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryRemainingMs: number | null = null;
let retryStartedAt = 0;
let retryGeneration: number | null = null;
let retryTimerToken = 0;
let lifecycleUsers = 0;
let appIsActive = false;
let lifecycleStopped = false;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let unsubscribeInvalidation: (() => void) | null = null;
let activeController: AbortController | null = null;
let activeRefreshIsSilent = false;

function stopRetryTimer(preserveRemaining = false): void {
  retryTimerToken++;
  if (retryTimer === null) return;
  clearTimeout(retryTimer);
  retryTimer = null;
  if (preserveRemaining && retryRemainingMs !== null) {
    retryRemainingMs = Math.max(0, retryRemainingMs - (Date.now() - retryStartedAt));
  }
}

function resetRetry(): void {
  stopRetryTimer();
  retryRemainingMs = null;
  retryGeneration = null;
  retryStep = 0;
}

function armRetry(): void {
  if (lifecycleUsers === 0 || lifecycleStopped || !appIsActive || retryRemainingMs === null) return;
  if (retryGeneration !== loadedService?.getMapDataGeneration()) {
    resetRetry();
    return;
  }
  if (retryTimer !== null || initializePromise) return;
  const token = ++retryTimerToken;
  retryStartedAt = Date.now();
  retryTimer = setTimeout(() => {
    if (token !== retryTimerToken) return;
    retryTimer = null;
    retryRemainingMs = 0;
    if (!appIsActive || lifecycleStopped || lifecycleUsers === 0) return;
    if (retryGeneration !== loadedService?.getMapDataGeneration()) {
      resetRetry();
      return;
    }
    if (initializePromise) return;
    retryRemainingMs = null;
    retryGeneration = null;
    // Automatic retries retain the backoff; explicit initialize() resets it.
    void initializeMapData();
  }, retryRemainingMs);
}

function scheduleRetry(generation: number): void {
  stopRetryTimer();
  retryRemainingMs = REFRESH_RETRY_DELAYS[Math.min(retryStep, REFRESH_RETRY_DELAYS.length - 1)];
  retryGeneration = generation;
  retryStep = Math.min(retryStep + 1, REFRESH_RETRY_DELAYS.length - 1);
  armRetry();
}

function subscribeToCacheInvalidation(): void {
  if (!loadedService || unsubscribeInvalidation || lifecycleUsers === 0) return;
  unsubscribeInvalidation = loadedService.subscribeMapDataInvalidation(() => {
    // A deliberate cache clear must not be undone by a queued retry or resume.
    resetRetry();
    activeController?.abort();
  });
}

/** RootLayout owns this subscription; no native listener or timer starts on import. */
export function startMapDataRefreshLifecycle(appState: Pick<typeof AppState, 'currentState' | 'addEventListener'>) {
  lifecycleUsers++;
  if (lifecycleUsers === 1) {
    lifecycleStopped = false;
    const handleStateChange = (state: string | null | undefined) => {
      appIsActive = state === 'active';
      if (appIsActive) {
        armRetry();
        return;
      }
      stopRetryTimer(true);
      if (activeRefreshIsSilent && activeController && !activeController.signal.aborted) {
        retryRemainingMs = 0;
        retryGeneration = loadedService?.getMapDataGeneration() ?? null;
        activeController.abort();
      }
    };
    appStateSubscription = appState.addEventListener('change', handleStateChange);
    subscribeToCacheInvalidation();
    // null/unknown is not foreground. The first active event resumes pending work.
    handleStateChange(appState.currentState);
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    lifecycleUsers--;
    if (lifecycleUsers !== 0) return;
    lifecycleStopped = true;
    appIsActive = false;
    resetRetry();
    appStateSubscription?.remove();
    appStateSubscription = null;
    unsubscribeInvalidation?.();
    unsubscribeInvalidation = null;
    activeController?.abort();
  };
}

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error(i18n.t('mapDataFailedToLoad', { defaultValue: '地图数据加载失败' }));
}

export const useMapData = create<MapDataStore>(() => ({
  data: null,
  status: 'idle',
  isRefreshing: false,
  isPartial: false,
  progress: null,
  error: null,

  initialize: () => {
    resetRetry();
    return initializeMapData();
  },
}));

function initializeMapData(): Promise<void> {
  if (lifecycleStopped) return Promise.resolve();
  const set = useMapData.setState;
  const get = useMapData.getState;
  const currentGeneration = loadedService?.getMapDataGeneration() ?? null;
  if (initializePromise && initializeGeneration === currentGeneration && !activeController?.signal.aborted) {
    return initializePromise;
  }
  initializeGeneration = currentGeneration;
  let generation = currentGeneration;
  let controller: AbortController | null = null;
  let silentRefresh = Boolean(get().data && !get().isPartial);
  const isCurrent = () =>
    initializePromise === operation && (generation === null || loadedService?.getMapDataGeneration() === generation);
  const canPublish = () => isCurrent() && !lifecycleStopped && !controller?.signal.aborted;

  const operation = (async () => {
    // Load the map service only after the native splash hide request.
    const service = await import('@/services/map-data');
    loadedService = service;
    // Clearing the cache can happen while the dynamic import is pending. Do not
    // adopt its new generation and restart an automatic refresh that was cleared.
    if (generation !== null && generation !== service.getMapDataGeneration()) return;
    generation = service.getMapDataGeneration();
    initializeGeneration = generation;
    if (!canPublish()) return;
    subscribeToCacheInvalidation();

    const cachedData = service.getCachedMapData();
    const previous = get();
    // Keep the current map during retries. Successful shards stay in download
    // staging; only a complete dataset may replace the visible map.
    const baseline = previous.data ?? cachedData;
    const visibleData = baseline;
    const isPartial = visibleData ? (previous.data ? previous.isPartial : !service.isCachedMapDataVerified()) : false;
    silentRefresh = Boolean(baseline && !isPartial);
    const holdForForeground = silentRefresh && lifecycleUsers > 0 && !appIsActive;
    set({
      data: visibleData,
      status: visibleData ? 'ready' : 'loading',
      isRefreshing: !holdForForeground,
      isPartial,
      progress: baseline
        ? null
        : { phase: 'checking', message: i18n.t('checkingForDataUpdates', { defaultValue: '检查数据更新…' }) },
      error: null,
    });

    if (holdForForeground) {
      retryRemainingMs = 0;
      retryGeneration = generation;
      return;
    }
    controller = new AbortController();
    activeController = controller;
    activeRefreshIsSilent = silentRefresh;

    const result = await service.refreshMapData(
      baseline,
      (progress) => {
        if (canPublish() && !silentRefresh) set({ progress });
      },
      { signal: controller.signal },
    );
    if (!canPublish()) return;
    const cacheError = result.cachePersisted ? null : new Error(i18n.t('mapDataCacheSaveFailed'));
    set({
      data: result.data,
      status: 'ready',
      isRefreshing: false,
      isPartial: false,
      progress: cacheError && !silentRefresh ? { phase: 'error', message: cacheError.message } : null,
      error: silentRefresh ? null : cacheError,
    });
    if (cacheError && silentRefresh) scheduleRetry(generation);
    else resetRetry();
  })()
    .catch((error: unknown) => {
      if (!canPublish()) return;
      if (silentRefresh) {
        set({ status: 'ready', isRefreshing: false, progress: null, error: null });
        scheduleRetry(generation!);
        return;
      }
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
      if (!isCurrent() && !silentRefresh && !lifecycleStopped) {
        const paused = new Error(i18n.t('mapDataLoadPaused'));
        set({
          status: get().data ? 'ready' : 'error',
          isRefreshing: false,
          progress: { phase: 'error', message: paused.message },
          error: paused,
        });
      } else if (controller?.signal.aborted || lifecycleStopped) {
        set({ isRefreshing: false });
      }
      initializePromise = null;
      initializeGeneration = null;
      if (activeController === controller) {
        activeController = null;
        activeRefreshIsSilent = false;
      }
      armRetry();
    });

  initializePromise = operation;
  return operation;
}
