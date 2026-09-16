import { ActionSheet, type ActionSheetRef } from '@/components/action-sheet';
import { StrictButton as Button } from '@/components/strict-button';
import { usePlanImportActions } from '@/hooks/use-plan-import-actions';
import type { ItineraryPlan } from '@/lib/plan-storage';
import { BLOCK_BUTTON_ICON_SIZE, ICON_BUTTON_ICON_SIZE } from '@/lib/ui-sizes';
import { usePlans } from '@/store/use-plans';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { ChevronRight, FileDown, Plus, ScanLine } from '@tamagui/lucide-icons-2';
import { Stack, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Separator, Text, XStack, YStack, useTheme } from 'tamagui';

type PlanListItemProps = {
  plan: ItineraryPlan;
  onPress: (planId: string) => void;
};

const emptyListStyle = { flex: 1 } as const;

function planKeyExtractor(plan: ItineraryPlan) {
  return plan.id;
}

const PlanListItem = memo(function PlanListItem({ plan, onPress }: PlanListItemProps) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={plan.title} onPress={() => onPress(plan.id)}>
      <XStack py="$3.5" items="center" gap="$3">
        <XStack items="center" flex={1} minW={0} gap="$2">
          <YStack flex={1} gap="$1.5">
            <Text flex={1} minW={0} fontSize="$subtitle" fontWeight="600" color="$color12" numberOfLines={2}>
              {plan.title}
            </Text>
            {plan.description ? (
              <Text fontSize="$footnote" color="$color11">
                {plan.description}
              </Text>
            ) : null}
          </YStack>
          <XStack shrink={0}>
            <Text fontSize="$caption" numberOfLines={1}>
              {plan.items.length}个点位
            </Text>
          </XStack>
        </XStack>
        <ChevronRight size={20} color="$color10" />
      </XStack>
    </Pressable>
  );
});

function PlanSeparator() {
  return <Separator borderColor="$color3" height={StyleSheet.hairlineWidth} />;
}

type EmptyPlansProps = {
  onCreate: () => void;
};

const EmptyPlans = memo(function EmptyPlans({ onCreate }: EmptyPlansProps) {
  return (
    <YStack flex={1} minH={360} items="center" justify="center" gap="$3">
      <Text fontSize="$subtitle" fontWeight="600" color="$color12">
        还没有巡礼计划
      </Text>
      <Button bg="$color3" color="$color12" icon={<Plus size={BLOCK_BUTTON_ICON_SIZE} />} onPress={onCreate}>
        创建巡礼计划
      </Button>
    </YStack>
  );
});

export default function PlansScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const plans = usePlans((state) => state.plans);
  const importSheetRef = useRef<ActionSheetRef>(null);
  const { scanQrCode, importFromFile } = usePlanImportActions();
  const openCreatePlan = useCallback(() => router.navigate('/plans/create' as never), [router]);
  const openPlan = useCallback(
    (planId: string) => router.navigate({ pathname: '/plans/[planId]', params: { planId } } as never),
    [router],
  );
  const renderPlan = useCallback<ListRenderItem<ItineraryPlan>>(
    ({ item }) => <PlanListItem plan={item} onPress={openPlan} />,
    [openPlan],
  );
  const renderEmptyPlans = useCallback(() => <EmptyPlans onCreate={openCreatePlan} />, [openCreatePlan]);
  const contentContainerStyle = useMemo(() => ({ padding: 16, paddingBottom: insets.bottom + 24 }), [insets.bottom]);
  const listStyle = useMemo(() => ({ flex: 1, backgroundColor: theme.background?.val }), [theme.background?.val]);

  return (
    <>
      <Stack.Screen
        options={{
          title: '巡礼计划',
          headerRight: () => (
            <XStack items="center" gap="$1">
              <Button
                chromeless
                circular
                size="$3"
                icon={<ScanLine size={ICON_BUTTON_ICON_SIZE} strokeWidth={2} />}
                aria-label="导入巡礼计划"
                onPress={() => importSheetRef.current?.present()}
              />
              <Button
                chromeless
                circular
                size="$3"
                icon={<Plus size={ICON_BUTTON_ICON_SIZE} strokeWidth={2} />}
                aria-label="新建计划"
                onPress={openCreatePlan}
              />
            </XStack>
          ),
        }}
      />
      <FlashList
        data={plans}
        keyExtractor={planKeyExtractor}
        renderItem={renderPlan}
        ItemSeparatorComponent={PlanSeparator}
        ListEmptyComponent={renderEmptyPlans}
        ListEmptyComponentStyle={emptyListStyle}
        contentInsetAdjustmentBehavior="automatic"
        style={listStyle}
        contentContainerStyle={contentContainerStyle}
      />
      <ActionSheet
        ref={importSheetRef}
        title="导入巡礼计划"
        description="扫描分享图片中的二维码，或选择别人发送给你的计划文件。"
        primaryAction={{
          label: '扫描二维码',
          icon: ScanLine,
          onPress: () => setTimeout(() => void scanQrCode(), 180),
        }}
        sections={[
          {
            actions: [
              { label: '从文件导入', icon: FileDown, onPress: () => setTimeout(() => void importFromFile(), 180) },
            ],
          },
        ]}
      />
    </>
  );
}
