import { buildWalkingNavigationUrl } from '@/lib/pilgrimage-navigation';
import type { Point } from '@/services/types';
import { usePilgrimagePreferences } from '@/store/use-pilgrimage-preferences';
import { Navigation } from '@tamagui/lucide-icons-2';
import { useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { Alert, Linking, Platform, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, View } from 'tamagui';

type Props = {
  point: Point;
  compact?: boolean;
  compactSize?: number;
  bare?: boolean;
};

export default function PointNavigationButton({ point, compact = false, compactSize = 30, bare = false }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigationMap = usePilgrimagePreferences((state) => state.navigationMap);
  const mapName = t(navigationMap);
  const opening = useRef(false);

  const openNavigation = async (event: GestureResponderEvent) => {
    event.stopPropagation();
    if (opening.current) return;
    opening.current = true;
    try {
      const url = buildWalkingNavigationUrl(navigationMap, point.geo, Platform.OS);
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('couldNotOpenNavigation'), t('pleaseInstallMapOrChangeNavigationSettings', { map: mapName }));
    } finally {
      opening.current = false;
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('navigateWithMap', { map: mapName })}
      hitSlop={8}
      onPress={openNavigation}
      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
    >
      <View
        width={compact ? compactSize : 36}
        height={compact ? compactSize : 36}
        rounded="$9"
        bg={bare ? 'transparent' : '$color2'}
        items="center"
        justify="center"
      >
        <Navigation size={compact ? compactSize * (bare ? 0.58 : 0.5) : 18} color={theme.primary.val} />
      </View>
    </Pressable>
  );
}
