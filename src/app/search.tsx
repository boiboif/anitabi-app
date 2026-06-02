import SearchBox from '@/components/search-box';
import { baseUrl } from '@/services/handlers';
import { fetchMapData } from '@/services/map-data';
import type { AssembledData, Bangumi, Point } from '@/services/types';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTokens, Text, useTheme, View } from 'tamagui';

// ---------------------------------------------------------------------------
// 列表项联合类型 — 后续增加巡礼点列表时添加 { type: 'point' } 分支
// ---------------------------------------------------------------------------
type SearchListItem = { type: 'bangumi'; data: Bangumi } | { type: 'point'; data: Point };

type TabKey = 'recent' | 'popular';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'recent', label: '最近更新' },
  { key: 'popular', label: '热门作品' },
];

const coverUrl = (cover: string) =>
  cover.startsWith('http://') || cover.startsWith('https://') ? cover : baseUrl + cover;

// ---------------------------------------------------------------------------
// Bangumi 卡片
// ---------------------------------------------------------------------------
function BangumiCard({ bangumi }: { bangumi: Bangumi }) {
  const theme = useTheme();
  return (
    <View
      bg="$color2"
      p="$3"
      mb="$2"
      display="flex"
      flexDirection="row"
      rounded="$4"
      shadowColor="$shadowColor"
      boxShadow="0 1px 4px $shadowColor"
      gap="$3"
    >
      <Image
        key={coverUrl(bangumi.cover ?? '')}
        source={coverUrl(bangumi.cover ?? '')}
        style={{
          width: 100,
          height: 100,
          borderRadius: getTokens().radius['4'].val,
          backgroundColor: bangumi.color || theme.color9.val,
        }}
        contentFit="cover"
      />
      <View flex={1}>
        {bangumi.cn ? (
          <Text fontWeight="600" fontSize={16} color="$color12" pr="$6" numberOfLines={2}>
            {bangumi.cn}
          </Text>
        ) : null}
        <Text fontSize={12} color="$color11" mt="$1" mb="$1" numberOfLines={1}>
          {bangumi.title}
        </Text>
        <View flexDirection="row">
          {bangumi.city && (
            <Text fontSize={12} color="$color11">
              {bangumi.city} {'· '}
            </Text>
          )}
          <Text fontSize={12} color="$color11">
            <Text color="$primary" fontWeight="bold">
              {bangumi.points.length}
            </Text>
            个巡礼点
          </Text>
        </View>
        <Text fontSize={10} color="$color11" position="absolute" r="$0" b="$0">
          最近更新：{dayjs(bangumi.modified).format('YYYY-MM-DD HH:mm')}
        </Text>
      </View>
      {bangumi.cat?.trim() ? (
        <View
          position="absolute"
          t="$2"
          r="$2"
          px="$2"
          py="$1"
          rounded="$2"
          style={{ backgroundColor: bangumi.color || theme.color9.val }}
        >
          <Text fontSize={10} color="white" fontWeight="500">
            {bangumi.cat}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 主页面
// ---------------------------------------------------------------------------
const Search = () => {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<AssembledData | null>(null);
  const [tab, setTab] = useState<TabKey>('recent');
  const loadingRef = useRef(false);
  const flashListRef = useRef<FlashListRef<SearchListItem>>(null);

  useEffect(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    fetchMapData()
      .then(setData)
      .catch((e) => console.error('search fetchMapData error:', e));
  }, []);

  const listItems: SearchListItem[] = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.data.bangumis];
    if (tab === 'recent') {
      sorted.sort((a, b) => b.modified - a.modified);
    } else {
      sorted.sort((a, b) => b.points.length - a.points.length);
    }
    return sorted
      .filter((item) => item.cat !== '小说')
      .slice(0, 50)
      .map((b) => ({ type: 'bangumi' as const, data: b }));
  }, [data, tab]);

  const renderItem = useCallback(({ item }: { item: SearchListItem }) => {
    switch (item.type) {
      case 'bangumi':
        return <BangumiCard bangumi={item.data} />;
      case 'point':
        return null; // TODO: 后续渲染巡礼点卡片
    }
  }, []);

  const keyExtractor = useCallback((item: SearchListItem) => {
    switch (item.type) {
      case 'bangumi':
        return `b-${item.data.id}`;
      case 'point':
        return `p-${item.data.id}`;
    }
  }, []);

  return (
    <Pressable disabled={!Keyboard.isVisible()} style={{ flex: 1 }} onPress={Keyboard.dismiss}>
      <View flex={1} pt={insets.top === 0 ? '$2' : insets.top} mt="$2">
        <View px="$3">
          <SearchBox focusOnRoute />
        </View>

        {/* Tab 切换栏 */}
        <View flexDirection="row" mx="$3" mt="$4" mb="$3" gap="$1">
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => {
                setTab(t.key);
                flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
              }}
            >
              <View
                bg={tab === t.key ? '$color3' : 'transparent'}
                p="$2"
                px="$3.5"
                rounded={tab === t.key ? '$9' : undefined}
              >
                <Text
                  fontWeight={tab === t.key ? '600' : '400'}
                  color={tab === t.key ? '$primary' : '$color11'}
                  fontSize={14}
                >
                  {t.label}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* 列表 */}
        <FlashList
          ref={flashListRef}
          data={listItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={{
            paddingHorizontal: getTokens().space['3'].val,
            paddingTop: 8,
            paddingBottom: insets.bottom + 16,
          }}
        />
      </View>
    </Pressable>
  );
};

export default Search;
