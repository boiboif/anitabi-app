import type { IconProps } from '@tamagui/helpers-icon';
import { ChevronRight } from '@/components/icons';
import type { ComponentType, ReactNode } from 'react';
import { Pressable, StyleSheet, type AccessibilityRole, type AccessibilityState } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

type SettingsIcon = ComponentType<IconProps>;

type SettingCellProps = {
  icon?: SettingsIcon;
  title: string;
  description?: string;
  value?: string;
  rightAccessory?: ReactNode;
  onPress?: () => void;
  compact?: boolean;
  showDivider?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  disabled?: boolean;
};

export function SettingCell({
  icon: Icon,
  title,
  description,
  value,
  rightAccessory,
  onPress,
  compact = false,
  showDivider = false,
  accessibilityRole = 'button',
  accessibilityState,
  disabled = false,
}: SettingCellProps) {
  const minHeight = compact ? 56 : 62;
  const content = (
    <XStack items="center" gap="18px">
      {Icon ? (
        <View minH={minHeight} items="center" justify="center">
          <Icon size={20} color="color-12" />
        </View>
      ) : null}
      <YStack flex={1}>
        <XStack minH={minHeight} items="center" gap="13px">
          <YStack flex={1} gap="px" justify="center">
            <Text fontSize="body" lineHeight="20px" fontWeight="600" color="color-12">
              {title}
            </Text>
            {description ? (
              <Text fontSize="caption" lineHeight="16px" color="color-11">
                {description}
              </Text>
            ) : null}
          </YStack>
          {value ? (
            <Text fontSize="caption" color="color-10">
              {value}
            </Text>
          ) : null}
          {rightAccessory ?? (onPress ? <ChevronRight size={20} color="color-10" /> : null)}
        </XStack>
        {showDivider ? <View bg="color-4" h={StyleSheet.hairlineWidth} /> : null}
      </YStack>
    </XStack>
  );

  if (!onPress) {
    return content;
  }

  // Preserve the row's intrinsic height in content-sized sheets.
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={title}
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed && !disabled ? 0.62 : 1 })}
    >
      {content}
    </Pressable>
  );
}
