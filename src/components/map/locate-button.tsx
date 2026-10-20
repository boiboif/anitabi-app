import { MAP_CONTROL_ICON_SIZE, MAP_CONTROL_SIZE } from '@/lib/constants';
import { Locate } from '@tamagui/lucide-icons-2';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Spinner, useTheme } from 'tamagui';

type Props = {
  onPress?: () => void;
  loading?: boolean;
};

export default function LocateButton({ onPress, loading = false }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: theme.background.val }]}
      activeOpacity={0.7}
      disabled={loading}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('goToCurrentLocation', { defaultValue: '定位到当前位置' })}
      accessibilityState={{ busy: loading, disabled: loading }}
    >
      {loading ? <Spinner size="small" color="$color11" /> : <Locate size={MAP_CONTROL_ICON_SIZE} color="$color11" />}
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
