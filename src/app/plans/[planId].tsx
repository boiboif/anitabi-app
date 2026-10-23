import PlanListSettingsSheet from '@/components/plan/plan-list-settings-sheet';
import PointListCard, { POINT_LIST_CARD_HEIGHT } from '@/components/point/point-list-card';
import { ActionSheet, type ActionSheetRef } from '@/components/ui/action-sheet';
import CardListItem from '@/components/ui/card-list-item';
import StableReorderableList, { type StableReorderableListRenderItem } from '@/components/ui/stable-reorderable-list';
import { StrictButton as Button } from '@/components/ui/strict-button';
import { usePlanDistanceLocation, type PlanDistanceLocationError } from '@/hooks/use-plan-distance-location';
import { getCardListItemHeight } from '@/lib/card-list-layout';
import { getBangumiTitle, getPointTitle } from '@/lib/localized-data';
import { sharePlanFile } from '@/lib/plan-share-files';
import { canSharePlanAsQr } from '@/lib/plan-sharing';
import { ICON_BUTTON_ICON_SIZE } from '@/lib/ui-sizes';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { useMapData } from '@/store/use-map-data';
import { usePlans } from '@/store/use-plans';
import { PageHorizontalInset } from '@/tamagui.config';
import { sortPlanPointsByDistance, type PlanDistanceLocation } from '@/utils/plan-point-distances';
import { Toast } from '@boiboif/react-native-toast';
import {
  ArrowDownUp,
  Check,
  FileJson,
  GripVertical,
  Image as ImageIcon,
  MapPinned,
  MoreHorizontal,
  Pencil,
  Plus,
  Share2,
  SlidersHorizontal,
  Square,
  SquareCheckBig,
  Trash2,
} from '@tamagui/lucide-icons-2';
import { Stack, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack, useTheme } from 'tamagui';

type ResolvedItem = {
  id: string;
  sequenceNumber: number;
  item: ReturnType<typeof usePlans.getState>['plans'][number]['items'][number];
  point?: Point;
  bangumi?: Bangumi;
  imageSource?: string;
  distanceMeters?: number | null;
};

type DraggablePointRowProps = {
  planId: string;
  resolved: ResolvedItem;
  onPress?: () => void;
  onToggle: () => void;
  onSelect: () => void;
  theme: ReturnType<typeof useTheme>;
  sorting: boolean;
  showDistance: boolean;
  distancePending: boolean;
  dragHandle?: ReactNode;
};

// Cached list rows must receive selection changes without replacing their data
// or resetting drag state. Only the checkbox subscribes to this page-local state.
const PlanSelectionContext = createContext<{ planId: string; points: ReadonlyMap<string, number> } | null>(null);

function ReorderHandle() {
  const { t } = useTranslation();
  return (
    <View
      width={44}
      height="100%"
      items="center"
      justify="center"
      accessibilityRole="button"
      accessibilityLabel={t('dragToReorder', { defaultValue: '拖动调整顺序' })}
      accessibilityHint={t('pressAndHoldThenDragUpOrDown', { defaultValue: '长按后上下拖动' })}
    >
      <GripVertical size={18} color="$color10" />
    </View>
  );
}

