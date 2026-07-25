import { getFavoritePoints, setFavoritePoints, type FavoritePoint } from '@/lib/favorite-storage';
import type { Bangumi, Point } from '@/services/types';
import { create } from 'zustand';

export function getFavoritePointKey(bangumiId: number, pointId: string): string {
  return `${bangumiId}:${pointId}`;
}

function createFavoritePoint(point: Point, bangumi: Bangumi): FavoritePoint {
  const pointName = point.cn || point.name || '未命名点位';
  const bangumiName = bangumi.cn || bangumi.title || bangumi.en || '未知作品';

  return {
    key: getFavoritePointKey(bangumi.id, point.id),
    bangumiId: bangumi.id,
    pointId: point.id,
    addedAt: Date.now(),
    snapshot: {
      bangumiName,
      bangumiCover: bangumi.cover,
      bangumiColor: bangumi.color,
      pointName,
      pointImage: point.image,
      pointMark: point.mark,
    },
  };
}

type FavoritePointsStore = {
  favoritePoints: FavoritePoint[];
  favoriteKeys: Set<string>;
  addFavorite: (point: Point, bangumi: Bangumi) => void;
  removeFavorite: (key: string) => void;
  toggleFavorite: (point: Point, bangumi: Bangumi) => void;
};

const initialFavoritePoints = getFavoritePoints();

export const useFavoritePoints = create<FavoritePointsStore>((set, get) => ({
  favoritePoints: initialFavoritePoints,
  favoriteKeys: new Set(initialFavoritePoints.map((item) => item.key)),

  addFavorite: (point, bangumi) => {
    const favorite = createFavoritePoint(point, bangumi);
    if (get().favoriteKeys.has(favorite.key)) return;

    const next = [favorite, ...get().favoritePoints];
    setFavoritePoints(next);
    set({ favoritePoints: next, favoriteKeys: new Set(next.map((item) => item.key)) });
  },

  removeFavorite: (key) => {
    if (!get().favoriteKeys.has(key)) return;

    const next = get().favoritePoints.filter((item) => item.key !== key);
    setFavoritePoints(next);
    set({ favoritePoints: next, favoriteKeys: new Set(next.map((item) => item.key)) });
  },

  toggleFavorite: (point, bangumi) => {
    const key = getFavoritePointKey(bangumi.id, point.id);
    if (get().favoriteKeys.has(key)) {
      get().removeFavorite(key);
    } else {
      get().addFavorite(point, bangumi);
    }
  },
}));
