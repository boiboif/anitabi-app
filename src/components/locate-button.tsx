import { Locate } from '@tamagui/lucide-icons-2';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Spinner } from 'tamagui';

type Props = {
  onPress?: () => void;
  loading?: boolean;
};

export default function LocateButton({ onPress, loading = false }: Props) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      style={styles.button}
      activeOpacity={0.7}
      disabled={loading}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('goToCurrentLocation', { defaultValue: '定位到当前位置' })}
      accessibilityState={{ busy: loading, disabled: loading }}
    >
      {loading ? <Spinner size="small" color="$color11" /> : <Locate size={24} color="#555" />}
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
