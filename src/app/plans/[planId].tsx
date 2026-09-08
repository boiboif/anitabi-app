import { ActionSheet, type ActionSheetRef } from '@/components/action-sheet';
import PointListCard from '@/components/point-list-card';
import { StrictButton as Button } from '@/components/strict-button';
import type { Bangumi, Point } from '@/services/types';
import { useMapData } from '@/store/use-map-data';
import { usePlans } from '@/store/use-plans';
import { FlashList } from '@shopify/flash-list';
import { ArrowDownUp, Check, GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from '@tamagui/lucide-icons-2';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { Sortable, SortableItem, type SortableRenderItemProps } from 'react-native-reanimated-dnd';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack, useTheme } from 'tamagui';

type ResolvedItem = {
  id: string;
  item: ReturnType<typeof usePlans.getState>['plans'][number]['items'][number];
  point?: Point;
  bangumi?: Bangumi;
};

type DraggablePointRowProps = {
  resolved: ResolvedItem;
  onPress?: () => void;
  onToggle: () => void;
  onRemove: () => void;
  theme: ReturnType<typeof useTheme>;
  sorting: boolean;
};

function getOrderedKeys(allPositions: Record<string, number>): string[] {
  return Object.entries(allPositions)
    .sort(([, firstPosition], [, secondPosition]) => firstPosition - secondPosition)
    .map(([key]) => key);
}

function DraggablePointRow({ resolved, onPress, onToggle, onRemove, theme, sorting }: DraggablePointRowProps) {
  const { item, point, bangumi } = resolved;

  return (
    <PointListCard
      point={point}
      bangumi={bangumi}
      title={point?.cn || point?.name || item.snapshot.pointName}
      subtitle={bangumi?.cn || bangumi?.title || item.snapshot.bangumiName}
      description={point?.mark || item.snapshot.pointMark}
      image={point?.image || item.snapshot.pointImage}
      imageColor={bangumi?.color || item.snapshot.bangumiColor}
      disabled={sorting || !point || !bangumi}
      onPress={onPress}
      leading={
        sorting ? (
          <SortableItem.Handle style={{ width: 44, alignItems: 'center', justifyContent: 'center' }}>
            <GripVertical size={18} color="$color10" />
          </SortableItem.Handle>
        ) : null
      }
      statusAction={
        !sorting ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.completed ? '取消完成' : '标记完成'}
            hitSlop={12}
            onPress={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <View width={30} height={30} rounded="$9" bg="$color2" items="center" justify="center">
              <Check
                size={20}
                color={item.completed ? theme.primary.val : theme.color8.val}
                strokeWidth={item.completed ? 3.5 : 3}
              />
            </View>
          </Pressable>
        ) : null
      }
      topRightAction={
        sorting ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="移除巡礼点"
            hitSlop={8}
            onPress={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
          >
            <View width={30} height={30} rounded="$9" bg="$color2" items="center" justify="center">
              <Trash2 size={15} color="$color11" />
            </View>
          </Pressable>
        ) : undefined
      }
      topRightActionCentered
      showCamera={!sorting && Boolean(point && bangumi)}
      showNavigation={!sorting && Boolean(point && bangumi)}
    />
  );
}

const ITEM_HEIGHT = 116;

