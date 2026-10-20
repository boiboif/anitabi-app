import BangumiListCard from '@/components/bangumi/bangumi-list-card';
import PointListCard from '@/components/point/point-list-card';
import CardListItem from '@/components/ui/card-list-item';
import SearchBox from '@/components/ui/search-box';
import { translateMessage, type TranslationMessage } from '@/i18n/messages';
import { getCardListBoundarySpacing } from '@/lib/card-list-layout';
import type { Bangumi, Point } from '@/services/types';
import { useMapBrowse } from '@/store/use-map-browse';
import { useMapData } from '@/store/use-map-data';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTokens, Text, View } from 'tamagui';

// ---------------------------------------------------------------------------
// 列表项联合类型 — 后续增加巡礼点列表时添加 { type: 'point' } 分支
// ---------------------------------------------------------------------------
type SearchListItem = { type: 'bangumi'; data: Bangumi } | { type: 'point'; data: Point; bangumi: Bangumi };

type TabKey = 'recent' | 'popular';

const TABS: { key: TabKey; label: TranslationMessage }[] = [
  { key: 'recent', label: { key: 'recentlyUpdated', defaultValue: '最近更新' } },
  { key: 'popular', label: { key: 'popularWorks', defaultValue: '热门作品' } },
];

// ---------------------------------------------------------------------------
// 巡礼点卡片（搜索结果用）
// ---------------------------------------------------------------------------
function PointCard({ point, bangumi, onPress }: { point: Point; bangumi: Bangumi; onPress: () => void }) {
  return (
    <PointListCard
      point={point}
      bangumi={bangumi}
      description={point.mark}
      meta={point.folder}
      onPress={onPress}
      showMediaLabels
      showFavorite
      showAddToPlan
    />
  );
}

// ---------------------------------------------------------------------------
// 主页面
// ---------------------------------------------------------------------------
const Search = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>('recent');
  const [inputText, setInputText] = useState('');
  const [query, setQuery] = useState('');
  const flashListRef = useRef<FlashListRef<SearchListItem>>(null);
  const router = useRouter();
  const data = useMapData((state) => state.data);
  const openBangumiDetails = useMapBrowse((state) => state.openBangumiDetails);
  const focusPointFromList = useMapBrowse((state) => state.focusPointFromList);

  const handleBangumiPress = useCallback(
    (bangumi: Bangumi) => {
      openBangumiDetails(bangumi.id);
      router.back();
    },
    [openBangumiDetails, router],
  );

  const handlePointPress = useCallback(
    (point: Point, bangumi: Bangumi) => {
      focusPointFromList({ bangumiId: bangumi.id, pointId: point.id });
      router.back();
    },
    [focusPointFromList, router],
  );

  const searchMode = query.trim().length > 0;

  const handleInputTextChange = useCallback((value: string) => {
    setInputText(value);
    if (value === '') setQuery('');
  }, []);

  useEffect(() => {
    if (inputText === '') return;
    const timer = setTimeout(() => setQuery(inputText), 300);
    return () => clearTimeout(timer);
  }, [inputText]);

  useEffect(() => {
    flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [query]);

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
        String(b.tAbbr ?? '')
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
  }, [data, tab, searchMode, bangumiResults, pointResults]);

  const renderItem = useCallback(
    ({ item }: { item: SearchListItem }) => {
      switch (item.type) {
        case 'bangumi':
          return (
            <CardListItem>
              <BangumiListCard bangumi={item.data} onPress={() => handleBangumiPress(item.data)} />
            </CardListItem>
          );
        case 'point':
          return (
            <CardListItem>
              <PointCard
                point={item.data}
                bangumi={item.bangumi}
                onPress={() => handlePointPress(item.data, item.bangumi)}
              />
            </CardListItem>
          );
      }
    },
    [handleBangumiPress, handlePointPress],
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
      <View flex={1} pt={insets.top === 0 ? '$2' : insets.top} mt="$2" bg="$pageBackground">
        <View px="$3">
          <SearchBox
            focusOnRoute
            value={inputText}
            onChangeText={handleInputTextChange}
            allowClear
            placeholderTextColor="$color10"
          />
        </View>

        {/* Tab 切换栏 — 搜索时隐藏 */}
        {!searchMode && (
          <View flexDirection="row" mx="$3" mt="$3" gap="$1">
            {TABS.map((tabItem) => (
              <Pressable
                key={tabItem.key}
                onPress={() => {
                  if (tab === tabItem.key) return;

                  setTab(tabItem.key);
                  flashListRef.current?.scrollToOffset({
                    offset: 0,
                    animated: false,
                  });
                }}
              >
                <View
                  bg={tab === tabItem.key ? '$color3' : 'transparent'}
                  p="$2"
                  px="$3.5"
                  rounded={tab === tabItem.key ? '$9' : undefined}
                >
                  <Text
                    fontWeight={tab === tabItem.key ? '600' : '400'}
                    color={tab === tabItem.key ? '$primary' : '$color11'}
                    fontSize="$body"
                  >
                    {translateMessage(t, tabItem.label)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* 列表 */}
        {searchMode && listItems.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text fontSize="$body" color="$color11">
              {t('noMatchingLocationsFound', { defaultValue: '未找到相关地标' })}
            </Text>
          </View>
        ) : (
          <FlashList
            ref={flashListRef}
            data={listItems}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={{
              paddingHorizontal: getTokens().space['3'].val,
              paddingTop: getCardListBoundarySpacing(getTokens().space['3'].val),
              paddingBottom: insets.bottom + 16,
            }}
            maintainVisibleContentPosition={{
              disabled: true,
            }}
          />
        )}
      </View>
    </Pressable>
  );
};

export default Search;
