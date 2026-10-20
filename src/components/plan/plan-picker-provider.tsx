import PlanSortButton from '@/components/plan/plan-sort-button';
import { StrictButton as Button } from '@/components/ui/strict-button';
import { ThemeInput } from '@/components/ui/theme-input';
import type { Bangumi, Point } from '@/services/types';
import { useFavoritePoints } from '@/store/use-favorite-points';
import { usePlans } from '@/store/use-plans';
import type { PlanPointEntry } from '@/utils/plan-point-batches';
import { Toast } from '@boiboif/react-native-toast';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { Plus, Square, SquareCheckBig, X } from '@tamagui/lucide-icons-2';
import { createContext, type ReactNode, use, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { getTokens, Text, useTheme, View, XStack, YStack } from 'tamagui';

type PlanPickerContextValue = {
  open: (point: Point, bangumi: Bangumi) => void;
  openBatch: (entries: PlanPointEntry[], title: string) => void;
};

type PlanPickerTarget =
  { kind: 'single'; point: Point; bangumi: Bangumi } | { kind: 'batch'; entries: PlanPointEntry[]; title: string };

const PlanPickerContext = createContext<PlanPickerContextValue | null>(null);

export function usePlanPicker(): PlanPickerContextValue {
  const value = use(PlanPickerContext);
  if (!value) throw new Error('usePlanPicker must be used inside PlanPickerProvider');
  return value;
}

function PlanRow({
  title,
  count,
  detail,
  selected,
  onPress,
}: {
  title: string;
  count: number;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
    >
      <XStack minH={64} px="$3" items="center" gap="$3">
        <YStack flex={1} gap="$0.5">
          <Text fontSize="$body" color="$color12" numberOfLines={1}>
            {title}
          </Text>
          <Text fontSize="$caption" color="$color10">
            {detail ?? t('locationCount', { defaultValue: '{{count}} 个点位', count })}
          </Text>
        </YStack>
        {selected ? (
          <SquareCheckBig size={23} strokeWidth={2.5} color={theme.primary.val} />
        ) : (
          <Square size={23} color="$color8" />
        )}
      </XStack>
    </Pressable>
  );
}

export default function PlanPickerProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const pickerSheetRef = useRef<TrueSheet>(null);
  const createSheetRef = useRef<TrueSheet>(null);
  const plans = usePlans((state) => state.plans);
  const planListSortOrder = usePlans((state) => state.planListSortOrder);
  const togglePlanListSortOrder = usePlans((state) => state.togglePlanListSortOrder);
  const createPlan = usePlans((state) => state.createPlan);
  const updatePointPlans = usePlans((state) => state.updatePointPlans);
  const addPointsToPlans = usePlans((state) => state.addPointsToPlans);
  const addFavorite = useFavoritePoints((state) => state.addFavorite);
  const addFavorites = useFavoritePoints((state) => state.addFavorites);
  const [target, setTarget] = useState<PlanPickerTarget | null>(null);
  const submittedRef = useRef(false);
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [alsoFavorite, setAlsoFavorite] = useState(true);
  const [newPlanTitle, setNewPlanTitle] = useState('');
  const [pickerFooterHeight, setPickerFooterHeight] = useState(0);

  const open = useCallback((point: Point, bangumi: Bangumi) => {
    const pointKey = `${bangumi.id}:${point.id}`;
    const latestPlans = usePlans.getState().plans;
    submittedRef.current = false;
    setTarget({ kind: 'single', point, bangumi });
    setSelectedPlanIds(
      latestPlans.filter((plan) => plan.items.some((item) => item.key === pointKey)).map((plan) => plan.id),
    );
    setAlsoFavorite(true);
    void pickerSheetRef.current?.present();
  }, []);

  const togglePlan = useCallback((planId: string) => {
    setSelectedPlanIds((current) =>
      current.includes(planId) ? current.filter((id) => id !== planId) : [...current, planId],
    );
  }, []);

  const submit = useCallback(() => {
    if (!target || submittedRef.current) return;
    if (plans.length === 0) {
      Toast.show(t('createAPilgrimagePlanFirst', { defaultValue: '请先新建巡礼计划' }));
      return;
    }
    if (target.kind === 'batch') {
      if (selectedPlanIds.length === 0) return;
      submittedRef.current = true;
      const result = addPointsToPlans(target.entries, selectedPlanIds);
      if (result.planCount === 0) {
        submittedRef.current = false;
        return;
      }
      if (alsoFavorite) addFavorites(target.entries);
      void pickerSheetRef.current?.dismiss();
      Toast.show(
        t('batchPlanPointsAdded', {
          defaultValue: '已向 {{plans}} 个计划添加 {{added}} 个点位，跳过 {{existing}} 个已有点位',
          plans: result.planCount,
          added: result.addedCount,
          existing: result.existingCount,
        }),
      );
      return;
    }
    submittedRef.current = true;
    updatePointPlans(target.point, target.bangumi, selectedPlanIds);
    if (alsoFavorite && selectedPlanIds.length > 0) addFavorite(target.point, target.bangumi);
    void pickerSheetRef.current?.dismiss();
    Toast.show(
      selectedPlanIds.length > 0
        ? t('pilgrimagePlansUpdated', { defaultValue: '已更新巡礼计划' })
        : t('removedFromPilgrimagePlans', { defaultValue: '已从巡礼计划移除' }),
    );
  }, [
    addFavorite,
    addFavorites,
    addPointsToPlans,
    alsoFavorite,
    plans.length,
    selectedPlanIds,
    t,
    target,
    updatePointPlans,
  ]);

  const openCreate = useCallback(() => {
    setNewPlanTitle('');
    void createSheetRef.current?.present();
  }, []);

  const create = useCallback(() => {
    const title = newPlanTitle.trim();
    if (!title) return;
    const id = createPlan(title);
    setSelectedPlanIds((current) => [...current, id]);
    setNewPlanTitle('');
    void createSheetRef.current?.dismiss();
  }, [createPlan, newPlanTitle]);

  const contextValue = useMemo<PlanPickerContextValue>(
    () => ({
      open,
      openBatch: (entries, title) => {
        if (entries.length === 0) return;
        submittedRef.current = false;
        setTarget({ kind: 'batch', entries, title });
        setSelectedPlanIds([]);
        setAlsoFavorite(false);
        void pickerSheetRef.current?.present();
      },
    }),
    [open],
  );
  const batchKeys = new Set(
    target?.kind === 'batch' ? target.entries.map(({ point, bangumi }) => `${bangumi.id}:${point.id}`) : [],
  );
  const batchSubmitDisabled = target?.kind === 'batch' && !plans.some((plan) => selectedPlanIds.includes(plan.id));
  const sortedPlans = [...plans].sort((a, b) =>
    planListSortOrder === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt,
  );

  return (
    <PlanPickerContext.Provider value={contextValue}>
      {children}
      <TrueSheet
        ref={pickerSheetRef}
        detents={[0.6, 0.9]}
        scrollable
        scrollableOptions={{ scrollingExpandsSheet: false }}
        backgroundColor={theme.color2.val}
        cornerRadius={getTokens().radius['4'].val}
        grabberOptions={{ color: theme.primary.val, adaptive: false, topMargin: 12 }}
        headerStyle={{ paddingTop: 26 }}
        header={
          <YStack px="$4" pt="$3" pb="$2" gap="$3" bg="$color2">
            <XStack items="center" justify="space-between">
              <Text fontSize="$title" fontWeight="700" color="$color12">
                {t('joinPilgrimagePlan', { defaultValue: '加入巡礼计划' })}
              </Text>
              <XStack items="center" gap="$1.5">
                <PlanSortButton sortOrder={planListSortOrder} onPress={togglePlanListSortOrder} />
                <Pressable onPress={openCreate} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}>
                  <XStack items="center" gap="$1">
                    <Plus size={18} color={theme.primary.val} />
                    <Text color="$primary" fontSize="$body">
                      {t('newPlan', { defaultValue: '新建计划' })}
                    </Text>
                  </XStack>
                </Pressable>
              </XStack>
            </XStack>
            {target?.kind === 'batch' ? (
              <YStack gap="$1">
                <Text fontSize="$body" color="$color12" numberOfLines={2}>
                  {target.title}
                </Text>
                <Text fontSize="$caption" color="$color10">
                  {t('batchPlanSelectionHint', {
                    defaultValue: '{{count}} 个点位，选择要加入的计划，已有点位会自动跳过',
                    count: target.entries.length,
                  })}
                </Text>
              </YStack>
            ) : null}
          </YStack>
        }
        footer={
          <View
            px="$4"
            pt="$2"
            pb="$4"
            bg="$color2"
            onLayout={(event) => setPickerFooterHeight(event.nativeEvent.layout.height)}
          >
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={t('alsoFavorite', { defaultValue: '加入同时收藏' })}
              accessibilityState={{ checked: alsoFavorite }}
              onPress={() => setAlsoFavorite((current) => !current)}
              style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
            >
              <XStack minH={44} items="center" justify="space-between" mb="$2">
                <Text fontSize="$body" color="$color12">
                  {t('alsoFavorite', { defaultValue: '加入同时收藏' })}
                </Text>
                {alsoFavorite ? (
                  <SquareCheckBig size={23} strokeWidth={2.5} color={theme.primary.val} />
                ) : (
                  <Square size={23} color="$color8" />
                )}
              </XStack>
            </Pressable>
            <Button
              bg="$primary"
              color="white"
              onPress={submit}
              disabled={batchSubmitDisabled}
              accessibilityState={{ disabled: batchSubmitDisabled }}
              opacity={batchSubmitDisabled ? 0.5 : 1}
            >
              {target?.kind === 'batch'
                ? t('addToPilgrimagePlan', { defaultValue: '添加到巡礼计划' })
                : t('done', { defaultValue: '完成' })}
            </Button>
          </View>
        }
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <YStack px="$4" pt="$2" pb={pickerFooterHeight + 16}>
            {plans.length === 0 ? (
              <View py="$6" items="center">
                <Text color="$color11">{t('noPilgrimagePlansYet', { defaultValue: '还没有巡礼计划' })}</Text>
              </View>
            ) : (
              <YStack overflow="hidden" rounded="$3" bg="$background">
                {sortedPlans.map((plan, index) => {
                  const existingCount =
                    target?.kind === 'batch'
                      ? plan.items.reduce((count, item) => count + (batchKeys.has(item.key) ? 1 : 0), 0)
                      : 0;
                  return (
                    <View key={plan.id}>
                      {index > 0 ? <View mx="$3" bg="$color4" height={StyleSheet.hairlineWidth} /> : null}
                      <PlanRow
                        title={plan.title}
                        count={plan.items.length}
                        detail={
                          target?.kind === 'batch'
                            ? t('batchPlanPointCounts', {
                                defaultValue: '将新增 {{added}} 个，已包含 {{existing}} 个',
                                added: target.entries.length - existingCount,
                                existing: existingCount,
                              })
                            : undefined
                        }
                        selected={selectedPlanIds.includes(plan.id)}
                        onPress={() => togglePlan(plan.id)}
                      />
                    </View>
                  );
                })}
              </YStack>
            )}
          </YStack>
        </ScrollView>
      </TrueSheet>

      <TrueSheet
        ref={createSheetRef}
        detents={['auto']}
        backgroundColor={theme.color2.val}
        cornerRadius={getTokens().radius['4'].val}
        grabberOptions={{ color: theme.primary.val, adaptive: false, topMargin: 12 }}
        style={{ paddingTop: 26 }}
      >
        <YStack px="$4" pt="$3" pb="$5" gap="$3">
          <XStack items="center" justify="space-between">
            <Text fontSize="$title" fontWeight="700" color="$color12">
              {t('newPilgrimagePlan', { defaultValue: '新建巡礼计划' })}
            </Text>
            <Pressable onPress={() => void createSheetRef.current?.dismiss()} hitSlop={8}>
              <X size={20} color="$color11" />
            </Pressable>
          </XStack>
          <ThemeInput
            value={newPlanTitle}
            onChangeText={setNewPlanTitle}
            placeholder={t('enterAPlanName', { defaultValue: '请输入计划名称' })}
            maxLength={60}
          />
          <Button
            bg="$primary"
            color="white"
            disabled={!newPlanTitle.trim()}
            accessibilityState={{ disabled: !newPlanTitle.trim() }}
            opacity={newPlanTitle.trim() ? 1 : 0.5}
            onPress={create}
          >
            {t('createAndAdd', { defaultValue: '创建并加入' })}
          </Button>
        </YStack>
      </TrueSheet>
    </PlanPickerContext.Provider>
  );
}
