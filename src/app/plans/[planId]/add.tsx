import { type FavoritePoint } from '@/lib/favorite-storage';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { useFavoritePoints } from '@/store/use-favorite-points';
import { useMapData } from '@/store/use-map-data';
import { usePlans } from '@/store/use-plans';
import { Check, Plus } from '@tamagui/lucide-icons-2';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack, getTokens, useTheme } from 'tamagui';

type AvailableFavorite = {
  favorite: FavoritePoint;
  point: Point;
  bangumi: Bangumi;
};

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

function AddPointCard({ item, added, onAdd }: { item: AvailableFavorite; added: boolean; onAdd: () => void }) {
  const theme = useTheme();
  const imagePath =
    item.point.image || item.favorite.snapshot.pointImage || item.bangumi.cover || item.favorite.snapshot.bangumiCover;

  return (
    <View
      bg="$color2"
      rounded="$4"
      mb="$2"
      overflow="hidden"
      position="relative"
      boxShadow="0 1px 4px $shadowColor"
      opacity={added ? 0.55 : 1}
    >
      <Pressable disabled={added} onPress={onAdd}>
        <XStack height={100}>
          <Image
            source={imagePath ? { uri: buildImageUrl(imagePath, 'plan=h160') } : undefined}
            style={{
              width: 150,
              height: 100,
              backgroundColor: item.bangumi.color || item.favorite.snapshot.bangumiColor || theme.color9.val,
              borderRadius: getTokens().radius['4'].val,
            }}
            contentFit="cover"
          />
          <YStack flex={1} p="$2" pr="$9" justify="space-between">
            <View>
              <Text fontSize="$body" fontWeight="600" color="$color12" numberOfLines={1}>
                {item.point.cn || item.point.name || item.favorite.snapshot.pointName}
              </Text>
              <Text fontSize="$footnote" color="$primary" mt="$1" numberOfLines={1}>
                {item.bangumi.cn || item.bangumi.title || item.bangumi.en || item.favorite.snapshot.bangumiName}
              </Text>
              {item.point.mark || item.favorite.snapshot.pointMark ? (
                <Text fontSize="$caption" color="$color11" mt="$1" numberOfLines={2}>
                  {item.point.mark || item.favorite.snapshot.pointMark}
                </Text>
              ) : null}
            </View>
            <Text fontSize="$caption" color="$color10">
              收藏于 {formatFavoriteTime(item.favorite.addedAt)}
            </Text>
          </YStack>
        </XStack>
      </Pressable>

      <View position="absolute" t="$2" r="$2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={added ? '已添加到巡礼计划' : '添加到巡礼计划'}
          disabled={added}
          hitSlop={8}
          onPress={onAdd}
          style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
        >
          <View width={36} height={36} rounded="$9" bg="$color2" items="center" justify="center">
            {added ? <Check size={17} color={theme.primary.val} /> : <Plus size={18} color={theme.primary.val} />}
          </View>
        </Pressable>
      </View>
    </View>
  );
}

export default function AddPlanPointsScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const favorites = useFavoritePoints((state) => state.favoritePoints);
  const data = useMapData((state) => state.data);
  const plan = usePlans((state) => state.plans.find((item) => item.id === planId));
  const addPoint = usePlans((state) => state.addPoint);
  const existingKeys = new Set(plan?.items.map((item) => item.key));

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

  return (
    <>
      <Stack.Screen options={{ title: '添加巡礼点' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: theme.background?.val }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 16, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {available.length === 0 ? (
          <YStack minH={260} items="center" justify="center">
            <Text color="$color11">暂无可添加的收藏点位</Text>
          </YStack>
        ) : (
          groupedAvailable.map(([date, items]) => (
            <View key={date} mb="$3">
              <Text fontSize="$body" lineHeight={20} fontWeight="700" color="$color11" mb="$2" px="$1">
                {date}
              </Text>
              {items.map((item) => (
                <AddPointCard
                  key={item.favorite.key}
                  item={item}
                  added={existingKeys.has(item.favorite.key)}
                  onAdd={() => addPoint(planId!, item.point, item.bangumi)}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}
