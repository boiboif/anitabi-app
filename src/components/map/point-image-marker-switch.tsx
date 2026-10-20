import { MAP_CONTROL_ICON_SIZE, MAP_CONTROL_SIZE } from '@/lib/constants';
import { Image, ImageOff } from '@tamagui/lucide-icons-2';
import { Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'tamagui';

type Props = {
  visible: boolean;
  onChange: (visible: boolean) => void;
};

export default function PointImageMarkerSwitch({ visible, onChange }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const Icon = visible ? Image : ImageOff;
  const label = visible
    ? t('hideLocationImages', { defaultValue: '隐藏点位图片' })
    : t('showLocationImages', { defaultValue: '显示点位图片' });

  return (
    <Pressable
      style={({ pressed }) => [styles.button, { backgroundColor: theme.background.val, opacity: pressed ? 0.7 : 1 }]}
      onPress={() => onChange(!visible)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: visible }}
    >
      <Icon size={MAP_CONTROL_ICON_SIZE} color="$color11" />
    </Pressable>
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
