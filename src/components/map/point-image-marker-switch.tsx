import MapControlSurface from '@/components/map/map-control-surface';
import { MAP_CONTROL_HIT_SLOP, MAP_CONTROL_ICON_SIZE } from '@/lib/constants';
import { Image, ImageOff } from '@/components/icons';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';

type Props = {
  visible: boolean;
  onChange: (visible: boolean) => void;
};

export default function PointImageMarkerSwitch({ visible, onChange }: Props) {
  const { t } = useTranslation();
  const Icon = visible ? Image : ImageOff;
  const label = visible
    ? t('hideLocationImages', { defaultValue: '隐藏点位图片' })
    : t('showLocationImages', { defaultValue: '显示点位图片' });

  return (
    <Pressable
      hitSlop={MAP_CONTROL_HIT_SLOP}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      onPress={() => onChange(!visible)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: visible }}
    >
      <MapControlSurface>
        <Icon size={MAP_CONTROL_ICON_SIZE} color="color-11" />
      </MapControlSurface>
    </Pressable>
  );
}
