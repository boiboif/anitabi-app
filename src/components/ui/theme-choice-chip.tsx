import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, useThemeName, View, XStack } from 'tamagui';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityRole?: 'radio' | 'checkbox';
  leading?: ReactNode;
};

type GroupProps<T extends string> = {
  label: string;
  options: { value: T; label: string; leading?: ReactNode }[];
  inline?: boolean;
} & (
  | { multiple?: false; value: T; onChange: (value: T) => void }
  | { multiple: true; value: readonly T[]; onChange: (value: T[]) => void }
);

export function ThemeChoiceChip({ label, selected, onPress, accessibilityRole = 'radio', leading }: Props) {
  const isDark = useThemeName() === 'dark';
  const unselectedBackground = isDark ? '$color4' : '$color3';

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
      onPress={onPress}
    >
      <XStack px={10} gap={6} items="center" rounded={8} bg={selected ? '$primary' : unselectedBackground}>
        {leading}
        <Text color={selected ? 'white' : '$color11'} fontSize="$footnote" lineHeight={32}>
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}

function ThemeChoiceChipGroup<T extends string>(props: GroupProps<T>) {
  const { label, options, inline = false } = props;

  return (
    <View
      flexDirection={inline ? 'row' : 'column'}
      items={inline ? 'center' : undefined}
      minH={inline ? 46 : undefined}
      gap={inline ? 8 : 4}
    >
      <Text flex={inline ? 1 : undefined} minW={0} color="$color12" fontSize="$body">
        {label}
      </Text>
      <XStack
        minH={44}
        items="center"
        gap={8}
        py={inline ? 0 : 8}
        flexWrap={inline ? 'nowrap' : 'wrap'}
        accessibilityRole={props.multiple ? undefined : 'radiogroup'}
        accessibilityLabel={label}
      >
        {options.map((option) => {
          const selected = props.multiple ? props.value.includes(option.value) : props.value === option.value;

          return (
            <ThemeChoiceChip
              key={option.value}
              label={option.label}
              leading={option.leading}
              selected={selected}
              accessibilityRole={props.multiple ? 'checkbox' : 'radio'}
              onPress={() => {
                if (props.multiple) {
                  props.onChange(
                    selected ? props.value.filter((value) => value !== option.value) : [...props.value, option.value],
                  );
                } else {
                  props.onChange(option.value);
                }
              }}
            />
          );
        })}
      </XStack>
    </View>
  );
}

ThemeChoiceChip.Group = ThemeChoiceChipGroup;
