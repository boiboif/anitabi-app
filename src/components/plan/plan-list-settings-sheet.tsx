import { ThemeSwitch } from '@/components/ui/theme-switch';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, XStack, YStack, useTheme } from 'tamagui';

type Props = {
  showIncompleteOnly: boolean;
  sortByDistance: boolean;
  disabled: boolean;
  onIncompleteChange: (checked: boolean) => void;
  onDistanceChange: (checked: boolean) => void;
};

const PlanListSettingsSheet = forwardRef<TrueSheet, Props>(function PlanListSettingsSheet(
  { showIncompleteOnly, sortByDistance, disabled, onIncompleteChange, onDistanceChange },
  ref,
) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <TrueSheet
      ref={ref}
      detents={['auto']}
      cornerRadius={18}
      backgroundColor={theme.color2.val}
      grabberOptions={{ color: theme.primary.val, adaptive: false, topMargin: 8, width: 42, height: 5 }}
    >
      <YStack px="$4" pt="$5" pb="$4" gap="$2">
        <Text fontSize="$subtitle" fontWeight="700" color="$color12">
          {t('planListSettings', { defaultValue: '列表设置' })}
        </Text>
        <XStack minH={48} gap="$3" items="center" justify="space-between">
          <Text flex={1} fontSize="$body" color="$color12">
            {t('showIncompleteLocationsOnly', { defaultValue: '仅显示未完成点位' })}
          </Text>
          <ThemeSwitch
            checked={showIncompleteOnly}
            disabled={disabled}
            onCheckedChange={onIncompleteChange}
            accessibilityLabel={t('showIncompleteLocationsOnly', { defaultValue: '仅显示未完成点位' })}
          />
        </XStack>
        <XStack minH={48} gap="$3" items="center" justify="space-between">
          <Text flex={1} fontSize="$body" color="$color12">
            {t('planSortByDistance', { defaultValue: '距离由近到远' })}
          </Text>
          <ThemeSwitch
            checked={sortByDistance}
            disabled={disabled}
            onCheckedChange={onDistanceChange}
            accessibilityLabel={t('planSortByDistance', { defaultValue: '距离由近到远' })}
          />
        </XStack>
        <Text fontSize="$caption" color="$color10">
          {t('planDistanceStraightLine', { defaultValue: '显示直线距离，不改变计划顺序' })}
        </Text>
      </YStack>
    </TrueSheet>
  );
});

export default PlanListSettingsSheet;
