import { formatDuration } from '@/lib/formatDuration';
import { baseUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { useSelectedBangumi } from '@/store/use-selected-bangumi';
import BottomSheet, { BottomSheetSectionList } from '@gorhom/bottom-sheet';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable } from 'react-native-gesture-handler';
import { getTokens, Text, useTheme, View } from 'tamagui';

const coverUrl = (cover?: string, query?: string) =>
  cover && (cover.startsWith('http://') || cover.startsWith('https://'))
    ? cover
    : baseUrl + cover + (query ? `?${query}` : '');

const PointCard = memo(
  function PointCard({ point, bangumi, onPress }: { point: Point; bangumi: Bangumi; onPress?: () => void }) {
    const theme = useTheme();
    const pointTitle = point.cn || point.name || '未命名点位';
    const epLabel =
      typeof point.ep === 'number' && point.ep > 0
        ? `EP${point.ep}`
        : typeof point.ep === 'string' && point.ep
          ? point.ep
          : undefined;
    const timeLabel = typeof point.s === 'number' && point.s >= 0 ? formatDuration(point.s) : undefined;

    return (
      <Pressable onPress={onPress}>
        <View
          bg="$color2"
          mb="$2"
          mx="$2"
          display="flex"
          flexDirection="row"
          rounded="$4"
          height={100}
          overflow="hidden"
          shadowColor="$shadowColor"
          boxShadow="0 1px 4px $shadowColor"
        >
          <View width={150} height={100} style={{ borderRadius: getTokens().radius['4'].val, overflow: 'hidden' }}>
            <Image
              key={point.image ? coverUrl(point.image) : 'none'}
              source={point.image ? coverUrl(point.image, 'plan=h160') : undefined}
              style={{ width: 150, height: 100, backgroundColor: theme.color9.val }}
              contentFit="cover"
            />
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
          <View flex={1} p="$2" style={{ justifyContent: 'space-between' }}>
            <View>
              <Text fontWeight="600" fontSize={14} color="$color12" numberOfLines={1}>
                {pointTitle}
              </Text>
              <Text fontSize={11} color="$primary" mt="$1" numberOfLines={1}>
                {bangumi.cn || bangumi.title || bangumi.en || '未知'}
              </Text>
              {point.mark ? (
                <Text fontSize={11} lineHeight={11} color="$color11" mt="$0.5" numberOfLines={3}>
                  {point.mark}
                </Text>
              ) : null}
            </View>
            {point.folder && (
              <Text position="absolute" r="$2" b="$1.5" fontSize={11} color="$color10" style={{ textAlign: 'right' }}>
                {point.folder}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  },
  (prev, next) => prev.point.id === next.point.id && prev.bangumi.id === next.bangumi.id,
);

export interface BangumiDetailSheetRef {
  snapToIndex: (index: number) => void;
  close: () => void;
}

type AccordionMode = 'ep' | 'folder';

interface AccordionSection {
  key: string;
  title: string;
  data: Point[];
}

function groupPoints(points: Point[], mode: AccordionMode, bangumi: Bangumi): AccordionSection[] {
  if (mode === 'ep') {
    const map = new Map<string, Point[]>();
    for (const p of points) {
      const key = typeof p.ep === 'number' ? String(p.ep) : '__no_ep__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    const sections: AccordionSection[] = [];
    const numericKeys = Array.from(map.keys())
      .filter((k) => k !== '__no_ep__')
      .sort((a, b) => Number(a) - Number(b));
    for (const k of numericKeys) {
      sections.push({ key: `ep-${k}`, title: `EP${k}`, data: map.get(k)! });
    }
    if (map.has('__no_ep__')) {
      sections.push({ key: 'ep-other', title: '其他', data: map.get('__no_ep__')! });
    }
    return sections;
  }

  const map = new Map<string, Point[]>();
  for (const p of points) {
    const key = p.folder || '__bangumi__';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  const sections: AccordionSection[] = [];
  if (map.has('__bangumi__')) {
    sections.push({
      key: 'folder-bangumi',
      title: bangumi.cn || bangumi.title || bangumi.en || '番剧',
      data: map.get('__bangumi__')!,
    });
    map.delete('__bangumi__');
  }
  const folderKeys = Array.from(map.keys()).sort();
  for (const k of folderKeys) {
    sections.push({ key: `folder-${k}`, title: k, data: map.get(k)! });
  }
  return sections;
}

const BangumiDetailSheet = forwardRef<BangumiDetailSheetRef>((_, ref) => {
  const { selectedBangumi, setSelectedPoint } = useSelectedBangumi();
  const theme = useTheme();
  const sheetRef = useRef<BottomSheet>(null);

  const [accordionMode, setAccordionMode] = useState<AccordionMode>('ep');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const allExpandedRef = useRef(true);

  useImperativeHandle(ref, () => ({
    snapToIndex: (index: number) => sheetRef.current?.snapToIndex(index),
    close: () => sheetRef.current?.close(),
  }));

  // 选中番剧时打开 sheet，关闭时清除选中
  useEffect(() => {
    if (selectedBangumi) {
      sheetRef.current?.snapToIndex(1);
    } else {
      sheetRef.current?.close();
    }
  }, [selectedBangumi]);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index < 0) setSelectedPoint(null);
    },
    [setSelectedPoint],
  );

  const sections = useMemo(() => {
    if (!selectedBangumi) return [];
    return groupPoints(selectedBangumi.points, accordionMode, selectedBangumi);
  }, [selectedBangumi, accordionMode]);

  const allExpanded = expandedKeys.size === sections.length && sections.length > 0;

  // 同步 ref
  useEffect(() => {
    allExpandedRef.current = allExpanded;
  }, [allExpanded]);

  // mode 切换时保持全部展开/折叠状态不变
  useEffect(() => {
    if (allExpandedRef.current) {
      setExpandedKeys(new Set(sections.map((s) => s.key)));
    } else {
      setExpandedKeys(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accordionMode]);

  // 番剧切换时重置为全部展开
  useEffect(() => {
    setExpandedKeys(new Set(sections.map((s) => s.key)));
    allExpandedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBangumi]);

  const expandAll = useCallback(() => {
    setExpandedKeys(new Set(sections.map((s) => s.key)));
  }, [sections]);

  const collapseAll = useCallback(() => {
    setExpandedKeys(new Set());
  }, []);

  const toggleSection = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const filteredSections = useMemo(
    () => sections.map((s) => ({ ...s, data: expandedKeys.has(s.key) ? s.data : [] })),
    [sections, expandedKeys],
  );

  const renderItem = useCallback(
    ({ item }: { item: Point }) => (
      <PointCard
        point={item}
        bangumi={selectedBangumi!}
        onPress={() => {
          setSelectedPoint({ point: item, bangumi: selectedBangumi! });
          sheetRef.current?.snapToIndex(0);
        }}
      />
    ),
    [selectedBangumi, setSelectedPoint],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: AccordionSection }) => (
      <Pressable onPress={() => toggleSection(section.key)}>
        <View position="absolute" t={-1} l={0} r={0} height={2} bg="$color1" />
        <View
          flexDirection="row"
          style={{ alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: theme.color5.val }}
          px="$2"
          py="$2"
          bg="$color1"
        >
          <Text fontWeight="600" fontSize={14} color="$color12" flex={1}>
            {section.title}
          </Text>
          <Text fontSize={12} color="$color10">
            {expandedKeys.has(section.key) ? '▲' : '▼'}
          </Text>
        </View>
      </Pressable>
    ),
    [toggleSection, expandedKeys, theme],
  );

  const ITEM_HEIGHT = 140;
  const SECTION_HEADER_HEIGHT = 36;

  const getItemLayout = useCallback(
    (_data: unknown, index: number) => {
      let remaining = index;
      let offset = 0;

      for (const section of filteredSections) {
        // section header
        if (remaining === 0) {
          return { length: SECTION_HEADER_HEIGHT, offset, index };
        }
        offset += SECTION_HEADER_HEIGHT;
        remaining--;

        const count = section.data.length;
        if (remaining < count) {
          offset += remaining * ITEM_HEIGHT;
          return { length: ITEM_HEIGHT, offset, index };
        }
        offset += count * ITEM_HEIGHT;
        remaining -= count;
      }

      return { length: ITEM_HEIGHT, offset: index * ITEM_HEIGHT, index };
    },
    [filteredSections],
  );

  return (
    <BottomSheet
      index={selectedBangumi ? 1 : -1}
      ref={sheetRef}
      snapPoints={['25%', '80%']}
      // enablePanDownToClose
      enableDynamicSizing={false}
      onChange={handleSheetChange}
      backgroundStyle={{ backgroundColor: theme.color1.val }}
      handleIndicatorStyle={{ backgroundColor: theme.color9.val }}
    >
      {selectedBangumi && (
        <BottomSheetSectionList
          sections={filteredSections}
          stickySectionHeadersEnabled={true}
          keyExtractor={(item: Point) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          getItemLayout={getItemLayout}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={true}
          ListHeaderComponent={
            <>
              <View px="$2" mb="$4" display="flex" flexDirection="row" rounded="$4" gap="$2.5">
                <Image
                  key={coverUrl(selectedBangumi.cover ?? '')}
                  source={coverUrl(selectedBangumi.cover ?? '')}
                  style={{
                    width: 180,
                    height: 140,
                    borderRadius: getTokens().radius['4'].val,
                    backgroundColor: selectedBangumi.color || '$color9',
                  }}
                  contentFit="cover"
                />
                <View flex={1}>
                  {selectedBangumi.cn ? (
                    <Text fontWeight="600" fontSize={16} color="$color12" pr="$8" numberOfLines={2}>
                      {selectedBangumi.cn}
                    </Text>
                  ) : null}
                  <Text fontSize={12} color="$color11" mt="$1" mb="$1" numberOfLines={1}>
                    {selectedBangumi.title}
                  </Text>
                  <View flexDirection="row">
                    {selectedBangumi.city && (
                      <Text fontSize={12} color="$color11">
                        {selectedBangumi.city} {'· '}
                      </Text>
                    )}
                    <Text fontSize={12} color="$color11">
                      <Text color="$primary" fontWeight="bold">
                        {selectedBangumi.points.length}
                      </Text>
                      个巡礼点
                    </Text>
                  </View>
                  <Text fontSize={10} color="$color11" position="absolute" r="$0" b="$0">
                    最近更新：{dayjs(selectedBangumi.modified).format('YYYY-MM-DD HH:mm')}
                  </Text>
                </View>
                {selectedBangumi.cat?.trim() ? (
                  <View
                    position="absolute"
                    t="$2"
                    r="$2"
                    px="$2"
                    py="$1"
                    rounded="$2"
                    style={{ backgroundColor: selectedBangumi.color || '$color9' }}
                  >
                    <Text fontSize={10} color="white" fontWeight="500">
                      {selectedBangumi.cat}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Tab 栏 + 折叠/展开全部 */}
              <View flexDirection="row" items="center" px="$2" mb="$2" gap="$2">
                <View flexDirection="row" gap="$1" flex={1}>
                  <Pressable onPress={() => setAccordionMode('ep')}>
                    <View
                      bg={accordionMode === 'ep' ? '$color3' : 'transparent'}
                      p="$2"
                      px="$3.5"
                      rounded={accordionMode === 'ep' ? '$9' : undefined}
                    >
                      <Text
                        fontWeight={accordionMode === 'ep' ? '600' : '400'}
                        color={accordionMode === 'ep' ? '$primary' : '$color11'}
                        fontSize={14}
                      >
                        集数
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable onPress={() => setAccordionMode('folder')}>
                    <View
                      bg={accordionMode === 'folder' ? '$color3' : 'transparent'}
                      p="$2"
                      px="$3.5"
                      rounded={accordionMode === 'folder' ? '$9' : undefined}
                    >
                      <Text
                        fontWeight={accordionMode === 'folder' ? '600' : '400'}
                        color={accordionMode === 'folder' ? '$primary' : '$color11'}
                        fontSize={14}
                      >
                        区域
                      </Text>
                    </View>
                  </Pressable>
                </View>
                <View flexDirection="row" gap="$2">
                  <Pressable
                    onPress={expandAll}
                    style={({ pressed }: { pressed: boolean }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    <Text fontSize={13} color="$primary">
                      展开全部
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={collapseAll}
                    style={({ pressed }: { pressed: boolean }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    <Text fontSize={13} color="$primary">
                      折叠全部
                    </Text>
                  </Pressable>
                </View>
              </View>
            </>
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </BottomSheet>
  );
});

export default BangumiDetailSheet;
