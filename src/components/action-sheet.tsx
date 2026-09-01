import { TrueSheet, type TrueSheetProps } from '@lodev09/react-native-true-sheet';
import type { IconProps } from '@tamagui/helpers-icon';
import { ComponentType, forwardRef, useCallback, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, View, XStack, YStack, useTheme } from 'tamagui';

export type ActionSheetRef = TrueSheet;

export type ActionSheetAction = {
  label: string;
  icon: ComponentType<IconProps>;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export type ActionSheetSection = {
  title?: string;
  actions: ActionSheetAction[];
};

export type ActionSheetProps = Omit<TrueSheetProps, 'children'> & {
  primaryAction?: ActionSheetAction;
  sections?: ActionSheetSection[];
};

function ActionRow({
  action,
  onActivate,
}: {
  action: ActionSheetAction;
  onActivate: (action: ActionSheetAction) => void;
}) {
  const Icon = action.icon;
  const iconColor = action.destructive ? '$red10' : '$color12';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel ?? action.label}
      accessibilityState={{ disabled: action.disabled }}
      disabled={action.disabled}
      onPress={() => onActivate(action)}
      style={({ pressed }) => ({ opacity: action.disabled ? 0.42 : pressed ? 0.58 : 1 })}
    >
      <XStack minH={54} items="center" gap="$2" px="$3">
        <View width={30} items="center" justify="center">
          <Icon size={21} strokeWidth={2} color={iconColor} />
        </View>
        <Text flex={1} fontSize="$body" lineHeight={21} color={iconColor}>
          {action.label}
        </Text>
      </XStack>
    </Pressable>
  );
}

export const ActionSheet = forwardRef<ActionSheetRef, ActionSheetProps>(function ActionSheet(
  { primaryAction, sections = [], ...sheetProps },
  ref,
) {
  const theme = useTheme();
  const sheetRef = useRef<ActionSheetRef>(null);
  const setSheetRef = useCallback(
    (instance: ActionSheetRef | null) => {
      sheetRef.current = instance;
      if (typeof ref === 'function') ref(instance);
      else if (ref) ref.current = instance;
    },
    [ref],
  );

  const activateAction = useCallback((action: ActionSheetAction) => {
    void sheetRef.current?.dismiss();
    action.onPress();
  }, []);

  return (
    <TrueSheet
      ref={setSheetRef}
      {...sheetProps}
      detents={sheetProps.detents ?? ['auto']}
      cornerRadius={sheetProps.cornerRadius ?? 18}
      backgroundColor={sheetProps.backgroundColor ?? theme.color2.val}
      grabberOptions={
        sheetProps.grabberOptions ?? { color: theme.color8.val, adaptive: false, topMargin: 8, width: 42, height: 5 }
      }
    >
      <YStack px="$3" pt="$5" pb="$4" gap="$2.5">
        {primaryAction ? (
          <YStack overflow="hidden" rounded="$3" bg="$color1">
            <ActionRow action={primaryAction} onActivate={activateAction} />
          </YStack>
        ) : null}

        {sections.map((section, sectionIndex) => (
          <YStack key={section.title ?? `section-${sectionIndex}`} overflow="hidden" rounded="$3" bg="$color1">
            {section.title ? (
              <Text px="$3" pt="$2.5" pb="$1" fontSize="$caption" color="$color10">
                {section.title}
              </Text>
            ) : null}
            {section.actions.map((action, actionIndex) => (
              <View key={action.label}>
                {actionIndex > 0 ? <View ml={50} bg="$color4" height={StyleSheet.hairlineWidth} /> : null}
                <ActionRow action={action} onActivate={activateAction} />
              </View>
            ))}
          </YStack>
        ))}
      </YStack>
    </TrueSheet>
  );
});