export default function PlanDetailScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const plan = usePlans((state) => state.plans.find((item) => item.id === planId));
  const deletePlan = usePlans((state) => state.deletePlan);
  const togglePoint = usePlans((state) => state.togglePoint);
  const removePoint = usePlans((state) => state.removePoint);
  const reorderPoints = usePlans((state) => state.reorderPoints);
  const data = useMapData((state) => state.data);
  const menuSheetRef = useRef<ActionSheetRef>(null);
  const [sorting, setSorting] = useState(false);

  const resolvedItems = useMemo<ResolvedItem[]>(() => {
    if (!plan) return [];
    return plan.items.map((item) => {
      const bangumi = data?.data.bangumis.find((entry) => entry.id === item.bangumiId);
      const point = bangumi?.points.find((entry) => entry.id === item.pointId);
      return { id: item.key, item, bangumi, point };
    });
  }, [data, plan]);

  const [sortableOrder, setSortableOrder] = useState<string[] | null>(null);
  const sortableItems = useMemo(() => {
    if (!sorting || !sortableOrder) return resolvedItems;
    const resolvedById = new Map(resolvedItems.map((item) => [item.id, item]));
    const next = sortableOrder.flatMap((id) => {
      const item = resolvedById.get(id);
      return item ? [item] : [];
    });
    const knownIds = new Set(next.map((item) => item.id));
    resolvedItems.forEach((item) => {
      if (!knownIds.has(item.id)) next.push(item);
    });
    return next;
  }, [resolvedItems, sortableOrder, sorting]);

  const toggleSorting = useCallback(() => {
    if (!sorting) {
      setSortableOrder(resolvedItems.map((item) => item.id));
    } else {
      setSortableOrder(null);
    }
    setSorting((current) => !current);
  }, [resolvedItems, sorting]);

  // Keep reordering on the UI thread during the gesture; persist the final order once on drop.
  const handleDrop = useCallback(
    (_id: string, _position: number, allPositions?: Record<string, number>) => {
      if (!allPositions) return;
      reorderPoints(planId, getOrderedKeys(allPositions));
    },
    [planId, reorderPoints],
  );

  const renderSortableItem = useCallback(
    ({ item, id, ...sortableProps }: SortableRenderItemProps<ResolvedItem>) => (
      <SortableItem key={id} id={id} data={item} {...sortableProps} onDrop={handleDrop}>
        <DraggablePointRow
          resolved={item}
          onToggle={() => togglePoint(planId, item.item.key)}
          onRemove={() => removePoint(planId, item.item.key)}
          theme={theme}
          sorting
        />
      </SortableItem>
    ),
    [handleDrop, planId, removePoint, theme, togglePoint],
  );

  const renderPointRow = useCallback(
    (item: ResolvedItem) => (
      <DraggablePointRow
        key={item.id}
        resolved={item}
        onPress={() => {
          if (item.bangumi && item.point) {
            router.navigate({
              pathname: '/plans/[planId]/map',
              params: {
                planId,
                bangumiId: item.bangumi.id,
                pointId: item.point.id,
              },
            });
          }
        }}
        onToggle={() => togglePoint(planId, item.item.key)}
        onRemove={() => removePoint(planId, item.item.key)}
        theme={theme}
        sorting={false}
      />
    ),
    [planId, removePoint, router, theme, togglePoint],
  );

  if (!plan) {
    return (
      <View flex={1} items="center" justify="center" bg="$background">
        <Text color="$color11">计划不存在或已被删除</Text>
      </View>
    );
  }

  const completed = plan.items.filter((item) => item.completed).length;
  const confirmDelete = () =>
    Alert.alert('删除巡礼计划', `确定删除“${plan.title}”吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          deletePlan(plan.id);
          router.back();
        },
      },
    ]);

  const openDeleteConfirm = () => {
    setTimeout(confirmDelete, 180);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.background?.val },
          headerTintColor: theme.color12?.val,
          headerBackButtonDisplayMode: 'minimal',
          headerRight: () => (
            <XStack items="center" gap="$1">
              <Button
                chromeless
                circular
                size="$3"
                icon={<Plus size={22} strokeWidth={2} />}
                onPress={() =>
                  router.navigate({ pathname: '/plans/[planId]/add', params: { planId: plan.id } } as never)
                }
                aria-label="添加巡礼点"
              />
              <Button
                chromeless
                circular
                size="$3"
                icon={<ArrowDownUp size={22} strokeWidth={2} />}
                color={sorting ? '$primary' : '$color12'}
                onPress={toggleSorting}
                aria-label={sorting ? '完成排序' : '排序巡礼点'}
              />
              <Button
                chromeless
                circular
                size="$3"
                icon={<MoreHorizontal size={22} strokeWidth={2} />}
                onPress={() => menuSheetRef.current?.present()}
                aria-label="更多操作"
              />
            </XStack>
          ),
        }}
      />
      <YStack flex={1} bg="$background">
        <XStack>
          <YStack flex={3} px="$4" pb="$2" gap="$1">
            <YStack gap="$1">
              <Text fontSize="$heading" fontWeight="700" color="$color12">
                {plan.title}
              </Text>
              {plan.description ? (
                <Text fontSize="$footnote" color="$color11">
                  {plan.description}
                </Text>
              ) : null}
            </YStack>
            <Text fontSize="$footnote" color="$color11">
              {completed} / {plan.items.length} 个点位
            </Text>
          </YStack>

          {/* <XStack flex={1}></XStack> */}
        </XStack>
        {resolvedItems.length === 0 ? (
          <YStack flex={1} minH={220} items="center" justify="center">
            <Text color="$color11">计划里还没有点位</Text>
          </YStack>
        ) : sorting ? (
          <Sortable
            data={sortableItems}
            itemHeight={ITEM_HEIGHT + 8}
            itemKeyExtractor={(entry) => entry.id}
            style={{ flex: 1, backgroundColor: theme.background?.val }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 30 }}
            renderItem={renderSortableItem}
          />
        ) : (
          <FlashList
            data={resolvedItems}
            renderItem={({ item }) => renderPointRow(item)}
            keyExtractor={(item) => item.id}
            style={{ flex: 1, backgroundColor: theme.background?.val }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 30 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </YStack>

      <ActionSheet
        ref={menuSheetRef}
        primaryAction={{
          label: '编辑计划信息',
          icon: Pencil,
          onPress: () => router.navigate({ pathname: '/plans/[planId]/edit', params: { planId: plan.id } } as never),
        }}
        sections={[{ actions: [{ label: '删除计划', icon: Trash2, destructive: true, onPress: openDeleteConfirm }] }]}
      />
    </>
  );
}
