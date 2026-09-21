import { ActionSheet, type ActionSheetRef } from '@/components/action-sheet';
import PointListCard from '@/components/point-list-card';
import StableReorderableList, {
  type StableReorderableListRenderItem,
} from '@/components/stable-reorderable-list';
import { StrictButton as Button } from '@/components/strict-button';
import { sharePlanFile } from '@/lib/plan-share-files';
import { createPlanShareBundle } from '@/lib/plan-sharing';
import { ICON_BUTTON_ICON_SIZE } from '@/lib/ui-sizes';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { useMapData } from '@/store/use-map-data';
import { usePlans } from '@/store/use-plans';
import {
  ArrowDownUp,
  Check,
  FileJson,
  GripVertical,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Share2,
  Trash2,
} from '@tamagui/lucide-icons-2';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack, useTheme } from 'tamagui';

type ResolvedItem = {
  id: string;
  item: ReturnType<typeof usePlans.getState>['plans'][number]['items'][number];
  point?: Point;
  bangumi?: Bangumi;
  imageSource?: string;
};

type DraggablePointRowProps = {
  resolved: ResolvedItem;
  onPress?: () => void;
  onToggle: () => void;
  onRemove: () => void;
  theme: ReturnType<typeof useTheme>;
  sorting: boolean;
  dragHandle?: ReactNode;
};

function ReorderHandle() {
  return (
    <View
      width={44}
      height="100%"
      items="center"
      justify="center"
      accessibilityRole="button"
      accessibilityLabel="拖动调整顺序"
      accessibilityHint="长按后上下拖动"
    >
      <GripVertical size={18} color="$color10" />
    </View>
  );
}

function RemovePointButton({ onRemove }: { onRemove: () => void }) {
  return (
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
      <View width={44} height="100%" items="center" justify="center">
        <Trash2 size={17} color="$color11" />
      </View>
    </Pressable>
  );
}

function DraggablePointRow({ resolved, onPress, onToggle, onRemove, theme, sorting, dragHandle }: DraggablePointRowProps) {
  const { item, point, bangumi } = resolved;

  return (
    <PointListCard
      point={point}
      bangumi={bangumi}
      title={point?.cn || point?.name || item.snapshot.pointName}
      subtitle={bangumi?.cn || bangumi?.title || item.snapshot.bangumiName}
      description={point?.mark || item.snapshot.pointMark}
      image={point?.image || item.snapshot.pointImage}
      imageSource={resolved.imageSource}
      imageRecyclingKey={resolved.id}
      imageColor={bangumi?.color || item.snapshot.bangumiColor}
      disabled={sorting || !point || !bangumi}
      onPress={onPress}
      leading={sorting ? <RemovePointButton onRemove={onRemove} /> : null}
      trailing={sorting ? dragHandle : null}
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
      showCamera={!sorting && Boolean(point && bangumi)}
      showNavigation={!sorting && Boolean(point && bangumi)}
    />
  );
}

