import { SettingCell } from '@/components/setting-cell';
import { clearMapCache } from '@/lib/map-storage';
import { useFavoritePoints } from '@/store/use-favorite-points';
import { BottomTabInset, MaxContentWidth } from '@/tamagui.config';
import { Check, Database, Heart, Image as ImageIcon } from '@tamagui/lucide-icons-2';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, YStack, useTheme } from 'tamagui';

type CacheItemId = 'map' | 'image' | 'favorites';

const cacheItems = [
  {
    id: 'map' as const,
    title: '地图数据',
    description: '已下载的番剧、点位和地图索引数据',
    icon: Database,
  },
  {
    id: 'image' as const,
    title: '图片缓存',
    description: '番剧封面、点位图片等已缓存图片',
    icon: ImageIcon,
  },
  {
    id: 'favorites' as const,
    title: '收藏',
    description: '已收藏的巡礼点位',
    icon: Heart,
  },
];

export default function ClearCacheScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();
  const [selectedItems, setSelectedItems] = useState<Set<CacheItemId>>(new Set());
  const [isClearing, setIsClearing] = useState(false);
  const clearDisabled = selectedItems.size === 0 || isClearing;

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: 16,
      paddingLeft: safeAreaInsets.left,
      paddingRight: safeAreaInsets.right,
      paddingBottom: safeAreaInsets.bottom + BottomTabInset + 96,
    },
    ios: {
      paddingTop: 16,
      paddingBottom: safeAreaInsets.bottom + 96,
    },
    web: {
      paddingTop: 24,
      paddingBottom: 96,
    },
  });

  const toggleItem = (id: CacheItemId) => {
    if (isClearing) return;
    setSelectedItems((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearSelectedItems = async () => {
    setIsClearing(true);
    try {
      await Promise.all(
        Array.from(selectedItems).map(async (id) => {
          if (id === 'map') clearMapCache();
          if (id === 'image') await Promise.all([Image.clearMemoryCache(), Image.clearDiskCache()]);
          if (id === 'favorites') {
            useFavoritePoints.getState().clearAllFavorites();
          }
        }),
      );
      setSelectedItems(new Set());
      Alert.alert('清理完成', '已清除选中的内容。');
    } catch {
      Alert.alert('清理未完成', '部分内容未能清除，请稍后重试。');
    } finally {
      setIsClearing(false);
    }
  };

  const confirmClear = () => {
    if (selectedItems.size === 0 || isClearing) return;
    const names = cacheItems
      .filter((item) => selectedItems.has(item.id))
      .map((item) => item.title)
      .join('、');
    Alert.alert('确认清理', `将清除${names}，此操作无法撤销。`, [
      { text: '取消', style: 'cancel' },
      { text: '清理', style: 'destructive', onPress: () => void clearSelectedItems() },
    ]);
  };

  return (
    <View flex={1} bg="$background">
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background?.val }}
        contentContainerStyle={{ flexDirection: 'row', justifyContent: 'center', ...contentPlatformStyle }}
      >
        <YStack width="100%" maxW={MaxContentWidth} flex={1} px="$5" gap="$4">
          <YStack gap="$1" px="$1">
            <Text fontSize={15} lineHeight={22} fontWeight="600" color="$color12">
              选择要清理的内容
            </Text>
            <Text fontSize={12} lineHeight={18} color="$color11">
              清理地图数据后，下次使用时会重新下载最新数据。
            </Text>
          </YStack>

          <YStack bg="$color2" rounded="$2" overflow="hidden" style={{ borderCurve: 'continuous' }}>
            {cacheItems.map((item, index) => {
              const selected = selectedItems.has(item.id);

              return (
                <SettingCell
                  key={item.id}
                  icon={item.icon}
                  title={item.title}
                  description={item.description}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled: isClearing }}
                  disabled={isClearing}
                  onPress={() => toggleItem(item.id)}
                  showDivider={index < cacheItems.length - 1}
                  rightAccessory={
                    <View
                      width={22}
                      height={22}
                      rounded="$10"
                      borderWidth={selected ? 0 : 1.5}
                      borderColor={selected ? '$primary' : '$color9'}
                      bg={selected ? '$primary' : 'transparent'}
                      items="center"
                      justify="center"
                    >
                      {selected ? <Check size={15} strokeWidth={3} color="white" /> : null}
                    </View>
                  }
                />
              );
            })}
          </YStack>
        </YStack>
      </ScrollView>

      <View px="$5" pt="$3" pb={safeAreaInsets.bottom + 12} bg="$background" borderTopWidth={1} borderColor="$color6">
        <View width="100%" maxW={MaxContentWidth} mx="auto">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: clearDisabled }}
            disabled={clearDisabled}
            onPress={confirmClear}
            style={({ pressed }) => ({
              width: '100%',
              minHeight: 48,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor: theme.primary?.val,
              opacity: clearDisabled ? 0.45 : pressed ? 0.8 : 1,
            })}
          >
            <Text pointerEvents="none" color="white" fontWeight="700">
              {isClearing ? '清理中...' : `清理选中项目${selectedItems.size ? ` (${selectedItems.size})` : ''}`}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
