import PointListCard from '@/components/point-list-card';
import RemoveFavoriteButton from '@/components/remove-favorite-button';
import { type FavoritePoint } from '@/lib/favorite-storage';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { useFavoritePoints } from '@/store/use-favorite-points';
import { useMapBrowse } from '@/store/use-map-browse';
import { useMapData } from '@/store/use-map-data';
import { BottomTabInset, MaxContentWidth } from '@/tamagui.config';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack, getTokens, useTheme } from 'tamagui';

type FavoriteView = 'bangumi' | 'history';

type ResolvedFavorite = {
  favorite: FavoritePoint;
  bangumi?: Bangumi;
  point?: Point;
};

type BangumiGroup = {
  id: number;
  name: string;
  cover?: string;
  color?: string;
  items: ResolvedFavorite[];
  latestAddedAt: number;
};

type FavoriteListItem =
  | { type: 'bangumi'; id: string; group: BangumiGroup }
  | { type: 'date'; id: string; label: string }
  | { type: 'favorite'; id: string; item: ResolvedFavorite };

function getDateGroup(timestamp: number): string {
  const today = new Date();
  const target = new Date(timestamp);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const days = Math.round((todayStart - targetStart) / 86_400_000);

  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  return `${target.getFullYear()}年${target.getMonth() + 1}月${target.getDate()}日`;
}

function formatFavoriteTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getBangumiName(item: ResolvedFavorite): string {
  return item.bangumi?.cn || item.bangumi?.title || item.bangumi?.en || item.favorite.snapshot.bangumiName;
}

function getPointName(item: ResolvedFavorite): string {
  return item.point?.cn || item.point?.name || item.favorite.snapshot.pointName;
}

function getImagePath(item: ResolvedFavorite): string | undefined {
  return (
    item.point?.image || item.favorite.snapshot.pointImage || item.bangumi?.cover || item.favorite.snapshot.bangumiCover
  );
}

