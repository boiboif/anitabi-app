import { formatDuration } from '@/lib/formatDuration';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { useSelectedBangumi } from '@/store/use-selected-bangumi';
import BottomSheet, { useBottomSheetScrollableCreator } from '@gorhom/bottom-sheet';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { getTokens, Text, useTheme, View } from 'tamagui';

const CARD_HEIGHT = 100;
const SECTION_HEADER_HEIGHT = 32;

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
          height={CARD_HEIGHT}
          overflow="hidden"
          boxShadow="0 1px 4px $shadowColor"
        >
          <View
            width={150}
            height={CARD_HEIGHT}
            style={{ borderRadius: getTokens().radius['4'].val, overflow: 'hidden' }}
          >
            <Image
              source={point.image ? buildImageUrl(point.image, 'plan=h160') : undefined}
              style={{ width: 150, height: CARD_HEIGHT, backgroundColor: theme.color9.val }}
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

const ITEM_TYPE_HEADER = 'sectionHeader';
const ITEM_TYPE_POINT = 'point';

interface FlatSectionHeader {
  type: typeof ITEM_TYPE_HEADER;
  id: string;
  title: string;
  count: number;
}

interface FlatPointItem {
  type: typeof ITEM_TYPE_POINT;
  id: string;
  point: Point;
}

type FlatItem = FlatSectionHeader | FlatPointItem;

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
      sections.push({ key: `${bangumi.id}-ep-${k}`, title: `EP${k}`, data: map.get(k)! });
    }
    if (map.has('__no_ep__')) {
      sections.push({ key: `${bangumi.id}-ep-other`, title: '其他', data: map.get('__no_ep__')! });
    }
    return sections;
  }

  // 第1层：先统计同名频率
  const nameFreq = new Map<string, number>();
  for (const p of points) {
    if (p.name) nameFreq.set(p.name, (nameFreq.get(p.name) || 0) + 1);
  }

  // 第1.5层：同名 >1 的形成 name-group
  const nameMap = new Map<string, Point[]>();
  const afterName: Point[] = [];
  for (const p of points) {
    if (p.name && (nameFreq.get(p.name) || 0) > 1) {
      if (!nameMap.has(p.name)) nameMap.set(p.name, []);
      nameMap.get(p.name)!.push(p);
    } else {
      afterName.push(p);
    }
  }

  // 第2层：从剩余点中统计 folder 频率
  const folderFreq = new Map<string, number>();
  for (const p of afterName) {
    const key = p.folder || '__bangumi__';
    folderFreq.set(key, (folderFreq.get(key) || 0) + 1);
  }

  // 第2.5层：同 folder >1 的形成 folder-group（排除 __bangumi__）
  const folderMap = new Map<string, Point[]>();
  const leftover: Point[] = [];
  for (const p of afterName) {
    const key = p.folder || '__bangumi__';
    if (key !== '__bangumi__' && (folderFreq.get(key) || 0) >= 1) {
      if (!folderMap.has(key)) folderMap.set(key, []);
      folderMap.get(key)!.push(p);
    } else {
      leftover.push(p);
    }
  }

  // 组装 sections：__bangumi__ → name → folder
  const sections: AccordionSection[] = [
    {
      key: 'folder-bangumi',
      title: bangumi.cn || bangumi.title || bangumi.en || '番剧',
      data: leftover,
    },
  ];
  const nameKeys = Array.from(nameMap.keys()).sort();
  for (const k of nameKeys) {
    sections.push({ key: `name-${k}`, title: k, data: nameMap.get(k)! });
  }
  const folderKeys = Array.from(folderMap.keys()).sort();
  for (const k of folderKeys) {
    sections.push({ key: `folder-${k}`, title: k, data: folderMap.get(k)! });
  }
  return sections;
}

