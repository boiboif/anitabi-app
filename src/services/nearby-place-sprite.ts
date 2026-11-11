import { subscribeMapCacheInvalidation } from '@/lib/map-storage';
import { baseUrl } from '@/services/handlers';
import { fetch } from 'expo/fetch';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Image, type ImageRef } from 'expo-image';
import { convertIndexedToRgb, decode } from 'fast-png';
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
export type PreparedPlaceIcon = { source: ImageRef; color: string | null; width: number; height: number };

const croppedIcons = new Map<string, Promise<string>>();
const croppedIconFiles = new Map<string, string>();
const croppedIconColors = new Map<string, Promise<string | null>>();
// Dropping entries only removes our references: a visible card can still own its ImageRef.
const preparedIcons = new Map<string, Promise<PreparedPlaceIcon | null>>();
const MAX_PREPARED_ICONS = 64;

/** Find the dominant visible fill, preserving dark/neutral icons but excluding white artwork. */
export function getSpritePngColor(bytes: Uint8Array): string | null {
  try {
    // Icons are small. Avoid decoding unbounded dimensions from damaged cached data.
    if (bytes.length < 24) return null;
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (header.getUint32(16) * header.getUint32(20) > 256 * 256) return null;
    const image = decode(bytes, { checkCrc: true });
    const indexed = !!image.palette;
    const pixels = indexed ? convertIndexedToRgb(image) : image.data;
    const channels = indexed ? image.palette![0].length : image.channels;
    if (!indexed && image.depth !== 8 && image.depth !== 16) return null;
    if (![1, 2, 3, 4].includes(channels)) return null;
    const max = !indexed && image.depth === 16 ? 65535 : 255;
    const buckets = new Map<number, { weight: number; red: number; green: number; blue: number }>();
    for (let offset = 0; offset < pixels.length; offset += channels) {
      const gray = channels <= 2;
      const red = pixels[offset] * 255 / max;
      const green = gray ? red : pixels[offset + 1] * 255 / max;
      const blue = gray ? red : pixels[offset + 2] * 255 / max;
      let alpha = channels === 2 || channels === 4 ? pixels[offset + channels - 1] / max : 1;
      if (!indexed && image.transparency && (gray
        ? pixels[offset] === image.transparency[0]
        : image.transparency.every((value, i) => pixels[offset + i] === value))) alpha = 0;
      if (alpha < 0.25 || (red >= 240 && green >= 240 && blue >= 240)) continue;
      // Group nearby anti-aliased shades instead of counting each exact RGB separately.
      const key = (Math.floor(red / 16) << 8) | (Math.floor(green / 16) << 4) | Math.floor(blue / 16);
      const entry = buckets.get(key) ?? { weight: 0, red: 0, green: 0, blue: 0 };
      entry.weight += alpha;
      entry.red += red * alpha;
      entry.green += green * alpha;
      entry.blue += blue * alpha;
      buckets.set(key, entry);
    }
    let dominant: { weight: number; red: number; green: number; blue: number } | undefined;
    for (const entry of buckets.values()) if (!dominant || entry.weight > dominant.weight) dominant = entry;
    if (!dominant) return null;
    const weight = dominant.weight;
    return '#' + [dominant.red, dominant.green, dominant.blue]
      .map((value) => Math.round(value / weight).toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/** Read only the cropped icon, keeping neighboring sprites out of the color histogram. */
export function getPlaceSpriteIconColor(sprite: PlaceSprite, rect: SpriteRect): Promise<string | null> {
  const key = JSON.stringify([sprite.uri, rect.x, rect.y, rect.width, rect.height]);
  // Validate the cached file before returning a color belonging to that crop.
  const crop = getPlaceSpriteIcon(sprite, rect);
  const cached = croppedIconColors.get(key);
  if (cached) return cached;
  let task!: Promise<string | null>;
  task = crop.then(async (uri) => {
    const bytes = await new File(uri).bytes();
    return croppedIconColors.get(key) === task ? getSpritePngColor(bytes) : null;
  }).catch(() => {
    if (croppedIconColors.get(key) === task) croppedIconColors.delete(key);
    return null;
  });
  croppedIconColors.set(key, task);
  return task;
}

function deleteCrop(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Temporary image files can also be reclaimed by the system cache.
  }
}

function clearCroppedIcons(): void {
  for (const task of croppedIcons.values()) void task.then(deleteCrop, () => {});
  croppedIcons.clear();
  croppedIconFiles.clear();
  croppedIconColors.clear();
  preparedIcons.clear();
}

/** Crop before scaling so adjacent atlas pixels cannot bleed through native image sampling. */
export function getPlaceSpriteIcon(sprite: PlaceSprite, rect: SpriteRect): Promise<string> {
  const key = JSON.stringify([sprite.uri, rect.x, rect.y, rect.width, rect.height]);
  const cached = croppedIcons.get(key);
  if (cached) {
    const uri = croppedIconFiles.get(key);
    // A pending crop has no file yet. Completed crops can be evicted by the OS.
    if (!uri) return cached;
    try {
      if (new File(uri).exists) return cached;
    } catch {
      // An unreadable temporary file should be recreated from the persisted atlas.
    }
    croppedIcons.delete(key);
    croppedIconFiles.delete(key);
    croppedIconColors.delete(key);
    preparedIcons.delete(key);
  }
  let task!: Promise<string>;
  task = (async () => {
    const context = ImageManipulator.manipulate(sprite.uri);
    try {
      context.crop({ originX: rect.x, originY: rect.y, width: rect.width, height: rect.height });
      const image = await context.renderAsync();
      try {
        const { uri } = await image.saveAsync({ format: SaveFormat.PNG, compress: 1 });
        if (croppedIcons.get(key) !== task) {
          deleteCrop(uri);
          throw new Error('Sprite crop invalidated');
        }
        croppedIconFiles.set(key, uri);
        return uri;
      } finally {
        image.release();
      }
    } finally {
      context.release();
    }
  })().catch((error) => {
    if (croppedIcons.get(key) === task) {
      croppedIcons.delete(key);
      croppedIconFiles.delete(key);
    }
    throw error;
  });
  croppedIcons.set(key, task);
  return task;
}

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

/** Warm the atlas in the background without making map interaction depend on a download. */
export function prefetchPlaceSprite(): void {
  const current = readCache();
  if (!current || Date.now() - current.fetchedAt >= REFRESH_AFTER_MS) refresh();
}

/** Return a complete visual snapshot; an uncached atlas only starts a background prefetch. */
export function preparePlaceIcon(name?: string, fallbackName?: string): Promise<PreparedPlaceIcon | null> {
  if (!name && !fallbackName) return Promise.resolve(null);
  const current = readCache();
  prefetchPlaceSprite();
  if (!current) return Promise.resolve(null);
  const candidates = [name, fallbackName].filter((value): value is string => !!value);
  let rect: SpriteRect | undefined;
  for (const candidate of candidates) {
    rect = current.icons.get(candidate) ?? current.icons.get(candidate.replace(/-(?:11|15)$/, ''));
    if (rect) break;
  }
  if (!rect) return Promise.resolve(null);
  const selectedRect = rect;
  const key = JSON.stringify([current.uri, rect.x, rect.y, rect.width, rect.height]);
  // Also validates temporary-file existence and invalidates a stale prepared entry if necessary.
  const crop = getPlaceSpriteIcon(current, rect);
  const cached = preparedIcons.get(key);
  if (cached) {
    preparedIcons.delete(key);
    preparedIcons.set(key, cached);
    return cached;
  }
  const requestGeneration = generation;
  let task!: Promise<PreparedPlaceIcon | null>;
  task = crop.then(async (uri) => {
    const [source, color] = await Promise.all([
      Image.loadAsync(uri),
      getPlaceSpriteIconColor(current, selectedRect),
    ]);
    if (generation !== requestGeneration || sprite !== current) return null;
    const scale = Math.min(0.5, 22 / selectedRect.width, 22 / selectedRect.height);
    return { source, color, width: selectedRect.width * scale, height: selectedRect.height * scale };
  }).catch(() => {
    if (preparedIcons.get(key) === task) preparedIcons.delete(key);
    return null;
  });
  if (preparedIcons.size >= MAX_PREPARED_ICONS) preparedIcons.delete(preparedIcons.keys().next().value!);
  preparedIcons.set(key, task);
  return task;
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
      clearCroppedIcons();
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
  clearCroppedIcons();
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
