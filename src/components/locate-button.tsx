import { Locate } from '@tamagui/lucide-icons-2';
import { StyleSheet, TouchableOpacity } from 'react-native';

type Props = {
  onPress?: () => void;
};

export default function LocateButton({ onPress }: Props) {
  return (
    <TouchableOpacity style={styles.button} activeOpacity={0.7} onPress={onPress}>
      <Locate size={24} color="#555" />
    </TouchableOpacity>
  );
}
const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 4px 0 rgba(0, 0, 0, 0.2)',
  },
});
