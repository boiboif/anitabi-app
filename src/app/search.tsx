import SearchBox from '@/components/search-box';
import { formatDuration } from '@/lib/formatDuration';
import { baseUrl } from '@/services/handlers';
import { fetchMapData } from '@/services/map-data';
import type { AssembledData, Bangumi, Point } from '@/services/types';
import { useSelectedBangumi } from '@/store/use-selected-bangumi';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTokens, Text, useTheme, View } from 'tamagui';

dayjs.extend(duration);

// ---------------------------------------------------------------------------
// 列表项联合类型 — 后续增加巡礼点列表时添加 { type: 'point' } 分支
// ---------------------------------------------------------------------------
type SearchListItem = { type: 'bangumi'; data: Bangumi } | { type: 'point'; data: Point; bangumi: Bangumi };

type TabKey = 'recent' | 'popular';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'recent', label: '最近更新' },
  { key: 'popular', label: '热门作品' },
];

const coverUrl = (cover: string, query?: string) =>
  cover.startsWith('http://') || cover.startsWith('https://') ? cover : baseUrl + cover + (query ? `?${query}` : '');

// ---------------------------------------------------------------------------
// Bangumi 卡片
// ---------------------------------------------------------------------------
function BangumiCard({ bangumi, onPress }: { bangumi: Bangumi; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress}>
      <View
        bg="$color2"
        p="$3"
        mb="$2"
        display="flex"
        flexDirection="row"
        rounded="$4"
        shadowColor="$shadowColor"
        boxShadow="0 1px 4px $shadowColor"
        gap="$2.5"
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
            <Text fontWeight="600" fontSize={16} color="$color12" pr="$8" numberOfLines={2}>
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
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// 巡礼点卡片（搜索结果用）
// ---------------------------------------------------------------------------
function PointCard({ point, bangumi }: { point: Point; bangumi: Bangumi }) {
  const theme = useTheme();
  const pointTitle = point.cn || point.name || '未命名点位';
  const animeTitle = bangumi.cn || bangumi.title || bangumi.en || '未知';
  const epLabel =
    typeof point.ep === 'number' && point.ep > 0
      ? `EP${point.ep}`
      : typeof point.ep === 'string' && point.ep
        ? point.ep
        : undefined;
  const timeLabel = typeof point.s === 'number' && point.s >= 0 ? formatDuration(point.s) : undefined;

  return (
    <View
      bg="$color2"
      p="$1.5"
      mb="$2"
      display="flex"
      flexDirection="row"
      rounded="$4"
      shadowColor="$shadowColor"
      boxShadow="0 1px 4px $shadowColor"
      gap="$2.5"
    >
      {/* 左侧：图片 + EP / 时间覆盖层 */}
      <View width={150} height={100} style={{ borderRadius: getTokens().radius['4'].val, overflow: 'hidden' }}>
        <Image
          key={point.image ? coverUrl(point.image) : 'none'}
          source={point.image ? coverUrl(point.image, 'plan=h160') : undefined}
          style={{ width: 150, height: 100, backgroundColor: theme.color9.val }}
          contentFit="cover"
        />
        {/* EP — 左下 */}
        {epLabel && (
          <View
            position="absolute"
            l={0}
            b={0}
            bg="rgba(0,0,0,0.55)"
            px="$1.5"
            py="$0.5"
            style={{ borderTopRightRadius: getTokens().radius['2'].val }}
          >
            <Text fontSize={11} fontWeight="700" color="white">
              {epLabel}
            </Text>
          </View>
        )}
        {/* 时分 — 右下 */}
        {timeLabel && (
          <View
            position="absolute"
            r={0}
            b={0}
            bg="rgba(0,0,0,0.55)"
            px="$1.5"
            py="$0.5"
            style={{ borderTopLeftRadius: getTokens().radius['2'].val }}
          >
            <Text fontSize={11} color="white">
              {timeLabel}
            </Text>
          </View>
        )}
      </View>

      {/* 右侧：文字内容 */}
      <View flex={1} style={{ justifyContent: 'space-between' }}>
        {/* 上部 */}
        <View>
          <Text fontWeight="600" fontSize={14} color="$color12" numberOfLines={1}>
            {pointTitle}
          </Text>
          <Text fontSize={12} color="$primary" mt="$1" numberOfLines={1}>
            {animeTitle}
          </Text>
          {point.mark ? (
            <Text fontSize={11} color="$color11" mt="$0.5" numberOfLines={3}>
              {point.mark}
            </Text>
          ) : null}
        </View>

        {/* 下部：folder 右下 */}
        {point.folder && (
          <Text fontSize={11} color="$color10" style={{ textAlign: 'right' }} mt="$1">
            {point.folder}
          </Text>
        )}
      </View>
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
  const [inputText, setInputText] = useState('');
  const [query, setQuery] = useState('');
  const loadingRef = useRef(false);
  const flashListRef = useRef<FlashListRef<SearchListItem>>(null);
  const router = useRouter();
  const { setSelectedBangumi } = useSelectedBangumi();

  const handleBangumiPress = useCallback(
    (bangumi: Bangumi) => {
      setSelectedBangumi(bangumi);
      router.back();
    },
    [setSelectedBangumi, router],
  );

  const searchMode = query.trim().length > 0;

  useEffect(() => {
    if (inputText === '') {
      setQuery('');
      return;
    }
    const timer = setTimeout(() => setQuery(inputText), 300);
    return () => clearTimeout(timer);
  }, [inputText]);

  useEffect(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    fetchMapData()
      .then(setData)
      .catch((e) => console.error('search fetchMapData error:', e));
  }, []);

  const { bangumiResults, pointResults } = useMemo(() => {
    if (!data || !searchMode) return { bangumiResults: [], pointResults: [] };
    const q = query.toLowerCase().trim();
    const bm: Bangumi[] = [];
    const pm: { bangumi: Bangumi; point: Point }[] = [];

    for (const b of data.data.bangumis) {
      const bMatch =
        String(b.cn ?? '')
          .toLowerCase()
          .includes(q) ||
        String(b.title ?? '')
          .toLowerCase()
          .includes(q) ||
        String(b.en ?? '')
          .toLowerCase()
          .includes(q) ||
        String(b.city ?? '')
          .toLowerCase()
          .includes(q);

      if (bMatch) {
        bm.push(b);
      } else {
        for (const p of b.points) {
          if (
            String(p.cn ?? '')
              .toLowerCase()
              .includes(q) ||
            String(p.name ?? '')
              .toLowerCase()
              .includes(q) ||
            String(p.folder ?? '')
              .toLowerCase()
              .includes(q)
          ) {
            pm.push({ bangumi: b, point: p });
          }
        }
      }
    }

    bm.sort((a, b) => b.points.length - a.points.length);
    pm.sort((a, b) => {
      const lenDiff = b.bangumi.points.length - a.bangumi.points.length;
      if (lenDiff !== 0) return lenDiff;

      const aEp = typeof a.point.ep === 'number' ? a.point.ep : null;
      const bEp = typeof b.point.ep === 'number' ? b.point.ep : null;
      if (aEp != null && bEp != null) {
        const epDiff = aEp - bEp;
        if (epDiff !== 0) return epDiff;
      }

      const sDiff = (a.point.s ?? Infinity) - (b.point.s ?? Infinity);
      if (sDiff !== 0) return sDiff;

      return b.point.priority - a.point.priority;
    });

    return { bangumiResults: bm, pointResults: pm };
  }, [data, query, searchMode]);

  const listItems: SearchListItem[] = useMemo(() => {
    if (searchMode) {
      return [
        ...bangumiResults.map((b) => ({ type: 'bangumi' as const, data: b })),
        ...pointResults.map((p) => ({
          type: 'point' as const,
          data: p.point,
          bangumi: p.bangumi,
        })),
      ];
    }
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
  }, [data, tab, searchMode, bangumiResults, pointResults, query]);

  const renderItem = useCallback(
    ({ item }: { item: SearchListItem }) => {
      switch (item.type) {
        case 'bangumi':
          return <BangumiCard bangumi={item.data} onPress={() => handleBangumiPress(item.data)} />;
        case 'point':
          return <PointCard point={item.data} bangumi={item.bangumi} />;
      }
    },
    [handleBangumiPress],
  );

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
          <SearchBox focusOnRoute value={inputText} onChangeText={setInputText} allowClear />
        </View>

        {/* Tab 切换栏 — 搜索时隐藏 */}
        {!searchMode && (
          <View flexDirection="row" mx="$3" mt="$3" gap="$1">
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
        )}

        {/* 列表 */}
        {searchMode && listItems.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text fontSize={14} color="$color11">
              未找到相关地标
            </Text>
          </View>
        ) : (
          <FlashList
            ref={flashListRef}
            data={listItems}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            key={searchMode ? `search-${query}` : 'tabs'}
            extraData={query}
            contentContainerStyle={{
              paddingHorizontal: getTokens().space['3'].val,
              paddingTop: getTokens().space['3'].val,
              paddingBottom: insets.bottom + 16,
            }}
          />
        )}
      </View>
    </Pressable>
  );
};

export default Search;
