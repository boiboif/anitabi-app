import { StrictButton as Button } from '@/components/strict-button';
import type { Bangumi, Point } from '@/services/types';
import { useFavoritePoints } from '@/store/use-favorite-points';
import { usePlans } from '@/store/use-plans';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { Toast } from '@boiboif/react-native-toast';
import { Plus, Square, SquareCheckBig, X } from '@tamagui/lucide-icons-2';
import { createContext, type ReactNode, use, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getTokens, Input, Text, useTheme, View, XStack, YStack } from 'tamagui';

type PlanPickerContextValue = {
  open: (point: Point, bangumi: Bangumi) => void;
};

const PlanPickerContext = createContext<PlanPickerContextValue | null>(null);

export function usePlanPicker(): PlanPickerContextValue {
  const value = use(PlanPickerContext);
  if (!value) throw new Error('usePlanPicker must be used inside PlanPickerProvider');
  return value;
}

function PlanRow({
  title,
  count,
  selected,
  onPress,
}: {
  title: string;
  count: number;
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
            {t('locationCount', { defaultValue: '{{count}} 个点位', count })}
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
  const createPlan = usePlans((state) => state.createPlan);
  const updatePointPlans = usePlans((state) => state.updatePointPlans);
  const addFavorite = useFavoritePoints((state) => state.addFavorite);
  const [target, setTarget] = useState<{ point: Point; bangumi: Bangumi } | null>(null);
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [alsoFavorite, setAlsoFavorite] = useState(true);
  const [newPlanTitle, setNewPlanTitle] = useState('');

  const open = useCallback((point: Point, bangumi: Bangumi) => {
    const pointKey = `${bangumi.id}:${point.id}`;
    const latestPlans = usePlans.getState().plans;
    setTarget({ point, bangumi });
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
    if (!target) return;
    if (plans.length === 0) {
      Toast.show(t('createAPilgrimagePlanFirst', { defaultValue: '请先新建巡礼计划' }));
      return;
    }
    updatePointPlans(target.point, target.bangumi, selectedPlanIds);
    if (alsoFavorite && selectedPlanIds.length > 0) addFavorite(target.point, target.bangumi);
    void pickerSheetRef.current?.dismiss();
    Toast.show(
      selectedPlanIds.length > 0
        ? t('pilgrimagePlansUpdated', { defaultValue: '已更新巡礼计划' })
        : t('removedFromPilgrimagePlans', { defaultValue: '已从巡礼计划移除' }),
    );
  }, [addFavorite, alsoFavorite, plans.length, selectedPlanIds, t, target, updatePointPlans]);

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

  const contextValue = useMemo(() => ({ open }), [open]);

  return (
    <PlanPickerContext.Provider value={contextValue}>
      {children}
      <TrueSheet
        ref={pickerSheetRef}
        detents={[0.5, 0.9]}
        scrollable
        backgroundColor={theme.color1.val}
        cornerRadius={getTokens().radius['4'].val}
        grabberOptions={{ color: theme.primary.val, adaptive: false, topMargin: 12 }}
        style={{ paddingTop: 26 }}
        footer={
          <View px="$4" pt="$2" pb="$4" bg="$color1">
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={t('alsoFavorite', { defaultValue: '同时收藏' })}
              accessibilityState={{ checked: alsoFavorite }}
              onPress={() => setAlsoFavorite((current) => !current)}
              style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
            >
              <XStack minH={44} items="center" justify="space-between" mb="$2">
                <Text fontSize="$body" color="$color12">
                  {t('alsoFavorite', { defaultValue: '同时收藏' })}
                </Text>
                {alsoFavorite ? (
                  <SquareCheckBig size={23} strokeWidth={2.5} color={theme.primary.val} />
                ) : (
                  <Square size={23} color="$color8" />
                )}
              </XStack>
            </Pressable>
            <Button bg="$primary" color="white" onPress={submit}>
              {t('done', { defaultValue: '完成' })}
            </Button>
          </View>
        }
      >
        <YStack px="$4" pt="$3" pb="$2" gap="$3">
          <XStack items="center" justify="space-between">
            <Text fontSize="$title" fontWeight="700" color="$color12">
              {t('joinPilgrimagePlan', { defaultValue: '加入巡礼计划' })}
            </Text>
            <Pressable onPress={openCreate} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}>
              <XStack items="center" gap="$1">
                <Plus size={18} color={theme.primary.val} />
                <Text color="$primary" fontSize="$body">
                  {t('newPilgrimagePlan', { defaultValue: '新建巡礼计划' })}
                </Text>
              </XStack>
            </Pressable>
          </XStack>
          {plans.length === 0 ? (
            <View py="$6" items="center">
              <Text color="$color11">{t('noPilgrimagePlansYet', { defaultValue: '还没有巡礼计划' })}</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <YStack overflow="hidden" rounded="$3" bg="$color2">
                {plans.map((plan, index) => (
                  <View key={plan.id}>
                    {index > 0 ? <View ml="$3" bg="$color4" height={1} /> : null}
                    <PlanRow
                      title={plan.title}
                      count={plan.items.length}
                      selected={selectedPlanIds.includes(plan.id)}
                      onPress={() => togglePlan(plan.id)}
                    />
                  </View>
                ))}
              </YStack>
            </ScrollView>
          )}
        </YStack>
      </TrueSheet>

      <TrueSheet
        ref={createSheetRef}
        detents={['auto']}
        backgroundColor={theme.color1.val}
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
          <Input
            bg="$background"
            placeholderTextColor="$color6"
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
