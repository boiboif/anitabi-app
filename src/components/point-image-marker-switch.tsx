import { Image, ImageOff } from '@tamagui/lucide-icons-2';
import { StyleSheet, TouchableOpacity } from 'react-native';

type Props = {
  visible: boolean;
  onChange: (visible: boolean) => void;
};

export default function PointImageMarkerSwitch({ visible, onChange }: Props) {
  const Icon = visible ? Image : ImageOff;
  const label = visible ? '隐藏点位图片' : '显示点位图片';

  return (
    <TouchableOpacity
      style={styles.button}
      activeOpacity={0.7}
      onPress={() => onChange(!visible)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: visible }}
    >
      <Icon size={24} color="#555" />
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
