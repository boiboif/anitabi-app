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
      backgroundStyle={{ backgroundColor: theme['color-2'].val }}
      grabberOptions={{ color: theme.primary.val, adaptive: false, topMargin: 8, width: 42, height: 5 }}
    >
      <YStack px="18px" pt="6" pb="18px" gap="7px">
        <Text fontSize="subtitle" fontWeight="700" color="color-12">
          {t('planListSettings', { defaultValue: '列表设置' })}
        </Text>
        <XStack minH={48} gap="13px" items="center" justify="space-between">
          <Text flex={1} fontSize="body" color="color-12">
            {t('showIncompleteLocationsOnly', { defaultValue: '仅显示未完成点位' })}
          </Text>
          <ThemeSwitch
            checked={showIncompleteOnly}
            disabled={disabled}
            onCheckedChange={onIncompleteChange}
            accessibilityLabel={t('showIncompleteLocationsOnly', { defaultValue: '仅显示未完成点位' })}
          />
        </XStack>
        <XStack minH={48} gap="13px" items="center" justify="space-between">
          <YStack justify="center">
            <Text fontSize="body" color="color-12">
              {t('planSortByDistance', { defaultValue: '距离由近到远' })}
            </Text>
            <Text fontSize="caption" color="color-10">
              {t('planDistanceStraightLine', { defaultValue: '显示直线距离，不改变计划顺序' })}
            </Text>
          </YStack>
          <ThemeSwitch
            checked={sortByDistance}
            disabled={disabled}
            onCheckedChange={onDistanceChange}
            accessibilityLabel={t('planSortByDistance', { defaultValue: '距离由近到远' })}
          />
        </XStack>
      </YStack>
    </TrueSheet>
  );
});

export default PlanListSettingsSheet;
