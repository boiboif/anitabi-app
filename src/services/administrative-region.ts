import { subscribeMapCacheInvalidation } from '@/lib/map-storage';
import { baseUrl } from '@/services/handlers';
import { decodeBoundaries, findBoundary, type Boundary } from '@/utils/administrative-boundaries';
import { fetch } from 'expo/fetch';
import { createMMKV } from 'react-native-mmkv';

const FILES = {
  world: '250616-world-lite-fixed',
  china: '250617-china-provine-fixed',
  japan: '250616-ddfk-outline',
} as const;
type BoundaryName = keyof typeof FILES;
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 15 * 1000;

let storage: ReturnType<typeof createMMKV> | null = null;
try {
  storage = createMMKV({ id: 'anitabi-administrative-boundaries' });
} catch {
  // Downloaded boundaries still work for this session when storage is unavailable.
}

type Entry = { boundaries: Boundary[]; fetchedAt: number };
const entries = new Map<BoundaryName, Entry>();
const loadedFromStorage = new Set<BoundaryName>();
const requests = new Map<BoundaryName, Promise<Entry | null>>();
const controllers = new Map<BoundaryName, AbortController>();
const nextRetry = new Map<BoundaryName, number>();
const observers = new Set<{ refresh: () => void; clear: () => void }>();
let generation = 0;

function decodeDataset(topology: unknown, name: BoundaryName): Boundary[] {
  const boundaries = decodeBoundaries(topology, FILES[name]);
  const requiredProperty = name === 'world' ? 'n' : name === 'china' ? 'p' : 'j';
  if (!boundaries.some((boundary) => typeof boundary.properties[requiredProperty] === 'string')) {
    throw new Error('Boundary dataset has no names');
  }
  return boundaries;
}

function readCached(name: BoundaryName): Entry | null {
  const memory = entries.get(name);
  if (memory) return memory;
  if (loadedFromStorage.has(name)) return null;
  loadedFromStorage.add(name);
  try {
    const raw = storage?.getString(FILES[name]);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fetchedAt?: unknown; topology?: unknown };
    if (typeof parsed.fetchedAt !== 'number' || !Number.isFinite(parsed.fetchedAt)) return null;
    const entry = { boundaries: decodeDataset(parsed.topology, name), fetchedAt: parsed.fetchedAt };
    entries.set(name, entry);
    return entry;
  } catch {
    return null;
  }
}

function refreshBoundary(name: BoundaryName): Promise<Entry | null> {
  const active = requests.get(name);
  if (active) return active;
  if ((nextRetry.get(name) ?? 0) > Date.now()) return Promise.resolve(null);
  const requestGeneration = generation;
  const controller = new AbortController();
  controllers.set(name, controller);
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let request!: Promise<Entry | null>;
  request = (async () => {
    try {
      const response = await fetch(`${baseUrl}/data/polygons/${FILES[name]}.topojson`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Boundary request failed: ${response.status}`);
      const topology: unknown = await response.json();
      const entry = { boundaries: decodeDataset(topology, name), fetchedAt: Date.now() };
      if (requestGeneration !== generation || controller.signal.aborted) return null;
      entries.set(name, entry);
      nextRetry.delete(name);
      try {
        storage?.set(FILES[name], JSON.stringify({ fetchedAt: entry.fetchedAt, topology }));
      } catch {
        // Keep the valid memory copy even if persistent storage is full.
      }
      for (const observer of observers) observer.refresh();
      return entry;
    } catch {
      if (requestGeneration === generation) nextRetry.set(name, Date.now() + RETRY_AFTER_MS);
      return null;
    } finally {
      clearTimeout(timeout);
      if (controllers.get(name) === controller) controllers.delete(name);
      if (requests.get(name) === request) requests.delete(name);
    }
  })();
  requests.set(name, request);
  return request;
}

async function getBoundary(name: BoundaryName): Promise<Boundary[] | null> {
  const entry = readCached(name);
  if (entry) {
    if (Date.now() - entry.fetchedAt >= REFRESH_AFTER_MS) void refreshBoundary(name);
    return entry.boundaries;
  }
  return (await refreshBoundary(name))?.boundaries ?? null;
}

function textProperty(properties: Record<string, unknown>, key: string): string | null {
  const value = properties[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

async function resolveRegion(geo: readonly [number, number]): Promise<string | null> {
  const [latitude, longitude] = geo;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const world = await getBoundary('world');
  if (!world) return null;
  const country = findBoundary(world, longitude, latitude);
  if (!country) return null;
  const countryName = textProperty(country.properties, 'n');
  if (!countryName) return null;
  const child = countryName === '中国' ? 'china' : countryName === '日本' ? 'japan' : null;
  if (!child) return countryName;
  const regionalBoundaries = await getBoundary(child);
  if (!regionalBoundaries) return null;
  const region = findBoundary(regionalBoundaries, longitude, latitude);
  const regionName = region && textProperty(region.properties, child === 'china' ? 'p' : 'j');
  return regionName ? `${countryName} ${regionName}` : null;
}

/** Observe cached and freshly downloaded results; input uses the app's [latitude, longitude] order. */
export function observeAdministrativeRegion(
  geo: readonly [number, number],
  onChange: (region: string | null) => void,
): () => void {
  let active = true;
  let revision = 0;
  let last: string | null = null;
  const observer = {
    refresh: () => {
      const current = ++revision;
      void resolveRegion(geo).then((region) => {
        if (!active || current !== revision || region === last) return;
        last = region;
        onChange(region);
      });
    },
    clear: () => {
      revision++;
      if (last !== null) {
        last = null;
        onChange(null);
      }
    },
  };
  observers.add(observer);
  observer.refresh();
  return () => {
    active = false;
    revision++;
    observers.delete(observer);
  };
}

// The settings screen already invalidates the map cache. Join that lifecycle so
// pending responses cannot recreate boundary data after an explicit clear.
subscribeMapCacheInvalidation(() => {
  generation++;
  for (const controller of controllers.values()) controller.abort();
  controllers.clear();
  requests.clear();
  entries.clear();
  loadedFromStorage.clear();
  nextRetry.clear();
  try {
    for (const name of Object.values(FILES)) storage?.remove(name);
  } catch {
    // Clearing in-memory data and invalidating downloads still takes effect.
  }
  for (const observer of observers) observer.clear();
});
