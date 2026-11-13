import { subscribeMapCacheInvalidation } from '@/lib/map-storage';
import Constants from 'expo-constants';
import { fetch } from 'expo/fetch';
import { createMMKV } from 'react-native-mmkv';

const LAYERS = new Set(['poi-label', 'transit-label', 'airport-label', 'natural-point-label']);
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 60 * 1000;
const TIMEOUT_MS = 10 * 1000;
const CACHE_PREFIX = 'style-v1:';
type StyleColors = { fetchedAt: number; layers: Record<string, unknown> };

/** The five bundled Mapbox styles currently use constants and match/get here.
 * Unknown operations fail closed so a future style cannot silently get a guessed color.
 */
export function evaluateMapTextColor(expression: unknown, feature: GeoJSON.Feature, zoom: number): string | null {
  let remaining = 4096;
  const evaluate = (value: unknown, depth = 0): unknown => {
    if (--remaining < 0 || depth > 64) throw new Error('Expression limit exceeded');
    if (!Array.isArray(value)) return value;
    const [operator, ...args] = value;
    const read = (item: unknown) => evaluate(item, depth + 1);
    switch (operator) {
      case 'literal':
        if (args.length !== 1) throw new Error('Invalid literal');
        return args[0];
      case 'get':
        if (args.length !== 1 || typeof args[0] !== 'string') throw new Error('Unsupported get');
        return feature.properties?.[args[0]] ?? null;
      case 'has':
        if (args.length !== 1 || typeof args[0] !== 'string') throw new Error('Unsupported has');
        return Object.prototype.hasOwnProperty.call(feature.properties ?? {}, args[0]);
      case 'zoom':
        if (args.length || !Number.isFinite(zoom)) throw new Error('Invalid zoom');
        return zoom;
      case 'match': {
        if (args.length < 4 || args.length % 2 !== 0) throw new Error('Invalid match');
        const input = read(args[0]);
        for (let index = 1; index < args.length - 1; index += 2) {
          const labels = Array.isArray(args[index]) ? args[index] : [args[index]];
          if (labels.includes(input)) return read(args[index + 1]);
        }
        return read(args.at(-1));
      }
      case 'coalesce':
        for (const arg of args) {
          const result = read(arg);
          if (result !== null && result !== undefined) return result;
        }
        return null;
      case 'case':
        if (args.length < 3 || args.length % 2 !== 1) throw new Error('Invalid case');
        for (let index = 0; index < args.length - 1; index += 2) {
          const condition = read(args[index]);
          if (typeof condition !== 'boolean') throw new Error('Invalid condition');
          if (condition) return read(args[index + 1]);
        }
        return read(args.at(-1));
      case 'step': {
        if (args.length < 4 || args.length % 2 !== 0) throw new Error('Invalid step');
        const input = read(args[0]);
        if (typeof input !== 'number' || !Number.isFinite(input)) throw new Error('Invalid step input');
        let output = args[1];
        let previous = -Infinity;
        for (let index = 2; index < args.length; index += 2) {
          const stop = args[index];
          if (typeof stop !== 'number' || !Number.isFinite(stop) || stop <= previous) throw new Error('Invalid step stops');
          previous = stop;
          if (input >= stop) output = args[index + 1];
        }
        return read(output);
      }
      case '==':
      case '!=': {
        if (args.length !== 2) throw new Error('Invalid comparison');
        const same = read(args[0]) === read(args[1]);
        return operator === '==' ? same : !same;
      }
      default:
        throw new Error('Unsupported color expression');
    }
  };
  try {
    const result = evaluate(expression);
    // Styles use CSS colors, which React Native Text accepts without conversion.
    return typeof result === 'string' && /^(?:#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})|(?:rgb|hsl)a?\([\d\s.,%+\-]+\)|transparent)$/i.test(result)
      ? result : null;
  } catch {
    return null;
  }
}

function extractColors(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const style = value as { version?: unknown; layers?: unknown };
  if (style.version !== 8 || !Array.isArray(style.layers)) return null;
  const layers: Record<string, unknown> = {};
  for (const layer of style.layers) {
    if (layer && typeof layer.id === 'string' && LAYERS.has(layer.id) && layer.type === 'symbol' && layer.paint?.['text-color'] != null) {
      layers[layer.id] = layer.paint['text-color'];
    }
  }
  return Object.keys(layers).length ? layers : null;
}

let storage: ReturnType<typeof createMMKV> | null = null;
try {
  storage = createMMKV({ id: 'anitabi-map-place-colors' });
} catch {
  // Colors still work for this session if persistence is unavailable.
}
const cache = new Map<string, StyleColors>();
const pending = new Map<string, Promise<void>>();
const controllers = new Set<AbortController>();
const nextRetry = new Map<string, number>();
let generation = 0;
let readPersisted = true;

function readCache(styleURL: string): StyleColors | null {
  const existing = cache.get(styleURL);
  if (existing) return existing;
  if (!readPersisted) return null;
  try {
    const raw = storage?.getString(CACHE_PREFIX + styleURL);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StyleColors>;
    if (typeof value.fetchedAt !== 'number' || !Number.isFinite(value.fetchedAt) || value.fetchedAt < 0 || value.fetchedAt > Date.now() ||
      !value.layers || typeof value.layers !== 'object' || Array.isArray(value.layers)) return null;
    const layers = Object.fromEntries(Object.entries(value.layers).filter(([id]) => LAYERS.has(id)));
    if (!Object.keys(layers).length) return null;
    const entry = { fetchedAt: value.fetchedAt, layers };
    cache.set(styleURL, entry);
    return entry;
  } catch {
    return null;
  }
}

function refresh(styleURL: string): Promise<void> {
  const existing = pending.get(styleURL);
  if (existing) return existing;
  const match = /^mapbox:\/\/styles\/([\w-]+)\/([\w-]+)$/.exec(styleURL);
  const token = Constants.expoConfig?.extra?.mapboxAccessToken;
  if (!match || typeof token !== 'string' || !token || Date.now() < (nextRetry.get(styleURL) ?? 0)) return Promise.resolve();
  const requestGeneration = generation;
  const controller = new AbortController();
  controllers.add(controller);
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let task!: Promise<void>;
  task = (async () => {
    try {
      const url = `https://api.mapbox.com/styles/v1/${match[1]}/${match[2]}?access_token=${encodeURIComponent(token)}`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Map style request failed');
      const layers = extractColors(await response.json());
      if (!layers) throw new Error('Invalid map style');
      if (generation !== requestGeneration || controller.signal.aborted) return;
      const entry = { layers, fetchedAt: Date.now() };
      cache.set(styleURL, entry);
      nextRetry.delete(styleURL);
      try {
        storage?.set(CACHE_PREFIX + styleURL, JSON.stringify(entry));
      } catch {
        // Retain the usable in-memory style if persistence fails.
      }
    } catch {
      if (generation === requestGeneration) nextRetry.set(styleURL, Date.now() + RETRY_AFTER_MS);
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
      if (pending.get(styleURL) === task) pending.delete(styleURL);
    }
  })();
  pending.set(styleURL, task);
  return task;
}

/** Warm the selected style once; stale cached colors stay available offline. */
export function prefetchMapStyle(styleURL: string): void {
  const current = readCache(styleURL);
  if (!current || Date.now() - current.fetchedAt >= REFRESH_AFTER_MS) void refresh(styleURL);
}

/** Read only an already available style; rendering a card must never start or await a request. */
export function getCachedMapTextColor(styleURL: string, layerId: string, feature: GeoJSON.Feature, zoom: number): string | null {
  if (!LAYERS.has(layerId)) return null;
  const current = readCache(styleURL);
  return current ? evaluateMapTextColor(current.layers[layerId], feature, zoom) : null;
}

/** Returns the clicked feature's text paint color, not an independently chosen palette. */
export async function getMapTextColor(styleURL: string, layerId: string, feature: GeoJSON.Feature, zoom: number): Promise<string | null> {
  if (!LAYERS.has(layerId)) return null;
  const requestGeneration = generation;
  let current = readCache(styleURL);
  if (!current) {
    await refresh(styleURL);
    if (requestGeneration !== generation) return null;
    current = cache.get(styleURL) ?? null;
  } else if (Date.now() - current.fetchedAt >= REFRESH_AFTER_MS) {
    void refresh(styleURL);
  }
  return current ? evaluateMapTextColor(current.layers[layerId], feature, zoom) : null;
}

subscribeMapCacheInvalidation(() => {
  generation++;
  for (const controller of controllers) controller.abort();
  controllers.clear();
  pending.clear();
  nextRetry.clear();
  cache.clear();
  readPersisted = false;
  try {
    storage?.clearAll();
  } catch {
    // Memory/request invalidation must succeed even if disk cleanup cannot.
  }
});
