import PointListCard from '@/components/point-list-card';
import { type FavoritePoint } from '@/lib/favorite-storage';
import type { Bangumi, Point } from '@/services/types';
import { useFavoritePoints } from '@/store/use-favorite-points';
import { useMapData } from '@/store/use-map-data';
import { usePlans } from '@/store/use-plans';
import { FlashList } from '@shopify/flash-list';
import { Check, Plus } from '@tamagui/lucide-icons-2';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, YStack, useTheme } from 'tamagui';

type AvailableFavorite = {
  favorite: FavoritePoint;
  point: Point;
  bangumi: Bangumi;
};

type AddPointListItem =
  | { type: 'date'; id: string; label: string }
  | { type: 'point'; id: string; item: AvailableFavorite };

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

export default function AddPlanPointsScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const favorites = useFavoritePoints((state) => state.favoritePoints);
  const data = useMapData((state) => state.data);
  const plan = usePlans((state) => state.plans.find((item) => item.id === planId));
  const addPoint = usePlans((state) => state.addPoint);
  const removePoint = usePlans((state) => state.removePoint);
  const existingKeys = useMemo(() => new Set(plan?.items.map((item) => item.key)), [plan]);

  const available = useMemo<AvailableFavorite[]>(() => {
    const result: AvailableFavorite[] = [];
    for (const favorite of favorites) {
      const bangumi = data?.data.bangumis.find((item) => item.id === favorite.bangumiId);
      const point = bangumi?.points.find((item) => item.id === favorite.pointId);
      if (bangumi && point) result.push({ favorite, point, bangumi });
    }
    return result.sort((a, b) => b.favorite.addedAt - a.favorite.addedAt);
  }, [data, favorites]);

  const groupedAvailable = useMemo(() => {
    const groups = new Map<string, AvailableFavorite[]>();
    for (const item of available) {
      const date = getDateGroup(item.favorite.addedAt);
      const items = groups.get(date) ?? [];
      items.push(item);
      groups.set(date, items);
    }
    return Array.from(groups.entries());
  }, [available]);

  const listItems = useMemo<AddPointListItem[]>(
    () =>
      groupedAvailable.flatMap(([date, items]) => [
        { type: 'date' as const, id: `date-${date}`, label: date },
        ...items.map((item) => ({ type: 'point' as const, id: `point-${item.favorite.key}`, item })),
      ]),
    [groupedAvailable],
  );
  const stickyHeaderIndices = useMemo(
    () => listItems.map((item, index) => (item.type === 'date' ? index : -1)).filter((index) => index >= 0),
    [listItems],
  );

  const renderListItem = useCallback(
    ({ item }: { item: AddPointListItem }) => {
      if (item.type === 'date') {
        return (
          <View bg="$background" px="$4" py="$2">
            <Text fontSize="$body" lineHeight={20} fontWeight="700" color="$color11">
              {item.label}
            </Text>
          </View>
        );
      }

      const added = existingKeys.has(item.item.favorite.key);
      const togglePoint = () => {
        if (added) {
          removePoint(planId, item.item.favorite.key);
        } else {
          addPoint(planId, item.item.point, item.item.bangumi);
        }
      };

      return (
        <View px="$3">
          <PointListCard
            point={item.item.point}
            bangumi={item.item.bangumi}
            title={item.item.point.cn || item.item.point.name || item.item.favorite.snapshot.pointName}
            subtitle={
              item.item.bangumi.cn ||
              item.item.bangumi.title ||
              item.item.bangumi.en ||
              item.item.favorite.snapshot.bangumiName
            }
            description={item.item.point.mark || item.item.favorite.snapshot.pointMark}
            meta={`收藏于 ${formatFavoriteTime(item.item.favorite.addedAt)}`}
            image={
              item.item.point.image ||
              item.item.favorite.snapshot.pointImage ||
              item.item.bangumi.cover ||
              item.item.favorite.snapshot.bangumiCover
            }
            imageColor={item.item.bangumi.color || item.item.favorite.snapshot.bangumiColor}
            opacity={added ? 0.55 : 1}
            onPress={togglePoint}
            accessibilityLabel={added ? '从巡礼计划移除' : '添加到巡礼计划'}
            accessibilityState={{ selected: added }}
            topRightAction={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={added ? '取消选中并移除巡礼点' : '添加到巡礼计划'}
                accessibilityState={{ selected: added }}
                hitSlop={8}
                onPress={(event) => {
                  event.stopPropagation();
                  togglePoint();
                }}
                style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
              >
                <View width={36} height={36} rounded="$9" bg="$color2" items="center" justify="center">
                  {added ? <Check size={17} color={theme.primary.val} /> : <Plus size={18} color={theme.primary.val} />}
                </View>
              </Pressable>
            }
          />
        </View>
      );
    },
    [addPoint, existingKeys, planId, removePoint, theme.primary.val],
  );

  return (
    <>
      <Stack.Screen options={{ title: '添加巡礼点' }} />
      {available.length === 0 ? (
        <YStack flex={1} minH={260} items="center" justify="center" bg="$background" px="$4" pb={insets.bottom + 24}>
          <Text color="$color11">暂无可添加的收藏点位</Text>
        </YStack>
      ) : (
        <FlashList
          data={listItems}
          renderItem={renderListItem}
          keyExtractor={(item) => item.id}
          getItemType={(item) => item.type}
          stickyHeaderIndices={stickyHeaderIndices}
          extraData={existingKeys}
          contentInsetAdjustmentBehavior="automatic"
          style={{ flex: 1, backgroundColor: theme.background?.val }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </>
  );
}
