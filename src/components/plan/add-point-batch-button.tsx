import { usePlanPicker } from '@/components/plan/plan-picker-provider';
import { usePlans } from '@/store/use-plans';
import type { PlanPointEntry } from '@/utils/plan-point-batches';
import { Toast } from '@boiboif/react-native-toast';
import { Check, ListPlus } from '@tamagui/lucide-icons-2';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { Text, useTheme, XStack } from 'tamagui';

type Props = {
  entries: PlanPointEntry[];
  title: string;
  label?: string;
  planId?: string;
  planPointKeys?: ReadonlySet<string>;
  compact?: boolean;
};

export default function AddPointBatchButton({ entries, title, label, planId, planPointKeys, compact = false }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { openBatch } = usePlanPicker();
  const plan = usePlans((state) => (planId ? state.plans.find((item) => item.id === planId) : undefined));
  const addPointsToPlans = usePlans((state) => state.addPointsToPlans);
  const keys = planPointKeys ?? new Set(plan?.items.map((item) => item.key));
  const allAdded = Boolean(
    plan && entries.length > 0 && entries.every(({ point, bangumi }) => keys.has(`${bangumi.id}:${point.id}`)),
  );
  const disabled = entries.length === 0 || Boolean(planId && (!plan || allAdded));
  const buttonLabel = allAdded
    ? t('allLocationsAlreadyAdded', { defaultValue: '已全部加入' })
    : (label ?? t('addThisGroupToPlan', { defaultValue: '加入本组' }));

  const add = () => {
    if (disabled) return;
    if (!planId) {
      openBatch(entries, title);
      return;
    }
    const result = addPointsToPlans(entries, [planId]);
    if (!result.planCount) return;
    Toast.show(
      t('batchPlanPointsAdded', {
        defaultValue: '已向 {{plans}} 个计划添加 {{added}} 个点位，跳过 {{existing}} 个已有点位',
        plans: result.planCount,
        added: result.addedCount,
        existing: result.existingCount,
      }),
    );
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} · ${buttonLabel}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={compact ? 4 : undefined}
      onPress={(event) => {
        event.stopPropagation();
        add();
      }}
      style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.65 : 1 })}
    >
      <XStack minH={compact ? 28 : 36} px={compact ? '$1.5' : '$2.5'} gap="$1" items="center" rounded="$2">
        {allAdded ? <Check size={16} color={theme.primary.val} /> : <ListPlus size={16} color={theme.primary.val} />}
        <Text color="$primary" fontSize="$footnote" fontWeight="600">
          {buttonLabel}
        </Text>
      </XStack>
    </Pressable>
  );
}