const PLAN_POINT_ROW_HEIGHT = 117;
const DRAG_PREVIEW_HEIGHT = 79;
const REORDER_AUTOSCROLL_THRESHOLD = 72;
const REORDER_AUTOSCROLL_MAX_SPEED = 840;
const REORDER_MAX_FRAME_DURATION_MS = 34;

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
  const overflowSheetRef = useRef<ActionSheetRef>(null);
  const [sorting, setSorting] = useState(false);

  const bangumiById = useMemo(
    () => new Map((data?.data.bangumis ?? []).map((bangumi) => [bangumi.id, bangumi])),
    [data],
  );

  const resolvedItems = useMemo<ResolvedItem[]>(() => {
    if (!plan) return [];
    const pointsByBangumiId = new Map<number, Map<string, Point>>();
    return plan.items.map((item) => {
      const bangumi = bangumiById.get(item.bangumiId);
      let pointById = pointsByBangumiId.get(item.bangumiId);
      if (!pointById && bangumi) {
        pointById = new Map(bangumi.points.map((point) => [point.id, point]));
        pointsByBangumiId.set(item.bangumiId, pointById);
      }
      const point = pointById?.get(item.pointId);
      const imagePath = point?.image || item.snapshot.pointImage;
      const imageUri = imagePath ? buildImageUrl(imagePath, 'plan=h160') : undefined;
      return {
        id: item.key,
        item,
        bangumi,
        point,
        imageSource: imageUri,
      };
    });
  }, [bangumiById, plan]);

  const toggleSorting = useCallback(() => {
    setSorting((current) => !current);
  }, []);

  const handleReorder = useCallback(
    (nextOrderIds: string[]) => {
      reorderPoints(planId, nextOrderIds);
    },
    [planId, reorderPoints],
  );

  const renderListItem = useCallback(
    ({ item, dragHandle }: StableReorderableListRenderItem<ResolvedItem>) => (
      <DraggablePointRow
        resolved={item}
        onPress={
          sorting
            ? undefined
            : () => {
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
              }
        }
        onToggle={() => togglePoint(planId, item.item.key)}
        onRemove={() => removePoint(planId, item.item.key)}
        dragHandle={dragHandle}
        theme={theme}
        sorting={sorting}
      />
    ),
    [planId, removePoint, router, sorting, theme, togglePoint],
  );

  const keyExtractor = useCallback((item: ResolvedItem) => item.id, []);
  const renderDragHandle = useCallback(() => <ReorderHandle />, []);
  const renderDragPreview = useCallback(
    (resolved: ResolvedItem) => {
      const { item, point, bangumi } = resolved;
      return (
        <PointListCard
          point={point}
          bangumi={bangumi}
          title={point?.cn || point?.name || item.snapshot.pointName}
          subtitle={bangumi?.cn || bangumi?.title || item.snapshot.bangumiName}
          image={point?.image || item.snapshot.pointImage}
          imageSource={resolved.imageSource}
          imageColor={bangumi?.color || item.snapshot.bangumiColor}
          disabled
          height={72}
          imageWidth={72}
        />
      );
    },
    [],
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

  const openShare = () => {
    if (plan.items.length === 0) {
      Alert.alert('暂时无法分享', '计划中还没有点位，添加点位后再分享吧。');
      return;
    }
    const bundle = createPlanShareBundle(plan);
    if (bundle.qrEligible) {
      router.navigate({ pathname: '/plans/[planId]/share', params: { planId: plan.id } } as never);
      return;
    }
    overflowSheetRef.current?.present();
  };

  const shareLargePlanFile = () => {
    setTimeout(() => {
      void sharePlanFile(plan).catch((error) => {
        Alert.alert('无法分享计划文件', error instanceof Error ? error.message : '请稍后重试');
      });
    }, 220);
  };

  const openDisplayOnlyShare = () => {
    setTimeout(() => {
      router.navigate({ pathname: '/plans/[planId]/share', params: { planId: plan.id, displayOnly: '1' } } as never);
    }, 180);
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
                icon={<Plus size={ICON_BUTTON_ICON_SIZE} strokeWidth={2} />}
                onPress={() =>
                  router.navigate({ pathname: '/plans/[planId]/add', params: { planId: plan.id } } as never)
                }
                aria-label="添加巡礼点"
              />
              <Button
                chromeless
                circular
                size="$3"
                icon={<ArrowDownUp size={ICON_BUTTON_ICON_SIZE} strokeWidth={2} />}
                color={sorting ? '$primary' : '$color12'}
                onPress={toggleSorting}
                aria-label={sorting ? '完成排序' : '排序巡礼点'}
              />
              <Button
                chromeless
                circular
                size="$3"
                icon={<MoreHorizontal size={ICON_BUTTON_ICON_SIZE} strokeWidth={2} />}
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
        ) : (
          <StableReorderableList
            data={resolvedItems}
            enabled={sorting}
            itemHeight={PLAN_POINT_ROW_HEIGHT}
            keyExtractor={keyExtractor}
            renderItem={renderListItem}
            renderDragHandle={renderDragHandle}
            renderDragPreview={renderDragPreview}
            onReorder={handleReorder}
            dragPreviewHeight={DRAG_PREVIEW_HEIGHT}
            dragPreviewHorizontalInset={54}
            indicatorColor={theme.primary.val}
            indicatorInsetStart={44}
            autoscrollThreshold={REORDER_AUTOSCROLL_THRESHOLD}
            autoscrollMaxSpeed={REORDER_AUTOSCROLL_MAX_SPEED}
            maxFrameDurationMs={REORDER_MAX_FRAME_DURATION_MS}
            contentPaddingHorizontal={12}
            contentPaddingBottom={insets.bottom + 30}
            style={{ flex: 1, backgroundColor: theme.background?.val }}
          />
        )}
      </YStack>

      <ActionSheet
        ref={menuSheetRef}
        primaryAction={{
          label: '分享计划',
          icon: Share2,
          onPress: () => setTimeout(openShare, 180),
        }}
        sections={[
          {
            actions: [
              {
                label: '编辑计划信息',
                icon: Pencil,
                onPress: () =>
                  router.navigate({ pathname: '/plans/[planId]/edit', params: { planId: plan.id } } as never),
              },
              { label: '删除计划', icon: Trash2, destructive: true, onPress: openDeleteConfirm },
            ],
          },
        ]}
      />
      <ActionSheet
        ref={overflowSheetRef}
        title="计划内容较多"
        description={`当前计划包含 ${plan.items.length} 个点位，生成的二维码会过于密集，经过聊天软件压缩后可能无法正常扫描。建议分享计划文件；文件仅包含计划名称和点位编号。`}
        primaryAction={{ label: '分享计划文件', icon: FileJson, onPress: shareLargePlanFile }}
        sections={[{ actions: [{ label: '生成展示图片', icon: ImageIcon, onPress: openDisplayOnlyShare }] }]}
      />
    </>
  );
}
