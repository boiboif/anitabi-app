import type { Bangumi, Point } from '@/services/types';
import { usePlans } from '@/store/use-plans';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import Toast from '@modules/toaster';
import { Button } from '@tamagui/button';
import { Plus, Square, SquareCheckBig, X } from '@tamagui/lucide-icons-2';
import { createContext, type ReactNode, use, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
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
            {count} 个点位
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
  const theme = useTheme();
  const pickerSheetRef = useRef<TrueSheet>(null);
  const createSheetRef = useRef<TrueSheet>(null);
  const plans = usePlans((state) => state.plans);
  const createPlan = usePlans((state) => state.createPlan);
  const updatePointPlans = usePlans((state) => state.updatePointPlans);
  const [target, setTarget] = useState<{ point: Point; bangumi: Bangumi } | null>(null);
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [newPlanTitle, setNewPlanTitle] = useState('');

  const open = useCallback((point: Point, bangumi: Bangumi) => {
    const pointKey = `${bangumi.id}:${point.id}`;
    const latestPlans = usePlans.getState().plans;
    setTarget({ point, bangumi });
    setSelectedPlanIds(
      latestPlans.filter((plan) => plan.items.some((item) => item.key === pointKey)).map((plan) => plan.id),
    );
    void pickerSheetRef.current?.present();
  }, []);

  const togglePlan = useCallback((planId: string) => {
    setSelectedPlanIds((current) =>
      current.includes(planId) ? current.filter((id) => id !== planId) : [...current, planId],
    );
  }, []);

  const submit = useCallback(() => {
    if (!target) return;
    updatePointPlans(target.point, target.bangumi, selectedPlanIds);
    void pickerSheetRef.current?.dismiss();
    Toast.show(selectedPlanIds.length > 0 ? '已更新巡礼计划' : '已从巡礼计划移除');
  }, [selectedPlanIds, target, updatePointPlans]);

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
            <Button bg="$primary" color="white" size="$4" onPress={submit}>
              完成
            </Button>
          </View>
        }
      >
        <YStack px="$4" pt="$3" pb="$2" gap="$3">
          <XStack items="center" justify="space-between">
            <Text fontSize="$title" fontWeight="700" color="$color12">
              选择巡礼计划
            </Text>
            <Pressable onPress={openCreate} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}>
              <XStack items="center" gap="$1">
                <Plus size={18} color={theme.primary.val} />
                <Text color="$primary" fontSize="$body">
                  新建巡礼计划
                </Text>
              </XStack>
            </Pressable>
          </XStack>
          {plans.length === 0 ? (
            <View py="$6" items="center">
              <Text color="$color11">还没有巡礼计划</Text>
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
              新建巡礼计划
            </Text>
            <Pressable onPress={() => void createSheetRef.current?.dismiss()} hitSlop={8}>
              <X size={20} color="$color11" />
            </Pressable>
          </XStack>
          <Input value={newPlanTitle} onChangeText={setNewPlanTitle} placeholder="请输入计划名称" maxLength={60} />
          <Button
            bg="$primary"
            color="white"
            size="$4"
            disabled={!newPlanTitle.trim()}
            opacity={newPlanTitle.trim() ? 1 : 0.5}
            onPress={create}
          >
            创建并加入
          </Button>
        </YStack>
      </TrueSheet>
    </PlanPickerContext.Provider>
  );
}
