import { usePlanPicker } from '@/components/plan-picker-provider';
import type { Bangumi, Point } from '@/services/types';
import { ListPlus } from '@tamagui/lucide-icons-2';
import type { GestureResponderEvent } from 'react-native';
import { Pressable } from 'react-native';
import { useTheme, View } from 'tamagui';

type Props = {
  point: Point;
  bangumi: Bangumi;
  size?: number;
};

export default function AddToPlanButton({ point, bangumi, size = 36 }: Props) {
  const theme = useTheme();
  const { open } = usePlanPicker();

  const handlePress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    open(point, bangumi);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="加入巡礼计划"
      hitSlop={8}
      onPress={handlePress}
      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
    >
      <View width={size} height={size} rounded="$9" bg="$color2" items="center" justify="center">
        <ListPlus size={size * 0.5} color={theme.primary.val} />
      </View>
    </Pressable>
  );
}
