import { Layers } from '@tamagui/lucide-icons-2';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { View } from 'tamagui';

export const MAP_STYLES = [
  { key: 'streets', url: 'mapbox://styles/mapbox/streets-v12', label: '街道' },
  { key: 'satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12', label: '卫星' },
  { key: 'outdoors', url: 'mapbox://styles/mapbox/outdoors-v12', label: '户外' },
  { key: 'dark', url: 'mapbox://styles/mapbox/dark-v11', label: '深色' },
  { key: 'light', url: 'mapbox://styles/mapbox/light-v11', label: '浅色' },
] as const;

type Props = {
  styleIndex: number;
  onChange: (index: number) => void;
};

export default function LayerSwitch({ styleIndex, onChange }: Props) {
  return (
    <View r="$2" p="$1.5" z={10} position="absolute" t={200}>
      <TouchableOpacity
        style={styles.button}
        activeOpacity={0.7}
        onPress={() => onChange((styleIndex + 1) % MAP_STYLES.length)}
      >
        <Layers size={24} color="#555" />
        <Text style={styles.label}>{MAP_STYLES[styleIndex].label}</Text>
      </TouchableOpacity>
    </View>
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
  label: {
    fontSize: 8,
    color: '#555',
    marginTop: 1,
  },
});
