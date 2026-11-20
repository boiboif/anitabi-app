import MapControlSurface from '@/components/map/map-control-surface';
import { MAP_CONTROL_HIT_SLOP, MAP_CONTROL_LABELED_ICON_SIZE } from '@/lib/constants';
import { MAP_STYLES } from '@/lib/map-styles';
import { Layers } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { Text } from 'tamagui';

type Props = {
  styleIndex: number;
  onChange: (index: number) => void;
};

export default function LayerSwitch({ styleIndex, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <Pressable
      hitSlop={MAP_CONTROL_HIT_SLOP}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      onPress={() => onChange((styleIndex + 1) % MAP_STYLES.length)}
    >
      <MapControlSurface>
        <Layers size={MAP_CONTROL_LABELED_ICON_SIZE} color="color-11" />
        <Text
          maxW="100%"
          fontSize={9}
          lineHeight="11px"
          fontWeight="600"
          color="color-11"
          text="center"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.3}
        >
          {t(MAP_STYLES[styleIndex].label.key, { defaultValue: MAP_STYLES[styleIndex].label.defaultValue })}
        </Text>
      </MapControlSurface>
    </Pressable>
  );
}
