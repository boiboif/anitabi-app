import { ACTION_SHEET_ICON_SIZE } from '@/lib/ui-sizes';
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
  title?: string;
  description?: string;
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
  const iconColor = action.destructive ? 'red-10' : 'color-12';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel ?? action.label}
      accessibilityState={{ disabled: action.disabled }}
      disabled={action.disabled}
      onPress={() => onActivate(action)}
      style={({ pressed }) => ({ opacity: action.disabled ? 0.42 : pressed ? 0.58 : 1 })}
    >
      <XStack minH={54} items="center" gap="7px" px="13px">
        <View w={30} items="center" justify="center">
          <Icon size={ACTION_SHEET_ICON_SIZE} strokeWidth={2} color={iconColor} />
        </View>
        <Text flex={1} fontSize="body" lineHeight="21px" color={iconColor}>
          {action.label}
        </Text>
      </XStack>
    </Pressable>
  );
}

export const ActionSheet = forwardRef<ActionSheetRef, ActionSheetProps>(function ActionSheet(
  { title, description, primaryAction, sections = [], ...sheetProps },
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
      backgroundColor={sheetProps.backgroundColor ?? theme['color-2'].val}
      grabberOptions={
        sheetProps.grabberOptions ?? { color: theme.primary.val, adaptive: false, topMargin: 8, width: 42, height: 5 }
      }
    >
      <YStack px="13px" pt="6" pb="18px" gap="2-5">
        {title || description ? (
          <YStack px="0-5" pb="0-5" gap="0-5">
            {title ? (
              <Text fontSize="subtitle" lineHeight="22px" fontWeight="700" color="color-12">
                {title}
              </Text>
            ) : null}
            {description ? (
              <Text fontSize="footnote" lineHeight="18px" color="color-11">
                {description}
              </Text>
            ) : null}
          </YStack>
        ) : null}
        {primaryAction ? (
          <YStack overflow="hidden" rounded={7} bg="background">
            <ActionRow action={primaryAction} onActivate={activateAction} />
          </YStack>
        ) : null}

        {sections.map((section, sectionIndex) => (
          <YStack key={section.title ?? `section-${sectionIndex}`} overflow="hidden" rounded={7} bg="background">
            {section.title ? (
              <Text px="13px" pt="2-5" pb="0-5" fontSize="caption" color="color-10">
                {section.title}
              </Text>
            ) : null}
            {section.actions.map((action, actionIndex) => (
              <View key={action.label}>
                {actionIndex > 0 ? <View ml={50} bg="color-4" h={StyleSheet.hairlineWidth} /> : null}
                <ActionRow action={action} onActivate={activateAction} />
              </View>
            ))}
          </YStack>
        ))}
      </YStack>
    </TrueSheet>
  );
});
