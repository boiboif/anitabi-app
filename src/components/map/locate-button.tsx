import { MAP_CONTROL_ICON_SIZE, MAP_CONTROL_SIZE } from '@/lib/constants';
import { Locate, Navigation } from '@/components/icons';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Spinner, YStack } from 'tamagui';

type Props = {
  onPress?: () => void;
  loading?: boolean;
  mode?: 'browse' | 'centered' | 'following';
};

export default function LocateButton({ onPress, loading = false, mode = 'browse' }: Props) {
  const { t } = useTranslation();
  const highlighted = !loading && mode !== 'browse';
  const Icon = mode === 'following' ? Navigation : Locate;
  const label = mode === 'following'
    ? t('stopHeadingFollowAndRecenter')
    : mode === 'centered'
      ? t('start3DHeadingFollow')
      : t('goToCurrentLocation');

  return (
    <Pressable
      style={({ pressed }) => ({ opacity: pressed && !loading ? 0.7 : 1 })}
      disabled={loading}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: loading, disabled: loading }}
    >
      <YStack
        w={MAP_CONTROL_SIZE}
        h={MAP_CONTROL_SIZE}
        rounded={MAP_CONTROL_SIZE / 2}
        bg={highlighted ? 'primary' : 'background'}
        items="center"
        justify="center"
        boxShadow="0 0 4px rgba(0,0,0,0.2)"
        pointerEvents="none"
      >
        {loading ? <Spinner size="small" color="color-11" /> : <Icon size={MAP_CONTROL_ICON_SIZE} color={highlighted ? 'white' : 'color-11'} />}
      </YStack>
    </Pressable>
  );
}