function SelectPointButton({
  planId,
  item,
  onSelect,
}: {
  planId: string;
  item: Pick<ResolvedItem['item'], 'key' | 'addedAt'>;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const selection = useContext(PlanSelectionContext);
  const selected = selection?.planId === planId && selection.points.get(item.key) === item.addedAt;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={
        selected
          ? t('planDeselectLocation', { defaultValue: '取消选择巡礼点' })
          : t('planSelectLocation', { defaultValue: '选择巡礼点' })
      }
      hitSlop={8}
      onPress={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
    >
      <View width={44} height="100%" items="center" justify="center">
        {selected ? <SquareCheckBig size={20} color="$primary" /> : <Square size={20} color="$color11" />}
      </View>
    </Pressable>
  );
}

function DraggablePointRow({
  planId,
  resolved,
  onPress,
  onToggle,
  onSelect,
  theme,
  sorting,
  showDistance,
  distancePending,
  dragHandle,
}: DraggablePointRowProps) {
  const { t, i18n } = useTranslation();
  const { item, point, bangumi } = resolved;
  const distance = resolved.distanceMeters;
  const distanceLabel = distancePending
    ? t('planDistanceLocating', { defaultValue: '正在获取当前位置…' })
    : typeof distance !== 'number'
      ? t('planDistanceUnknown', { defaultValue: '距离未知' })
      : distance < 1_000
        ? t('planDistanceMeters', { defaultValue: '约 {{distance}} 米', distance: Math.round(distance) })
        : t('planDistanceKilometers', {
            defaultValue: '约 {{distance}} 公里',
            distance: (distance / 1_000).toFixed(1),
          });

  return (
    <CardListItem>
      <PointListCard
        point={point}
        bangumi={bangumi}
        title={point ? getPointTitle(point, i18n.resolvedLanguage) : item.snapshot.pointName}
        subtitle={bangumi ? getBangumiTitle(bangumi, i18n.resolvedLanguage) : item.snapshot.bangumiName}
        description={point?.mark || item.snapshot.pointMark}
        meta={showDistance ? distanceLabel : undefined}
        image={point?.image || item.snapshot.pointImage}
        cover={bangumi?.cover || item.snapshot.bangumiCover}
        previewEnabled={!sorting}
        imageSource={resolved.imageSource}
        imageRecyclingKey={resolved.id}
        imageColor={bangumi?.color || item.snapshot.bangumiColor}
        sequenceNumber={resolved.sequenceNumber}
        showMediaLabels
        opacity={item.completed ? 0.58 : 1}
        disabled={sorting || !point || !bangumi}
        onPress={onPress}
        leading={sorting ? <SelectPointButton planId={planId} item={item} onSelect={onSelect} /> : null}
        trailing={sorting ? dragHandle : null}
        statusAction={
          !sorting ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                item.completed
                  ? t('markIncomplete', { defaultValue: '取消完成' })
                  : t('markComplete', { defaultValue: '标记完成' })
              }
              hitSlop={12}
              onPress={(event) => {
                event.stopPropagation();
                onToggle();
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <View width={30} height={30} rounded="$9" items="center" justify="center">
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
    </CardListItem>
  );
}

const PLAN_POINT_ROW_HEIGHT = getCardListItemHeight(POINT_LIST_CARD_HEIGHT);
const DRAG_PREVIEW_CARD_HEIGHT = 72;
const DRAG_PREVIEW_HEIGHT = getCardListItemHeight(DRAG_PREVIEW_CARD_HEIGHT);
const REORDER_AUTOSCROLL_THRESHOLD = 72;
const REORDER_AUTOSCROLL_MAX_SPEED = 840;
const REORDER_MAX_FRAME_DURATION_MS = 34;

export default function PlanDetailScreen() {
  const { t, i18n } = useTranslation();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [displayedPlan, setDisplayedPlan] = useState(() => ({
    planId,
    plan: usePlans.getState().plans.find((item) => item.id === planId),
  }));
  useLayoutEffect(() => {
    const refreshPlan = () => {
      const plan = usePlans.getState().plans.find((item) => item.id === planId);
      const update = () => {
        setDisplayedPlan((current) =>
          current.planId === planId && current.plan === plan ? current : { planId, plan },
        );
      };
      if (isFocused) update();
      else startTransition(update);
    };
    const unsubscribe = usePlans.subscribe(refreshPlan);
    refreshPlan();
    return unsubscribe;
  }, [isFocused, planId]);
  const plan = displayedPlan.planId === planId ? displayedPlan.plan : undefined;
  const deletePlan = usePlans((state) => state.deletePlan);
  const togglePoint = usePlans((state) => state.togglePoint);
  const removePoints = usePlans((state) => state.removePoints);
  const reorderPoints = usePlans((state) => state.reorderPoints);
  const data = useMapData((state) => state.data);
  const menuSheetRef = useRef<ActionSheetRef>(null);
  const overflowSheetRef = useRef<ActionSheetRef>(null);
  const listSettingsSheetRef = useRef<ActionSheetRef>(null);
  const [sorting, setSorting] = useState(false);
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [sortByDistance, setSortByDistance] = useState(false);
  const [selection, setSelection] = useState({ planId, points: new Map<string, number>() });
  const hasPlanPoints = (plan?.items.length ?? 0) > 0;
  const selectedItems = (plan?.items ?? []).filter(
    (item) => selection.planId === planId && selection.points.get(item.key) === item.addedAt,
  );
  const handleDistanceLocationError = useCallback(
    (error: PlanDistanceLocationError) => {
      setSortByDistance(false);
      Toast.show(
        error === 'permission'
          ? t('planDistancePermissionRequired', { defaultValue: '请允许使用位置后查看距离' })
          : error === 'services'
            ? t('planDistanceServicesDisabled', { defaultValue: '请开启系统定位服务后重试' })
            : t('planDistanceLocationFailed', { defaultValue: '暂时无法获取位置，请重试' }),
      );
    },
    [t],
  );
  const distanceLocation = usePlanDistanceLocation(
    sortByDistance && hasPlanPoints && !sorting,
    handleDistanceLocationError,
  );
  const [lastFocusedDistanceLocation, setLastFocusedDistanceLocation] = useState<PlanDistanceLocation | null>(null);
  if ((isFocused || !sortByDistance) && lastFocusedDistanceLocation !== distanceLocation.location) {
    setLastFocusedDistanceLocation(distanceLocation.location);
  }

  const bangumiById = useMemo(
    () => new Map((data?.data.bangumis ?? []).map((bangumi) => [bangumi.id, bangumi])),
    [data],
  );

  const resolvedItems = useMemo<ResolvedItem[]>(() => {
    if (!plan) return [];
    const pointsByBangumiId = new Map<number, Map<string, Point>>();
    return plan.items.map((item, index) => {
      const bangumi = bangumiById.get(item.bangumiId);
      let pointById = pointsByBangumiId.get(item.bangumiId);
      if (!pointById && bangumi) {
        pointById = new Map(bangumi.points.map((point) => [point.id, point]));
        pointsByBangumiId.set(item.bangumiId, pointById);
      }
      const point = pointById?.get(item.pointId);
      const imagePath = point?.image || item.snapshot.pointImage || bangumi?.cover || item.snapshot.bangumiCover;
      const imageUri = imagePath ? buildImageUrl(imagePath, 'plan=h160') : undefined;
      return {
        id: item.key,
        sequenceNumber: index + 1,
        item,
        bangumi,
        point,
        imageSource: imageUri,
      };
    });
  }, [bangumiById, plan]);

  const filteredItems = useMemo(
    () => (showIncompleteOnly ? resolvedItems.filter((resolved) => !resolved.item.completed) : resolvedItems),
    [resolvedItems, showIncompleteOnly],
  );
  const displayedDistanceLocation = isFocused ? distanceLocation.location : lastFocusedDistanceLocation;
  const distancePending = sortByDistance && displayedDistanceLocation === null;
  // Reuse the visible projection through blur when the saved plan and location are unchanged.
  const visibleItems = useMemo(
    () =>
      sortByDistance && displayedDistanceLocation
        ? sortPlanPointsByDistance(filteredItems, displayedDistanceLocation)
        : filteredItems,
    [displayedDistanceLocation, filteredItems, sortByDistance],
  );

  const toggleSorting = useCallback(() => {
    if (!hasPlanPoints) return;
    if (!sorting) {
      setShowIncompleteOnly(false);
      setSortByDistance(false);
    }
    setSelection({ planId, points: new Map() });
    setSorting((current) => !current);
  }, [hasPlanPoints, planId, sorting]);

  const handleReorder = useCallback(
    (nextOrderIds: string[]) => {
      reorderPoints(planId, nextOrderIds);
    },
    [planId, reorderPoints],
  );

  const toggleSelectedPoint = useCallback(
    (item: ResolvedItem['item']) => {
      setSelection((current) => {
        const points = new Map(current.planId === planId ? current.points : []);
        if (points.get(item.key) === item.addedAt) points.delete(item.key);
        else points.set(item.key, item.addedAt);
        return { planId, points };
      });
    },
    [planId],
  );

  const openPlanMap = useCallback(() => {
    const target = plan?.items.find((item) => !item.completed) ?? plan?.items[0];
    if (!target) return;
    router.navigate({
      pathname: '/plans/[planId]/map',
      params: { planId, bangumiId: target.bangumiId, pointId: target.pointId },
    } as never);
  }, [plan, planId, router]);

  const renderListItem = useCallback(
    ({ item, dragHandle }: StableReorderableListRenderItem<ResolvedItem>) => (
      <DraggablePointRow
        planId={planId}
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
        onSelect={() => toggleSelectedPoint(item.item)}
        dragHandle={dragHandle}
        theme={theme}
        sorting={sorting}
        showDistance={sortByDistance}
        distancePending={distancePending}
      />
    ),
    [distancePending, planId, router, sortByDistance, sorting, theme, togglePoint, toggleSelectedPoint],
  );

  const keyExtractor = useCallback((item: ResolvedItem) => item.id, []);
  const renderDragHandle = useCallback(() => <ReorderHandle />, []);
  const renderDragPreview = useCallback(
    (resolved: ResolvedItem) => {
      const { item, point, bangumi } = resolved;
      return (
        <CardListItem>
          <PointListCard
            point={point}
            bangumi={bangumi}
            title={point ? getPointTitle(point, i18n.resolvedLanguage) : item.snapshot.pointName}
            subtitle={bangumi ? getBangumiTitle(bangumi, i18n.resolvedLanguage) : item.snapshot.bangumiName}
            image={point?.image || item.snapshot.pointImage}
            cover={bangumi?.cover || item.snapshot.bangumiCover}
            previewEnabled={false}
            imageSource={resolved.imageSource}
            imageColor={bangumi?.color || item.snapshot.bangumiColor}
            sequenceNumber={resolved.sequenceNumber}
            showMediaLabels
            opacity={item.completed ? 0.58 : 1}
            disabled
            height={DRAG_PREVIEW_CARD_HEIGHT}
            imageWidth={72}
            boxShadow="0 2px 4px $shadowColor"
          />
        </CardListItem>
      );
    },
    [i18n.resolvedLanguage],
  );

  if (!plan) {
    return (
      <View flex={1} items="center" justify="center" bg="$pageBackground">
        <Text color="$color11">
          {t('thePlanDoesNotExistOrHasBeenDeleted', { defaultValue: '计划不存在或已被删除' })}
        </Text>
      </View>
    );
  }

  const completed = plan.items.filter((item) => item.completed).length;
  const allSelected = hasPlanPoints && selectedItems.length === plan.items.length;
  const confirmRemoveSelected = () => {
    if (selectedItems.length === 0) return;
    const targets = selectedItems.map(({ key, addedAt }) => ({ key, addedAt }));
    Alert.alert(
      t('planDeleteSelectedLocations', { defaultValue: '删除所选点位' }),
      t('planDeleteSelectedLocationsConfirm', {
        defaultValue: '确定从当前计划删除所选的 {{count}} 个点位吗？',
        count: targets.length,
      }),
      [
        { text: t('cancel', { defaultValue: '取消' }), style: 'cancel' },
        {
          text: t('delete', { defaultValue: '删除' }),
          style: 'destructive',
          onPress: () => {
            removePoints(planId, targets);
            setSelection({ planId, points: new Map() });
            if (!usePlans.getState().plans.find((current) => current.id === planId)?.items.length) setSorting(false);
          },
        },
      ],
    );
  };
  const confirmDelete = () =>
    Alert.alert(
      t('deletePilgrimagePlan', { defaultValue: '删除巡礼计划' }),
      t('confirmDeleteTitle', { defaultValue: '确定删除“{{title}}”吗？', title: plan.title }),
      [
        { text: t('cancel', { defaultValue: '取消' }), style: 'cancel' },
        {
          text: t('delete', { defaultValue: '删除' }),
          style: 'destructive',
          onPress: () => {
            deletePlan(plan.id);
            router.back();
          },
        },
      ],
    );

  const openDeleteConfirm = () => {
    setTimeout(confirmDelete, 180);
  };

  const openShare = () => {
    if (plan.items.length === 0) {
      Alert.alert(
        t('unableToShare', { defaultValue: '暂时无法分享' }),
        t('addLocationsToThePlanBeforeSharingIt', { defaultValue: '计划中还没有点位，添加点位后再分享吧。' }),
      );
      return;
    }
    if (canSharePlanAsQr(plan)) {
      router.navigate({ pathname: '/plans/[planId]/share', params: { planId: plan.id } } as never);
      return;
    }
    overflowSheetRef.current?.present();
  };

  const shareLargePlanFile = () => {
    setTimeout(() => {
      void sharePlanFile(plan).catch((error) => {
        Alert.alert(
          t('couldNotSharePlanFile', { defaultValue: '无法分享计划文件' }),
          error instanceof Error ? error.message : t('pleaseTryAgainLater', { defaultValue: '请稍后重试' }),
        );
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
          headerStyle: { backgroundColor: theme.pageBackground?.val },
          headerTintColor: theme.color12?.val,
          headerBackButtonDisplayMode: 'minimal',
          headerRight: () => (
            <XStack items="center" gap="$1.5">
              <Button
                chromeless
                circular
                size="$3"
                icon={<MapPinned size={ICON_BUTTON_ICON_SIZE} strokeWidth={2} />}
                color={!hasPlanPoints ? '$color8' : '$color12'}
                disabled={!hasPlanPoints}
                onPress={openPlanMap}
                aria-label={t('mapMode', { defaultValue: '地图模式' })}
              />
              <Button
                chromeless
                circular
                size="$3"
                icon={<SlidersHorizontal size={ICON_BUTTON_ICON_SIZE} strokeWidth={2} />}
                color={
                  !hasPlanPoints || sorting ? '$color8' : showIncompleteOnly || sortByDistance ? '$primary' : '$color12'
                }
                disabled={!hasPlanPoints || sorting}
                onPress={() => listSettingsSheetRef.current?.present()}
                aria-label={t('planListSettings', { defaultValue: '列表设置' })}
              />
              <Button
                chromeless
                circular
                size="$3"
                icon={<ArrowDownUp size={ICON_BUTTON_ICON_SIZE} strokeWidth={2} />}
                color={!hasPlanPoints ? '$color8' : sorting ? '$primary' : '$color12'}
                disabled={!hasPlanPoints}
                onPress={toggleSorting}
                aria-label={
                  sorting
                    ? t('finishReordering', { defaultValue: '完成排序' })
                    : t('reorderLocations', { defaultValue: '排序巡礼点' })
                }
              />
              <Button
                chromeless
                circular
                size="$3"
                color="$color12"
                icon={<Plus size={ICON_BUTTON_ICON_SIZE} strokeWidth={2} />}
                onPress={() =>
                  router.navigate({ pathname: '/plans/[planId]/add', params: { planId: plan.id } } as never)
                }
                aria-label={t('addLocations', { defaultValue: '添加巡礼点' })}
              />
              <Button
                chromeless
                circular
                size="$3"
                color="$color12"
                icon={<MoreHorizontal size={ICON_BUTTON_ICON_SIZE} strokeWidth={2} />}
                onPress={() => menuSheetRef.current?.present()}
                aria-label={t('moreActions', { defaultValue: '更多操作' })}
              />
            </XStack>
          ),
        }}
      />
      <YStack flex={1} bg="$pageBackground">
        <XStack>
          <YStack flex={3} px="$pageHorizontalInset" pb="$1" gap="$1">
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
              {t('completedLocationCount', {
                defaultValue: '{{completed}} / {{count}} 个点位',
                completed,
                count: plan.items.length,
              })}
            </Text>
          </YStack>

          {/* <XStack flex={1}></XStack> */}
        </XStack>
        {sorting ? (
          <XStack px="$pageHorizontalInset" pb="$2" items="center" gap="$2">
            <Button
              size="$2"
              chromeless
              color="$primary"
              onPress={() =>
                setSelection({
                  planId,
                  points: allSelected ? new Map() : new Map(plan.items.map((item) => [item.key, item.addedAt])),
                })
              }
              accessibilityLabel={
                allSelected
                  ? t('planDeselectAllLocations', { defaultValue: '取消全选' })
                  : t('planSelectAllLocations', { defaultValue: '全选' })
              }
            >
              {allSelected
                ? t('planDeselectAllLocations', { defaultValue: '取消全选' })
                : t('planSelectAllLocations', { defaultValue: '全选' })}
            </Button>
            <Text flex={1} fontSize="$caption" color="$color11">
              {t('planSelectedLocations', { defaultValue: '已选择 {{count}} 个点位', count: selectedItems.length })}
            </Text>
            <Button
              size="$2"
              fontSize="$caption"
              color={selectedItems.length === 0 ? '$color6' : '$red9'}
              bg="$color2"
              variant="outlined"
              borderColor={selectedItems.length === 0 ? '$color4' : '$red9'}
              disabled={selectedItems.length === 0}
              onPress={confirmRemoveSelected}
              accessibilityLabel={t('planDeleteSelectedLocations', { defaultValue: '删除所选点位' })}
            >
              {t('planDeleteSelectedLocations', { defaultValue: '删除所选点位' })}
            </Button>
          </XStack>
        ) : null}
        {visibleItems.length === 0 ? (
          <YStack flex={1} minH={220} items="center" justify="center">
            <Text color="$color11">
              {showIncompleteOnly && resolvedItems.length > 0
                ? t('noIncompleteLocations', { defaultValue: '没有未完成点位' })
                : t('noLocationsInThisPlanYet', { defaultValue: '计划里还没有点位' })}
            </Text>
          </YStack>
        ) : (
          <PlanSelectionContext.Provider value={selection}>
            <StableReorderableList
              data={visibleItems}
              enabled={sorting}
              rowExtraData={sortByDistance}
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
              contentPaddingHorizontal={PageHorizontalInset}
              contentPaddingBottom={insets.bottom + 30}
              style={{ flex: 1, backgroundColor: theme.pageBackground?.val }}
            />
          </PlanSelectionContext.Provider>
        )}
      </YStack>

      <PlanListSettingsSheet
        ref={listSettingsSheetRef}
        showIncompleteOnly={showIncompleteOnly}
        sortByDistance={sortByDistance}
        disabled={!hasPlanPoints || sorting}
        onIncompleteChange={setShowIncompleteOnly}
        onDistanceChange={setSortByDistance}
      />
      <ActionSheet
        ref={menuSheetRef}
        primaryAction={{
          label: t('sharePlan', { defaultValue: '分享计划' }),
          icon: Share2,
          onPress: () => setTimeout(openShare, 180),
        }}
        sections={[
          {
            actions: [
              {
                label: t('editPlanDetails', { defaultValue: '编辑计划信息' }),
                icon: Pencil,
                onPress: () =>
                  router.navigate({ pathname: '/plans/[planId]/edit', params: { planId: plan.id } } as never),
              },
              {
                label: t('deletePlan', { defaultValue: '删除计划' }),
                icon: Trash2,
                destructive: true,
                onPress: openDeleteConfirm,
              },
            ],
          },
        ]}
      />
      <ActionSheet
        ref={overflowSheetRef}
        title={t('largePlan', { defaultValue: '计划内容较多' })}
        description={t(
          'thisPlanHasCountLocationsItsQrCodeWouldBeTooDenseAndMayStopScanningAfterChatAppCompressionShareThePlanFileInsteadItOnlyContainsThePlanNameAndLocationIds',
          {
            defaultValue:
              '当前计划包含 {{count}} 个点位，生成的二维码会过于密集，经过聊天软件压缩后可能无法正常扫描。建议分享计划文件；文件仅包含计划名称和点位编号。',
            count: plan.items.length,
          },
        )}
        primaryAction={{
          label: t('sharePlanFile', { defaultValue: '分享计划文件' }),
          icon: FileJson,
          onPress: shareLargePlanFile,
        }}
        sections={[
          {
            actions: [
              {
                label: t('createDisplayImage', { defaultValue: '生成展示图片' }),
                icon: ImageIcon,
                onPress: openDisplayOnlyShare,
              },
            ],
          },
        ]}
      />
    </>
  );
}
