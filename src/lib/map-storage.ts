import { createMMKV } from 'react-native-mmkv';
import type { AssembledData, RawGDetail } from '@/services/types';

let storage: ReturnType<typeof createMMKV> | null = null;
try {
  storage = createMMKV({ id: 'anitabi-map-cache' });
} catch (error) {
  console.warn('MMKV init failed, caching disabled:', error);
}

const COMPLETE_KEY = 'assembled-data-v2';
const LEGACY_ASSEMBLED_KEY = 'assembled-data';
const LEGACY_MODIFIED_KEY = 'g-modified';
const STAGED_MANIFEST_KEY = 'map-detail-manifest-v1';
const STAGED_DETAIL_PREFIX = 'map-detail-v1:';

type CompleteMapCache = { schemaVersion: 2; remoteModified: number; data: AssembledData };
type StagedDetail = { schemaVersion: 1; revision: string; data: RawGDetail[] };

// Read and parse the large assembled payload only on its first use.
let cachedDataSnapshot: AssembledData | null | undefined;
let cachedRemoteModified: number | null = null;
let cacheGeneration = 0;
const invalidationListeners = new Set<() => void>();
let activeDownloadRevision: string | null | undefined;
let downloadRevisionPersisted = false;
const stagedDetails = new Map<number, RawGDetail[] | null>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isModified(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isAssembledData(value: unknown): value is AssembledData {
  if (!isRecord(value) || !isRecord(value.data)) return false;
  return (
    isModified(value.data.modified) &&
    Array.isArray(value.data.bangumis) &&
    value.data.bangumis.every(
      (bangumi: unknown) =>
        isRecord(bangumi) &&
        typeof bangumi.id === 'number' &&
        Number.isSafeInteger(bangumi.id) &&
        bangumi.id > 0 &&
        isModified(bangumi.modified) &&
        Array.isArray(bangumi.points) &&
        Array.isArray(bangumi.geo) &&
        bangumi.geo.length === 2 &&
        isRecord(bangumi.theme),
    )
  );
}

function readCompleteSnapshot(): void {
  if (cachedDataSnapshot !== undefined) return;
  cachedDataSnapshot = null;
  cachedRemoteModified = null;
  if (!storage) return;

  try {
    const raw = storage.getString(COMPLETE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (
        isRecord(parsed) &&
        parsed.schemaVersion === 2 &&
        isModified(parsed.remoteModified) &&
        isAssembledData(parsed.data)
      ) {
        cachedDataSnapshot = parsed.data;
        cachedRemoteModified = parsed.remoteModified;
        return;
      }
    }
  } catch {
    // An invalid new record must not prevent displaying a usable legacy cache.
  }

  try {
    const raw = storage.getString(LEGACY_ASSEMBLED_KEY);
    const legacy: unknown = raw ? JSON.parse(raw) : null;
    if (isAssembledData(legacy)) cachedDataSnapshot = legacy;
    // Legacy data could have been committed after a failed shard. Its separate
    // g-modified key cannot establish completeness, so never trust that version.
  } catch {
    // Missing or damaged caches fall back to a network load.
  }
}

export function getCachedData(): AssembledData | null {
  readCompleteSnapshot();
  return cachedDataSnapshot ?? null;
}

export function getGModified(): number | null {
  readCompleteSnapshot();
  return cachedRemoteModified;
}

export function getMapCacheGeneration(): number {
  return cacheGeneration;
}

export function isMapCacheGenerationCurrent(generation: number): boolean {
  return generation === cacheGeneration;
}

export function subscribeMapCacheInvalidation(listener: () => void): () => void {
  invalidationListeners.add(listener);
  return () => {
    invalidationListeners.delete(listener);
  };
}

function readDownloadRevision(): string | null {
  if (activeDownloadRevision !== undefined) return activeDownloadRevision;
  activeDownloadRevision = null;
  if (!storage) return null;
  try {
    const raw = storage.getString(STAGED_MANIFEST_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (isRecord(parsed) && parsed.schemaVersion === 1 && typeof parsed.revision === 'string' && parsed.revision) {
      activeDownloadRevision = parsed.revision;
      downloadRevisionPersisted = true;
    }
  } catch {
    // Ignore an interrupted or damaged staging manifest.
  }
  return activeDownloadRevision;
}

function removeStagedKeys(): void {
  if (!storage) return;
  for (const key of storage.getAllKeys()) {
    if (key.startsWith(STAGED_DETAIL_PREFIX)) storage.remove(key);
  }
  storage.remove(STAGED_MANIFEST_KEY);
}

/** A revision identifies the exact index version, batch size and work IDs. */
export function prepareMapDownload(revision: string, generation: number): void {
  if (!isMapCacheGenerationCurrent(generation) || !revision) return;
  if (readDownloadRevision() !== revision) {
    activeDownloadRevision = revision;
    downloadRevisionPersisted = false;
    stagedDetails.clear();
    try {
      removeStagedKeys();
    } catch (error) {
      console.warn('Could not remove previous map download shards:', error);
    }
  }
  if (!storage || downloadRevisionPersisted) return;
  try {
    const raw = JSON.stringify({ schemaVersion: 1, revision });
    storage.set(STAGED_MANIFEST_KEY, raw);
    downloadRevisionPersisted = storage.getString(STAGED_MANIFEST_KEY) === raw;
  } catch (error) {
    console.warn('Could not persist map download revision:', error);
  }
}

function isDetailArray(value: unknown): value is RawGDetail[] {
  // The service checks the expected work IDs and point payloads. Do not traverse
  // every point again when reading staging or the assembled startup cache.
  return (
    Array.isArray(value) &&
    value.every(
      (detail: unknown) =>
        Array.isArray(detail) &&
        detail.length >= 4 &&
        typeof detail[0] === 'number' &&
        Number.isSafeInteger(detail[0]) &&
        detail[0] > 0 &&
        Array.isArray(detail[2]) &&
        isModified(detail[3]),
    )
  );
}

export function getStagedMapDetail(revision: string, index: number): RawGDetail[] | null {
  if (!Number.isSafeInteger(index) || index < 0 || readDownloadRevision() !== revision) return null;
  if (stagedDetails.has(index)) return stagedDetails.get(index) ?? null;
  let data: RawGDetail[] | null = null;
  try {
    const raw = storage?.getString(`${STAGED_DETAIL_PREFIX}${index}`);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (isRecord(parsed) && parsed.schemaVersion === 1 && parsed.revision === revision && isDetailArray(parsed.data)) {
      data = parsed.data;
    }
  } catch {
    // A damaged shard is a cache miss; only that shard needs downloading again.
  }
  stagedDetails.set(index, data);
  return data;
}

export function setStagedMapDetail(revision: string, index: number, data: RawGDetail[], generation: number): boolean {
  if (
    !isMapCacheGenerationCurrent(generation) ||
    readDownloadRevision() !== revision ||
    !Number.isSafeInteger(index) ||
    index < 0
  )
    return false;
  stagedDetails.set(index, data);
  if (!storage) return false;
  try {
    const record: StagedDetail = { schemaVersion: 1, revision, data };
    const raw = JSON.stringify(record);
    const key = `${STAGED_DETAIL_PREFIX}${index}`;
    storage.set(key, raw);
    return storage.getString(key) === raw;
  } catch (error) {
    console.warn('Could not persist map download shard:', error);
    return false;
  }
}

/** Commit only an assembled result whose shards the service has all validated. */
export function commitCachedMapData(data: AssembledData, remoteModified: number, generation: number): boolean {
  if (!isMapCacheGenerationCurrent(generation) || !storage || !isModified(remoteModified)) return false;
  readCompleteSnapshot();
  let previous: string | undefined;
  let attempted = false;
  try {
    const record: CompleteMapCache = { schemaVersion: 2, remoteModified, data };
    const raw = JSON.stringify(record);
    previous = storage.getString(COMPLETE_KEY);
    attempted = true;
    storage.set(COMPLETE_KEY, raw);
    if (storage.getString(COMPLETE_KEY) !== raw) throw new Error('Map cache verification failed');
  } catch (error) {
    if (attempted) {
      try {
        if (previous === undefined) storage.remove(COMPLETE_KEY);
        else storage.set(COMPLETE_KEY, previous);
      } catch (rollbackError) {
        console.warn('Could not restore the previous map cache:', rollbackError);
      }
    }
    console.warn('Could not commit complete map cache:', error);
    return false;
  }

  cachedDataSnapshot = data;
  cachedRemoteModified = remoteModified;
  stagedDetails.clear();
  activeDownloadRevision = null;
  downloadRevisionPersisted = false;
  try {
    removeStagedKeys();
    storage.remove(LEGACY_ASSEMBLED_KEY);
    storage.remove(LEGACY_MODIFIED_KEY);
  } catch (error) {
    // Cleanup cannot undo a successful, self-contained complete-cache commit.
    console.warn('Could not remove obsolete map cache records:', error);
  }
  return true;
}

export function clearMapCache(): void {
  // Invalidate requests before touching disk, even when MMKV is unavailable or
  // deletion fails. Their eventual responses must not refill a cleared cache.
  cacheGeneration += 1;
  for (const listener of [...invalidationListeners]) {
    try {
      listener();
    } catch (error) {
      console.warn('Map cache invalidation listener failed:', error);
    }
  }
  cachedDataSnapshot = null;
  cachedRemoteModified = null;
  activeDownloadRevision = null;
  downloadRevisionPersisted = false;
  stagedDetails.clear();
  if (!storage) return;

  const keys = new Set([COMPLETE_KEY, LEGACY_ASSEMBLED_KEY, LEGACY_MODIFIED_KEY, STAGED_MANIFEST_KEY]);
  let failure: unknown;
  try {
    for (const key of storage.getAllKeys()) {
      if (key.startsWith(STAGED_DETAIL_PREFIX)) keys.add(key);
    }
  } catch (error) {
    failure = error;
  }
  for (const key of keys) {
    try {
      storage.remove(key);
      if (storage.getString(key) !== undefined) throw new Error('Map cache deletion verification failed');
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== undefined) throw failure;
}
