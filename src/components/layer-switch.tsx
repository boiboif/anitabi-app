import type { TranslationMessage } from '@/i18n/messages';
import { Layers } from '@tamagui/lucide-icons-2';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'tamagui';

export const MAP_STYLES = [
  { key: 'streets', url: 'mapbox://styles/mapbox/streets-v12', label: { key: 'streets', defaultValue: '街道' } },
  {
    key: 'satellite',
    url: 'mapbox://styles/mapbox/satellite-streets-v12',
    label: { key: 'satellite', defaultValue: '卫星' },
  },
  { key: 'outdoors', url: 'mapbox://styles/mapbox/outdoors-v12', label: { key: 'outdoors', defaultValue: '户外' } },
  { key: 'dark', url: 'mapbox://styles/mapbox/dark-v11', label: { key: 'dark', defaultValue: '深色' } },
  { key: 'light', url: 'mapbox://styles/mapbox/light-v11', label: { key: 'light', defaultValue: '浅色' } },
] as const satisfies readonly { key: string; url: string; label: TranslationMessage }[];

type Props = {
  styleIndex: number;
  onChange: (index: number) => void;
};

export default function LayerSwitch({ styleIndex, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      style={styles.button}
      activeOpacity={0.7}
      onPress={() => onChange((styleIndex + 1) % MAP_STYLES.length)}
    >
      <Layers size={24} color="#555" />
      <Text
        fontSize="$caption"
        text="center"
        numberOfLines={1}
        style={styles.label}
        adjustsFontSizeToFit
        minimumFontScale={0.3}
      >
        {t(MAP_STYLES[styleIndex].label.key, { defaultValue: MAP_STYLES[styleIndex].label.defaultValue })}
      </Text>
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
  label: {
    color: '#555',
  },
});
