import MapControlSurface from '@/components/map/map-control-surface';
import { MAP_CONTROL_HIT_SLOP, MAP_CONTROL_LABELED_ICON_SIZE } from '@/lib/constants';
import { Building2 } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { Text } from 'tamagui';

type Props = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

export default function Building3DSwitch({ enabled, onChange }: Props) {
  const { t } = useTranslation();
  const label = enabled
    ? t('turnOff3DMapMode', { defaultValue: '关闭 3D 地图模式' })
    : t('turnOn3DMapMode', { defaultValue: '开启 3D 地图模式' });

  return (
    <Pressable
      hitSlop={MAP_CONTROL_HIT_SLOP}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      onPress={() => onChange(!enabled)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: enabled }}
    >
      <MapControlSurface bg={enabled ? 'primary' : 'background'}>
        <Building2 size={MAP_CONTROL_LABELED_ICON_SIZE} color={enabled ? 'white' : 'color-11'} />
        <Text
          maxW="100%"
          fontSize={9}
          lineHeight="11px"
          fontWeight="600"
          color={enabled ? 'white' : 'color-11'}
          text="center"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.3}
        >
          3D
        </Text>
      </MapControlSurface>
    </Pressable>
  );
}
