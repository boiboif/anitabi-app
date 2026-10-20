import { MAP_CONTROL_ICON_SIZE, MAP_CONTROL_SIZE } from '@/lib/constants';
import { MAP_STYLES } from '@/lib/map-styles';
import { Layers } from '@tamagui/lucide-icons-2';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'tamagui';

type Props = {
  styleIndex: number;
  onChange: (index: number) => void;
};

export default function LayerSwitch({ styleIndex, onChange }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: theme.background.val }]}
      activeOpacity={0.7}
      onPress={() => onChange((styleIndex + 1) % MAP_STYLES.length)}
    >
      <Layers size={MAP_CONTROL_ICON_SIZE} color="$color11" />
      <Text
        fontSize="$caption"
        color="$color11"
        text="center"
        numberOfLines={1}
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
    width: MAP_CONTROL_SIZE,
    height: MAP_CONTROL_SIZE,
    borderRadius: MAP_CONTROL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 4px 0 rgba(0, 0, 0, 0.2)',
  },
});
