import { Image, ImageOff } from '@tamagui/lucide-icons-2';
import { StyleSheet, TouchableOpacity } from 'react-native';
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
    <TouchableOpacity
      style={[styles.button, { backgroundColor: theme.color1.val }]}
      activeOpacity={0.7}
      onPress={() => onChange(!visible)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: visible }}
    >
      <Icon size={24} color="$color11" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 4px 0 rgba(0, 0, 0, 0.2)',
  },
});
