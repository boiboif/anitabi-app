import MapControlSurface from '@/components/map/map-control-surface';
import { MAP_CONTROL_HIT_SLOP, MAP_CONTROL_ICON_SIZE } from '@/lib/constants';
import { Locate, Navigation } from '@/components/icons';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Spinner } from 'tamagui';

type Props = {
  onPress?: () => void;
  loading?: boolean;
  mode?: 'browse' | 'centered' | 'following';
};

export default function LocateButton({ onPress, loading = false, mode = 'browse' }: Props) {
  const { t } = useTranslation();
  const highlighted = !loading && mode !== 'browse';
  const following = mode === 'following';
  const label = following
    ? t('stopHeadingFollowAndRecenter')
    : mode === 'centered'
      ? t('start3DHeadingFollow')
      : t('goToCurrentLocation');

  return (
    <Pressable
      hitSlop={MAP_CONTROL_HIT_SLOP}
      style={({ pressed }) => ({ opacity: pressed && !loading ? 0.7 : 1 })}
      disabled={loading}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: loading, disabled: loading }}
    >
      <MapControlSurface bg={highlighted ? 'primary' : 'background'}>
        {loading ? (
          <Spinner size="small" color="color-11" />
        ) : following ? (
          // Shift the arrow's heavier upper-right strokes toward the button center.
          <Navigation size={MAP_CONTROL_ICON_SIZE} color="white" viewBox="1.5 -1.5 24 24" />
        ) : (
          <Locate size={MAP_CONTROL_ICON_SIZE} color={highlighted ? 'white' : 'color-11'} />
        )}
      </MapControlSurface>
    </Pressable>
  );
}
