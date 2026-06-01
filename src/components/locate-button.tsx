import { Locate } from '@tamagui/lucide-icons-2';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type Props = {
  onPress?: () => void;
};

export default function LocateButton({ onPress }: Props) {
  return (
    <View style={styles.wrapper}>
      <TouchableOpacity style={styles.button} activeOpacity={0.7} onPress={onPress}>
        <Locate size={24} color="#555" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 130,
    right: 16,
    zIndex: 10,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 10px 0 rgba(0, 0, 0, 0.2)',
  },
});
