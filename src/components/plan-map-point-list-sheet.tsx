import PointListCard from '@/components/point-list-card';
import type { PlanMapResolvedPoint } from '@/components/plan-map-point-types';
import { getBangumiTitle, getPointTitle } from '@/lib/localized-data';
import { LegendList, type LegendListRef } from '@legendapp/list/react-native';
import { Check, ListTodo } from '@tamagui/lucide-icons-2';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { forwardRef, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, useTheme, View, XStack, YStack } from 'tamagui';

type Props = {
  points: PlanMapResolvedPoint[];
  selectedKey?: string;
  onSelect: (resolved: PlanMapResolvedPoint) => void;
  onToggleCompleted: (resolved: PlanMapResolvedPoint) => void;
};

const PLAN_POINT_ROW_SIZE = 104;

function getPlanPointRowSize() {
  return PLAN_POINT_ROW_SIZE;
}

const PlanMapPointListSheet = forwardRef<TrueSheet, Props>(function PlanMapPointListSheet(
  { points, selectedKey, onSelect, onToggleCompleted },
  ref,
) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const listRef = useRef<LegendListRef>(null);
  const listReadyRef = useRef(false);
  const sheetPresentedRef = useRef(false);
  const pendingScrollRef = useRef(false);
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const completed = points.filter((resolved) => resolved.item.completed).length;
  const visiblePoints = useMemo(
    () => (showIncompleteOnly ? points.filter((resolved) => !resolved.item.completed) : points),
    [points, showIncompleteOnly],
  );
  const selectedIndex = useMemo(
    () => visiblePoints.findIndex((resolved) => resolved.item.key === selectedKey),
    [selectedKey, visiblePoints],
  );
  const initialScrollIndex = useMemo(
    () => (selectedIndex >= 0 ? { index: selectedIndex, viewOffset: 4, viewPosition: 0 } : undefined),
    [selectedIndex],
  );

  const scrollToSelected = useCallback(() => {
    if (!listReadyRef.current || selectedIndex < 0) {
      pendingScrollRef.current = false;
      return;
    }
    pendingScrollRef.current = false;
    void listRef.current?.scrollToIndex({ index: selectedIndex, viewOffset: 4, viewPosition: 0, animated: false });
  }, [selectedIndex]);

  const handleListReady = useCallback(() => {
    listReadyRef.current = true;
    if (sheetPresentedRef.current && pendingScrollRef.current) scrollToSelected();
  }, [scrollToSelected]);

  const toggleIncompleteFilter = useCallback(() => {
    listReadyRef.current = false;
    pendingScrollRef.current = true;
    setShowIncompleteOnly((current) => !current);
  }, []);

  const renderPoint = useCallback(
    ({ item: resolved }: { item: PlanMapResolvedPoint }) => {
      const { point, bangumi, item, planIndex } = resolved;
      const selected = item.key === selectedKey;
      return (
        <View>
          <PointListCard
            point={point}
            bangumi={bangumi}
            title={getPointTitle(point, i18n.resolvedLanguage) || t('unnamedLocation', { defaultValue: '未命名点位' })}
            subtitle={getBangumiTitle(bangumi, i18n.resolvedLanguage) || t('unknownWork', { defaultValue: '未知作品' })}
            description={point.mark}
            showMediaLabels
            sequenceNumber={planIndex + 1}
            height={96}
            imageWidth={132}
            opacity={item.completed ? 0.58 : 1}
            selected={selected}
            onPress={() => onSelect(resolved)}
            accessibilityState={{ selected }}
            accessibilityLabel={t('showLocationOnMap', {
              defaultValue: '在地图中查看{{title}}',
              title: getPointTitle(point, i18n.resolvedLanguage),
            })}
            statusAction={
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={
                  item.completed
                    ? t('markIncomplete', { defaultValue: '取消完成' })
                    : t('markComplete', { defaultValue: '标记完成' })
                }
                accessibilityState={{ checked: item.completed }}
                hitSlop={12}
                onPress={(event) => {
                  event.stopPropagation();
                  onToggleCompleted(resolved);
                }}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <View width={30} height={30} items="center" justify="center">
                  <Check
                    size={20}
                    strokeWidth={item.completed ? 3.5 : 3}
                    color={item.completed ? theme.primary.val : theme.color8.val}
                  />
                </View>
              </Pressable>
            }
          />
        </View>
      );
    },
    [
      i18n.resolvedLanguage,
      onSelect,
      onToggleCompleted,
      selectedKey,
      t,
      theme.color8.val,
      theme.primary.val,
    ],
  );

  return (
    <TrueSheet
      ref={ref}
      detents={[0.58, 0.9]}
      scrollable
      scrollableOptions={{ scrollingExpandsSheet: false }}
      cornerRadius={22}
      backgroundColor={theme.color2.val}
      grabberOptions={{ color: theme.primary.val, adaptive: false, topMargin: 8, width: 42, height: 5 }}
      onDidPresent={() => {
        sheetPresentedRef.current = true;
        if (listReadyRef.current) {
          scrollToSelected();
        } else {
          pendingScrollRef.current = true;
        }
      }}
      onDidDismiss={() => {
        sheetPresentedRef.current = false;
        pendingScrollRef.current = false;
      }}
      header={
        <YStack bg="$color2" px="$4" pt="$5" pb="$2" gap="$0.5">
          <XStack items="center" justify="space-between">
            <Text fontSize="$subtitle" fontWeight="700" color="$color12">
              {t('planLocations', { defaultValue: '计划点位' })}
            </Text>
            <XStack items="center" gap="$1">
              <Text fontSize="$footnote" color="$color10" style={{ fontVariant: ['tabular-nums'] }}>
                {completed} / {points.length}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  showIncompleteOnly
                    ? t('showAllLocations', { defaultValue: '显示全部点位' })
                    : t('showIncompleteLocationsOnly', { defaultValue: '仅显示未完成点位' })
                }
                accessibilityState={{ selected: showIncompleteOnly }}
                hitSlop={8}
                onPress={toggleIncompleteFilter}
                style={({ pressed }) => ({ opacity: pressed ? 0.58 : 1 })}
              >
                <View width={36} height={32} items="center" justify="center">
                  {showIncompleteOnly ? (
                    <ListTodo size={20} strokeWidth={2.2} color="$primary" />
                  ) : (
                    <ListTodo size={20} strokeWidth={2.2} color="$color10" />
                  )}
                </View>
              </Pressable>
            </XStack>
          </XStack>
          <Text fontSize="$caption" color="$color10">
            {t('tapALocationToShowItOnTheMap', { defaultValue: '点击点位即可在地图中定位' })}
          </Text>
        </YStack>
      }
    >
      <LegendList
        ref={listRef}
        data={visiblePoints}
        recycleItems
        dataKey={showIncompleteOnly ? 'incomplete' : 'all'}
        extraData={selectedKey}
        keyExtractor={(resolved) => resolved.item.key}
        renderItem={renderPoint}
        getFixedItemSize={getPlanPointRowSize}
        initialScrollIndex={initialScrollIndex}
        onReady={handleListReady}
        ListEmptyComponent={
          <YStack minH={180} items="center" justify="center" px="$4">
            <Text color="$color11">
              {showIncompleteOnly
                ? t('noIncompleteLocations', { defaultValue: '没有未完成点位' })
                : t('noLocationsInThisPlanYet', { defaultValue: '计划里还没有点位' })}
            </Text>
          </YStack>
        }
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 28 }}
      />
    </TrueSheet>
  );
});

export default PlanMapPointListSheet;
