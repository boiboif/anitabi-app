import ComparisonCameraButton from '@/components/comparison-camera-button';
import FavoritePointButton from '@/components/favorite-point-button';
import { type FavoritePoint } from '@/lib/favorite-storage';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { useFavoritePoints } from '@/store/use-favorite-points';
import { useMapData } from '@/store/use-map-data';
import { useMapBrowse } from '@/store/use-map-browse';
import { BottomTabInset, MaxContentWidth } from '@/tamagui.config';
import { Heart } from '@tamagui/lucide-icons-2';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Platform, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack, getTokens, useTheme } from 'tamagui';

type ResolvedFavorite = {
  favorite: FavoritePoint;
  bangumi?: Bangumi;
  point?: Point;
};

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

function formatFavoriteTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function FavoriteCard({ item, onPress }: { item: ResolvedFavorite; onPress: () => void }) {
  const theme = useTheme();
  const removeFavorite = useFavoritePoints((state) => state.removeFavorite);
  const imagePath = getImagePath(item);
  const available = Boolean(item.point && item.bangumi);

  return (
    <View bg="$color2" rounded="$4" mb="$2" overflow="hidden" position="relative" boxShadow="0 1px 4px $shadowColor">
      <Pressable disabled={!available} onPress={onPress}>
        <XStack height={100}>
          <Image
            source={imagePath ? { uri: buildImageUrl(imagePath, 'plan=h160') } : undefined}
            style={{
              width: 150,
              height: 100,
              backgroundColor: item.bangumi?.color || item.favorite.snapshot.bangumiColor || theme.color9.val,
              borderRadius: getTokens().radius['4'].val,
            }}
            contentFit="cover"
          />
          <YStack flex={1} p="$2" pr="$9" justify="space-between">
            <View>
              <Text fontSize={14} fontWeight="600" color="$color12" numberOfLines={1}>
                {getPointName(item)}
              </Text>
              {item.point?.mark || item.favorite.snapshot.pointMark ? (
                <Text fontSize={11} color="$color11" mt="$1" numberOfLines={2}>
                  {item.point?.mark || item.favorite.snapshot.pointMark}
                </Text>
              ) : null}
            </View>
            <Text fontSize={10} color="$color10">
              {available ? `收藏于 ${formatFavoriteTime(item.favorite.addedAt)}` : '点位已不可用'}
            </Text>
          </YStack>
        </XStack>
      </Pressable>
      {item.point && item.bangumi ? (
        <>
          <FavoritePointButton point={item.point} bangumi={item.bangumi} overlay />
          <View position="absolute" b="$2" r="$2">
            <ComparisonCameraButton point={item.point} bangumi={item.bangumi} compact />
          </View>
        </>
      ) : (
        <View position="absolute" t="$2" r="$2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="取消收藏巡礼点"
            hitSlop={8}
            onPress={() => removeFavorite(item.favorite.key)}
            style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
          >
            <View
              width={36}
              height={36}
              rounded="$9"
              bg="$color2"
              items="center"
              justify="center"
              boxShadow="0 1px 3px $shadowColor"
            >
              <Heart size={18} color={theme.primary.val} fill={theme.primary.val} />
            </View>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function FavoriteBangumiScreen() {
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

  const title = favorites[0] ? getBangumiName(favorites[0]) : '收藏点位';
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
              <Text color="$color11">加载收藏数据...</Text>
            </View>
          ) : favorites.length === 0 ? (
            <View minH={240} items="center" justify="center">
              <Text color="$color11">该番剧没有收藏的巡礼点</Text>
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
