import type { IconProps } from '@tamagui/helpers-icon';
import { ChevronRight } from '@tamagui/lucide-icons-2';
import type { ComponentType, ReactNode } from 'react';
import { Pressable, StyleSheet, type AccessibilityRole, type AccessibilityState } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

type SettingsIcon = ComponentType<IconProps>;

type SettingCellProps = {
  icon: SettingsIcon;
  title: string;
  description?: string;
  value?: string;
  rightAccessory?: ReactNode;
  onPress?: () => void;
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
  showDivider = false,
  accessibilityRole = 'button',
  accessibilityState,
  disabled = false,
}: SettingCellProps) {
  const content = (
    <XStack items="center" gap="$4">
      <View minH={62} items="center" justify="center">
        <Icon size={20} color="$color12" />
      </View>
      <YStack flex={1}>
        <XStack minH={62} items="center" gap="$3">
          <YStack flex={1} gap="$0.5" justify="center">
            <Text fontSize={14} lineHeight={20} fontWeight="600" color="$color12">
              {title}
            </Text>
            {description ? (
              <Text fontSize={11} lineHeight={16} color="$color11">
                {description}
              </Text>
            ) : null}
          </YStack>
          {value ? (
            <Text fontSize={11} color="$color10">
              {value}
            </Text>
          ) : null}
          {rightAccessory ?? (onPress ? <ChevronRight size={20} color="$color10" /> : null)}
        </XStack>
        {showDivider ? <View bg="$color6" height={StyleSheet.hairlineWidth} /> : null}
      </YStack>
    </XStack>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={title}
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, opacity: pressed && !disabled ? 0.62 : 1 })}
    >
      {content}
    </Pressable>
  );
}
