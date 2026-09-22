import { Dices } from '@tamagui/lucide-icons-2';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from 'tamagui';

type Props = {
  onPress?: () => void;
};

export default function RandomPointButton({ onPress }: Props) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: theme.color1.val }]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <Dices size={24} color="$color11" />
    </TouchableOpacity>
  );
}
const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 4px 0 rgba(0, 0, 0, 0.2)',
  },
});