const BangumiDetailSheet = forwardRef<BangumiDetailSheetRef>((_, ref) => {
  const { selectedBangumi, setSelectedPoint, setSelectedBangumi } = useSelectedBangumi();
  const theme = useTheme();
  const sheetRef = useRef<BottomSheet>(null);

  const [accordionMode, setAccordionMode] = useState<AccordionMode>('ep');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const allExpandedRef = useRef(true);
  const isSheetOpenRef = useRef(false);
  const BottomSheetScrollable = useBottomSheetScrollableCreator();

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
      isSheetOpenRef.current = index >= 0;
      if (index < 0) {
        setSelectedPoint(null);
        setSelectedBangumi(null);
      }
    },
    [setSelectedPoint],
  );

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isSheetOpenRef.current) {
        sheetRef.current?.close();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, []);

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

  // 拍平为含 section header 的扁平数组
  const flatData: FlatItem[] = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const s of sections) {
      countMap.set(s.key, s.data.length);
    }
    const items: FlatItem[] = [];
    for (const section of filteredSections) {
      items.push({
        type: ITEM_TYPE_HEADER,
        id: `header-${section.key}`,
        title: section.title,
        count: countMap.get(section.key) ?? 0,
      });
      for (const point of section.data) {
        items.push({ type: ITEM_TYPE_POINT, id: `point-${point.id}-${point.name}`, point });
      }
    }
    return items;
  }, [filteredSections, sections]);

  // 计算 sticky header 索引
  const stickyHeaderIndices = useMemo(
    () => flatData.map((item, index) => (item.type === ITEM_TYPE_HEADER ? index : -1)).filter((i) => i >= 0),
    [flatData],
  );

  const renderFlashItem = useCallback(
    ({ item }: { item: FlatItem }) => {
      if (item.type === ITEM_TYPE_HEADER) {
        const sectionKey = item.id.slice('header-'.length);
        return (
          <Pressable
            android_ripple={{ color: theme.color5.val }}
            style={{ height: SECTION_HEADER_HEIGHT, backgroundColor: theme.color1.val }}
            onPress={() => toggleSection(sectionKey)}
          >
            <View position="absolute" t={-1} l={0} r={0} height={2} bg="$color1" />
            <View flexDirection="row" style={{ alignItems: 'center' }} px="$2" py="$2">
              <Text fontWeight="600" fontSize={14} color="$color12" flex={1}>
                {item.title}
              </Text>
              <Text fontSize={11} color="$color10" mr="$1">
                {item.count}
              </Text>
              <Text fontSize={12} color="$color10">
                {expandedKeys.has(sectionKey) ? '▲' : '▼'}
              </Text>
            </View>
          </Pressable>
        );
      }
      return (
        <PointCard
          point={item.point}
          bangumi={selectedBangumi!}
          onPress={() => {
            setSelectedPoint({ point: item.point, bangumi: selectedBangumi! });
            sheetRef.current?.snapToIndex(0);
          }}
        />
      );
    },
    [selectedBangumi, setSelectedPoint, toggleSection, expandedKeys, theme],
  );

  const flashListRef = useRef<FlashListRef<FlatItem>>(null);

  return (
    <BottomSheet
      index={-1}
      ref={sheetRef}
      snapPoints={['25%', '80%']}
      // enablePanDownToClose
      enableDynamicSizing={false}
      onChange={handleSheetChange}
      backgroundStyle={{ backgroundColor: theme.color1.val }}
      handleIndicatorStyle={{ backgroundColor: theme.primary.val }}
    >
      <FlashList
        key={selectedBangumi?.id}
        ref={flashListRef}
        data={flatData}
        renderItem={renderFlashItem}
        getItemType={(item) => item.type}
        keyExtractor={(item: FlatItem) => item.id}
        stickyHeaderIndices={stickyHeaderIndices}
        renderScrollComponent={BottomSheetScrollable}
        ListHeaderComponent={
          <>
            <View px="$2" mb="$4" display="flex" flexDirection="row" rounded="$4" gap="$2.5">
              <Image
                source={buildImageUrl(selectedBangumi?.cover ?? '')}
                style={{
                  width: 180,
                  height: 140,
                  borderRadius: getTokens().radius['4'].val,
                  backgroundColor: selectedBangumi?.color || '$color9',
                }}
                contentFit="cover"
              />
              <View flex={1}>
                {selectedBangumi?.cn ? (
                  <Text fontWeight="600" fontSize={16} color="$color12" pr="$8" numberOfLines={2}>
                    {selectedBangumi?.cn}
                  </Text>
                ) : null}
                <Text fontSize={12} color="$color11" mt="$1" mb="$1" numberOfLines={1}>
                  {selectedBangumi?.title}
                </Text>
                <View flexDirection="row">
                  {selectedBangumi?.city && (
                    <Text fontSize={12} color="$color11">
                      {selectedBangumi?.city} {'· '}
                    </Text>
                  )}
                  <Text fontSize={12} color="$color11">
                    <Text color="$primary" fontWeight="bold">
                      {selectedBangumi?.points.length}
                    </Text>
                    个巡礼点
                  </Text>
                </View>
                <Text fontSize={10} color="$color11" position="absolute" r="$0" b="$0">
                  最近更新：{dayjs(selectedBangumi?.modified).format('YYYY-MM-DD HH:mm')}
                </Text>
              </View>
              {selectedBangumi?.cat?.trim() ? (
                <View
                  position="absolute"
                  t="$2"
                  r="$2"
                  px="$2"
                  py="$1"
                  rounded="$2"
                  style={{ backgroundColor: selectedBangumi?.color || '$color9' }}
                >
                  <Text fontSize={10} color="white" fontWeight="500">
                    {selectedBangumi?.cat}
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
                      话数
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
                      分组
                    </Text>
                  </View>
                </Pressable>
              </View>
              <View flexDirection="row" gap="$2">
                <Pressable
                  onPress={collapseAll}
                  style={({ pressed }: { pressed: boolean }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text fontSize={13} color="$primary">
                    折叠全部
                  </Text>
                </Pressable>
                <Pressable
                  onPress={expandAll}
                  style={({ pressed }: { pressed: boolean }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text fontSize={13} color="$primary">
                    展开全部
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />
    </BottomSheet>
  );
});

export default BangumiDetailSheet;
