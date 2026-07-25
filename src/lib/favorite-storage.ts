import { createMMKV } from 'react-native-mmkv';

export type FavoritePointSnapshot = {
  bangumiName: string;
  bangumiCover?: string;
  bangumiColor?: string;
  pointName: string;
  pointImage?: string;
  pointMark?: string;
};

export type FavoritePoint = {
  key: string;
  bangumiId: number;
  pointId: string;
  addedAt: number;
  snapshot: FavoritePointSnapshot;
};

let storage: ReturnType<typeof createMMKV> | null = null;
try {
  storage = createMMKV({ id: 'anitabi-favorites' });
} catch (error) {
  console.warn('MMKV init failed (web?), favorites disabled:', error);
}

const FAVORITES_KEY = 'favorite-points-v1';

export function getFavoritePoints(): FavoritePoint[] {
  if (!storage) return [];
  try {
    const raw = storage.getString(FAVORITES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is FavoritePoint =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.key === 'string' &&
        typeof item.bangumiId === 'number' &&
        typeof item.pointId === 'string' &&
        typeof item.addedAt === 'number' &&
        typeof item.snapshot === 'object' &&
        item.snapshot !== null,
    );
  } catch {
    return [];
  }
}

export function setFavoritePoints(points: FavoritePoint[]): void {
  if (!storage) return;
  try {
    storage.set(FAVORITES_KEY, JSON.stringify(points));
  } catch (error) {
    console.warn('MMKV setFavoritePoints failed:', error);
  }
}