function FavoriteCard({ item, onPress }: { item: ResolvedFavorite; onPress: () => void }) {
  const removeFavorite = useFavoritePoints((state) => state.removeFavorite);
  const available = Boolean(item.point && item.bangumi);

  return (
    <PointListCard
      point={item.point}
      bangumi={item.bangumi}
      title={getPointName(item)}
      subtitle={getBangumiName(item)}
      description={item.point?.mark || item.favorite.snapshot.pointMark}
      meta={available ? `收藏于 ${formatFavoriteTime(item.favorite.addedAt)}` : '点位已不可用'}
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

function BangumiGridCard({ group, onPress }: { group: BangumiGroup; onPress: () => void }) {
  const theme = useTheme();

  return (
    <View flex={1} mx="$1" mb="$2">
      <Pressable onPress={onPress}>
        <YStack bg="$color2" rounded="$4" overflow="hidden" boxShadow="0 1px 4px $shadowColor">
          <Image
            source={group.cover ? { uri: buildImageUrl(group.cover, 'plan=h360') } : undefined}
            style={{ width: '100%', height: 150, backgroundColor: group.color || theme.color9.val }}
            contentFit="cover"
          />
          <View px="$1.5" pt="$1.5" pb="$1.5">
            <Text height={30} fontSize="$caption" fontWeight="600" color="$color12" numberOfLines={2} lineHeight={15}>
              {group.name}
            </Text>
            <Text fontSize="$caption" color="$color11" mt="$0.5">
              {group.items.length} 个点位
            </Text>
          </View>
        </YStack>
      </Pressable>
    </View>
  );
}

export default function FavoritesScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const favoritePoints = useFavoritePoints((state) => state.favoritePoints);
  const data = useMapData((state) => state.data);
  const status = useMapData((state) => state.status);
  const focusPointFromList = useMapBrowse((state) => state.focusPointFromList);
  const [view, setView] = useState<FavoriteView>('bangumi');
  const loading = data === null && (status === 'idle' || status === 'loading');
  const loadFailed = data === null && status === 'error';

  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + 16,
  };

  const resolvedFavorites = useMemo(() => {
    const remaining = new Map(favoritePoints.map((item) => [item.key, item]));
    const resolved: ResolvedFavorite[] = [];

    for (const bangumi of data?.data.bangumis ?? []) {
      for (const point of bangumi.points) {
        const key = `${bangumi.id}:${point.id}`;
        const favorite = remaining.get(key);
        if (!favorite) continue;
        resolved.push({ favorite, bangumi, point });
        remaining.delete(key);
      }
    }

    for (const favorite of remaining.values()) {
      resolved.push({ favorite });
    }

    return resolved.sort((a, b) => b.favorite.addedAt - a.favorite.addedAt);
  }, [data, favoritePoints]);

  const bangumiGroups = useMemo(() => {
    const groups = new Map<number, BangumiGroup>();

    for (const item of resolvedFavorites) {
      const id = item.favorite.bangumiId;
      const group = groups.get(id);
      if (group) {
        group.items.push(item);
        group.latestAddedAt = Math.max(group.latestAddedAt, item.favorite.addedAt);
        continue;
      }

      groups.set(id, {
        id,
        name: getBangumiName(item),
        cover: item.bangumi?.cover || item.favorite.snapshot.bangumiCover,
        color: item.bangumi?.color || item.favorite.snapshot.bangumiColor,
        items: [item],
        latestAddedAt: item.favorite.addedAt,
      });
    }

    return Array.from(groups.values()).sort((a, b) => b.latestAddedAt - a.latestAddedAt);
  }, [resolvedFavorites]);

  const historyGroups = useMemo(() => {
    const groups = new Map<string, ResolvedFavorite[]>();
    for (const item of resolvedFavorites) {
      const date = getDateGroup(item.favorite.addedAt);
      const items = groups.get(date) ?? [];
      items.push(item);
      groups.set(date, items);
    }
    return Array.from(groups.entries());
  }, [resolvedFavorites]);

  const listItems = useMemo<FavoriteListItem[]>(() => {
    if (view === 'bangumi') {
      return bangumiGroups.map((group) => ({ type: 'bangumi', id: `bangumi-${group.id}`, group }));
    }

    return historyGroups.flatMap(([date, items]) => [
      { type: 'date' as const, id: `date-${date}`, label: date },
      ...items.map((item) => ({ type: 'favorite' as const, id: `favorite-${item.favorite.key}`, item })),
    ]);
  }, [bangumiGroups, historyGroups, view]);
  const stickyHeaderIndices = useMemo(
    () => listItems.map((item, index) => (item.type === 'date' ? index : -1)).filter((index) => index >= 0),
    [listItems],
  );

  const openPoint = useCallback(
    (item: ResolvedFavorite) => {
      if (!item.point || !item.bangumi) return;
      focusPointFromList({ bangumiId: item.bangumi.id, pointId: item.point.id });
      router.navigate('/');
    },
    [focusPointFromList, router],
  );

  const contentPlatformStyle = Platform.select({
    ios: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
    },
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: 64,
      paddingBottom: 24,
    },
  });

  const renderListItem = useCallback(
    ({ item }: { item: FavoriteListItem }) => {
      switch (item.type) {
        case 'bangumi':
          return (
            <BangumiGridCard
              group={item.group}
              onPress={() =>
                router.navigate({
                  pathname: '/favorites/[bangumiId]',
                  params: { bangumiId: String(item.group.id) },
                })
              }
            />
          );
        case 'date':
          return (
            <View bg="$background" px="$4" pb="$2">
              <Text fontSize="$body" lineHeight={20} fontWeight="700" color="$color11">
                {item.label}
              </Text>
            </View>
          );
        case 'favorite':
          return (
            <View px="$3">
              <FavoriteCard item={item.item} onPress={() => openPoint(item.item)} />
            </View>
          );
      }
    },
    [openPoint, router],
  );

  const keyExtractor = useCallback((item: FavoriteListItem) => item.id, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background?.val, ...contentPlatformStyle, paddingBottom: 0 }}>
      <View bg="$background" width="100%" maxW={MaxContentWidth} flex={1}>
        <XStack mx="$3" mb="$3" gap="$1">
          {(
            [
              ['bangumi', '按番剧'],
              ['history', '最近收藏'],
            ] as const
          ).map(([key, label]) => (
            <View key={key} flex={1}>
              <Pressable onPress={() => setView(key)}>
                <View
                  bg={view === key ? '$color3' : 'transparent'}
                  px="$3"
                  py="$2"
                  rounded={view === key ? '$9' : undefined}
                  items="center"
                >
                  <Text
                    fontSize="$body"
                    fontWeight={view === key ? '600' : '400'}
                    color={view === key ? '$primary' : '$color11'}
                  >
                    {label}
                  </Text>
                </View>
              </Pressable>
            </View>
          ))}
        </XStack>

        {loading ? (
          <View minH={240} items="center" justify="center" px="$6">
            <Text color="$color11">加载收藏数据...</Text>
          </View>
        ) : resolvedFavorites.length === 0 ? (
          <View minH={240} items="center" justify="center" px="$6">
            <Text color="$color11">还没有收藏的巡礼点</Text>
          </View>
        ) : (
          <FlashList
            key={view}
            data={listItems}
            renderItem={renderListItem}
            keyExtractor={keyExtractor}
            getItemType={(item) => item.type}
            stickyHeaderIndices={stickyHeaderIndices}
            numColumns={view === 'bangumi' ? 3 : 1}
            contentContainerStyle={{
              paddingHorizontal: view === 'bangumi' ? getTokens().space['2'].val : 0,
              paddingBottom: insets.bottom,
            }}
            ListFooterComponent={
              loadFailed ? (
                <View items="center" px="$6" pb="$4">
                  <Text fontSize="$caption" color="$color10">
                    地图数据加载失败，正在显示已保存的收藏信息
                  </Text>
                </View>
              ) : null
            }
          />
        )}
      </View>
    </View>
  );
}
