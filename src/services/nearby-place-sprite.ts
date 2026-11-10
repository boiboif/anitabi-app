import { subscribeMapCacheInvalidation } from '@/lib/map-storage';
import { baseUrl } from '@/services/handlers';
import { fetch } from 'expo/fetch';
import { Directory, File, Paths } from 'expo-file-system';
import { createMMKV } from 'react-native-mmkv';

const SPRITE_WIDTH = 1024;
const SPRITE_HEIGHT = 1082;
const CACHE_DIRECTORY = 'nearby-place-sprite';
const CACHE_KEY = 'sprite-v1';
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 60 * 1000;
const TIMEOUT_MS = 15 * 1000;

export type SpriteRect = { x: number; y: number; width: number; height: number };
export type PlaceSprite = { uri: string; icons: Map<string, SpriteRect>; fetchedAt: number };

/** Parse the sprite metadata only if every entry fits the expected PNG. */
export function parsePlaceSpriteIndex(csv: string): Map<string, SpriteRect> {
  const icons = new Map<string, SpriteRect>();
  for (const raw of csv.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const fields = line.split(',');
    if (fields.length !== 5 || !fields[0]) throw new Error('Invalid sprite index');
    const [x, y, width, height] = fields.slice(1).map(Number);
    if (
      ![x, y, width, height].every(Number.isInteger) ||
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > SPRITE_WIDTH ||
      y + height > SPRITE_HEIGHT ||
      icons.has(fields[0])
    )
      throw new Error('Invalid sprite coordinates');
    icons.set(fields[0], { x, y, width, height });
  }
  if (!icons.size) throw new Error('Empty sprite index');
  return icons;
}

function validSpritePng(bytes: Uint8Array): boolean {
  if (bytes.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(16) === SPRITE_WIDTH && view.getUint32(20) === SPRITE_HEIGHT;
}

let storage: ReturnType<typeof createMMKV> | null = null;
try {
  storage = createMMKV({ id: 'anitabi-nearby-place-sprite' });
} catch {
  // A usable download can still serve the current session.
}

const directory = new Directory(Paths.document, CACHE_DIRECTORY);
const listeners = new Set<(sprite: PlaceSprite | null) => void>();
let sprite: PlaceSprite | null = null;
let readPersisted = false;
let pending: Promise<void> | null = null;
let activeController: AbortController | null = null;
let generation = 0;
let sequence = 0;
let nextRetry = 0;

function readCache(): PlaceSprite | null {
  if (sprite) return sprite;
  if (readPersisted) return null;
  readPersisted = true;
  try {
    const raw = storage?.getString(CACHE_KEY);
    if (!raw) return null;
    const item: unknown = JSON.parse(raw);
    if (!item || typeof item !== 'object') return null;
    const { filename, csv, fetchedAt } = item as Record<string, unknown>;
    if (
      typeof filename !== 'string' ||
      !/^sprite-[a-z0-9-]+\.png$/.test(filename) ||
      typeof csv !== 'string' ||
      typeof fetchedAt !== 'number' ||
      !Number.isFinite(fetchedAt)
    )
      return null;
    const file = new File(directory, filename);
    if (!file.exists) return null;
    sprite = { uri: file.uri, icons: parsePlaceSpriteIndex(csv), fetchedAt };
    return sprite;
  } catch {
    return null;
  }
}

function refresh(): void {
  if (pending || Date.now() < nextRetry) return;
  const requestGeneration = generation;
  const controller = new AbortController();
  activeController = controller;
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const version = new Date().toISOString().slice(2, 10).replaceAll('-', '');
  const root = `${baseUrl}/mapbox/anitabi/ani@2x`;
  const filename = `sprite-${Date.now().toString(36)}-${++sequence}.png`;
  const file = new File(directory, filename);
  let task!: Promise<void>;
  task = (async () => {
    let keepFile = false;
    try {
      const response = await fetch(`${root}.csv?v=${version}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Sprite index request failed: ${response.status}`);
      const csv = await response.text();
      const icons = parsePlaceSpriteIndex(csv);
      directory.create({ idempotent: true, intermediates: true });
      await File.downloadFileAsync(`${root}.png?v=${version}`, file, { signal: controller.signal });
      const bytes = await file.bytes();
      if (!validSpritePng(bytes)) throw new Error('Invalid sprite image');
      if (generation !== requestGeneration || controller.signal.aborted) return;

      const previous = sprite;
      const fetchedAt = Date.now();
      const entry = { uri: file.uri, icons, fetchedAt };
      let persisted = false;
      try {
        if (storage) {
          storage.set(CACHE_KEY, JSON.stringify({ filename, csv, fetchedAt }));
          persisted = true;
        }
      } catch {
        // Keep the existing on-disk pair if committing new metadata fails.
      }
      sprite = entry;
      keepFile = true;
      nextRetry = 0;
      for (const listener of listeners) listener(entry);
      if (persisted && previous && previous.uri !== entry.uri) {
        try {
          new File(previous.uri).delete();
        } catch {
          /* Old cache can be cleared later. */
        }
      }
    } catch {
      if (generation === requestGeneration) nextRetry = Date.now() + RETRY_AFTER_MS;
    } finally {
      clearTimeout(timer);
      if (!keepFile) {
        try {
          if (file.exists) file.delete();
        } catch {
          /* Ignore partial-file cleanup failures. */
        }
      }
      if (activeController === controller) activeController = null;
      if (pending === task) pending = null;
    }
  })();
  pending = task;
}

/** Reuse the last complete index/image pair; refresh stale data in the background. */
export function observePlaceSprite(listener: (sprite: PlaceSprite | null) => void): () => void {
  listeners.add(listener);
  const current = readCache();
  listener(current);
  if (!current || Date.now() - current.fetchedAt >= REFRESH_AFTER_MS) refresh();
  return () => {
    listeners.delete(listener);
  };
}

// Match the app's existing "clear cache" action and reject late downloads.
subscribeMapCacheInvalidation(() => {
  generation++;
  activeController?.abort();
  activeController = null;
  pending = null;
  sprite = null;
  readPersisted = false;
  nextRetry = 0;
  try {
    storage?.remove(CACHE_KEY);
  } catch {
    /* Ignore unavailable storage. */
  }
  for (const listener of listeners) listener(null);
  try {
    if (directory.exists) directory.delete();
  } catch {
    /* The cache can be retried on demand. */
  }
});
