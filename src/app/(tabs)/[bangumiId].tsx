import PointListCard from '@/components/point-list-card';
import RemoveFavoriteButton from '@/components/remove-favorite-button';
import { type FavoritePoint } from '@/lib/favorite-storage';
import { getBangumiTitle, getPointTitle } from '@/lib/localized-data';
import type { Bangumi, Point } from '@/services/types';
import { useFavoritePoints } from '@/store/use-favorite-points';
import { useMapBrowse } from '@/store/use-map-browse';
import { useMapData } from '@/store/use-map-data';
import { BottomTabInset, MaxContentWidth } from '@/tamagui.config';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Platform, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, useTheme } from 'tamagui';

type ResolvedFavorite = {
  favorite: FavoritePoint;
  bangumi?: Bangumi;
  point?: Point;
};

function getBangumiName(item: ResolvedFavorite, language: string): string {
  return item.bangumi ? getBangumiTitle(item.bangumi, language) : item.favorite.snapshot.bangumiName;
}

function getPointName(item: ResolvedFavorite, language: string): string {
  return item.point ? getPointTitle(item.point, language) : item.favorite.snapshot.pointName;
}

function getImagePath(item: ResolvedFavorite): string | undefined {
  return (
    item.point?.image || item.favorite.snapshot.pointImage || item.bangumi?.cover || item.favorite.snapshot.bangumiCover
  );
}

function formatFavoriteTime(timestamp: number, language: string): string {
  return new Date(timestamp).toLocaleString(language, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function FavoriteCard({ item, onPress }: { item: ResolvedFavorite; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const removeFavorite = useFavoritePoints((state) => state.removeFavorite);
  const available = Boolean(item.point && item.bangumi);

  return (
    <PointListCard
      point={item.point}
      bangumi={item.bangumi}
      title={getPointName(item, i18n.resolvedLanguage ?? i18n.language)}
      showSubtitle={false}
      description={item.point?.mark || item.favorite.snapshot.pointMark}
      meta={
        available
          ? t('favoritedDate', {
              defaultValue: '收藏于 {{date}}',
              date: formatFavoriteTime(item.favorite.addedAt, i18n.resolvedLanguage ?? i18n.language),
            })
          : t('locationUnavailable', { defaultValue: '点位已不可用' })
      }
      image={getImagePath(item)}
      imageColor={item.bangumi?.color || item.favorite.snapshot.bangumiColor}
      disabled={!available}
      onPress={onPress}
      showFavorite={available}
      showAddToPlan={available}
      showCamera={available}
      topRightAction={
        available ? undefined : <RemoveFavoriteButton onPress={() => removeFavorite(item.favorite.key)} />
      }
    />
  );
}

export default function FavoriteBangumiScreen() {
  const { t, i18n } = useTranslation();
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const { bangumiId } = useLocalSearchParams<{ bangumiId: string }>();
  const favoritePoints = useFavoritePoints((state) => state.favoritePoints);
  const data = useMapData((state) => state.data);
  const status = useMapData((state) => state.status);
  const focusPointFromList = useMapBrowse((state) => state.focusPointFromList);
  const loading = data === null && (status === 'idle' || status === 'loading');
  const id = Number(bangumiId);

  const favorites = useMemo(() => {
    const favoritesByPointId = new Map(
      favoritePoints.filter((item) => item.bangumiId === id).map((item) => [item.pointId, item]),
    );
    const bangumi = data?.data.bangumis.find((item) => item.id === id);
    const resolved: ResolvedFavorite[] = [];

    for (const point of bangumi?.points ?? []) {
      const favorite = favoritesByPointId.get(point.id);
      if (!favorite) continue;
      resolved.push({ favorite, bangumi, point });
      favoritesByPointId.delete(point.id);
    }

    for (const favorite of favoritesByPointId.values()) resolved.push({ favorite });
    return resolved.sort((a, b) => b.favorite.addedAt - a.favorite.addedAt);
  }, [data, favoritePoints, id]);

  const title = favorites[0]
    ? getBangumiName(favorites[0], i18n.resolvedLanguage ?? i18n.language)
    : t('favoriteLocations', { defaultValue: '收藏点位' });
  const openPoint = useCallback(
    (item: ResolvedFavorite) => {
      if (!item.point || !item.bangumi) return;
      focusPointFromList({ bangumiId: item.bangumi.id, pointId: item.point.id });
      router.dismissTo('/');
    },
    [focusPointFromList, router],
  );
  const bottomInset = safeAreaInsets.bottom + BottomTabInset + 16;
  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: 24,
      paddingLeft: safeAreaInsets.left,
      paddingRight: safeAreaInsets.right,
      paddingBottom: bottomInset,
    },
    web: { paddingTop: 24, paddingBottom: 24 },
  });

  return (
    <>
      <Stack.Screen options={{ headerShown: true, headerTitleAlign: 'center', title }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background?.val }}
        contentInset={{ bottom: bottomInset }}
        contentContainerStyle={contentPlatformStyle}
      >
        <View bg="$background" width="100%" maxW={MaxContentWidth} flex={1} px="$3">
          {loading ? (
            <View minH={240} items="center" justify="center">
              <Text color="$color11">{t('loadingFavorites', { defaultValue: '加载收藏数据...' })}</Text>
            </View>
          ) : favorites.length === 0 ? (
            <View minH={240} items="center" justify="center">
              <Text color="$color11">
                {t('thisWorkHasNoFavoriteLocations', { defaultValue: '该番剧没有收藏的巡礼点' })}
              </Text>
            </View>
          ) : (
            favorites.map((item) => (
              <FavoriteCard key={item.favorite.key} item={item} onPress={() => openPoint(item)} />
            ))
          )}
        </View>
      </ScrollView>
    </>
  );
}
