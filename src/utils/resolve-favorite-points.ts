import type { FavoritePoint } from '@/lib/favorite-storage';
import type { Bangumi, Point } from '@/services/types';

export type ResolvedFavoritePoint = {
  favorite: FavoritePoint;
  bangumi?: Bangumi;
  point?: Point;
};

export function resolveFavoritePoints(favorites: FavoritePoint[], bangumis: Bangumi[]): ResolvedFavoritePoint[] {
  if (favorites.length === 0) return [];
  const remaining = new Map(favorites.map((favorite) => [favorite.key, favorite]));
  const selectedBangumiIds = new Set(favorites.map((favorite) => favorite.bangumiId));
  const resolved: ResolvedFavoritePoint[] = [];

  for (const bangumi of bangumis) {
    if (!selectedBangumiIds.has(bangumi.id)) continue;

    for (const point of bangumi.points) {
      const key = `${bangumi.id}:${point.id}`;
      const favorite = remaining.get(key);
      if (!favorite) continue;
      resolved.push({ favorite, bangumi, point });
      remaining.delete(key);
    }
  }

  for (const favorite of remaining.values()) resolved.push({ favorite });
  return resolved;
}
