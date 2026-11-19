import { buildWalkingNavigationUrl } from '@/lib/pilgrimage-navigation';
import type { Point } from '@/services/types';
import { usePilgrimagePreferences } from '@/store/use-pilgrimage-preferences';
import { Navigation } from '@/components/icons';
import { useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { Alert, Linking, Platform, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'tamagui';

type Props = ({ point: Point; mapCoordinate?: never } | { point?: never; mapCoordinate: [number, number] }) & {
  compact?: boolean;
  compactSize?: number;
  bare?: boolean;
  showLabel?: boolean;
};

export default function PointNavigationButton({ point, mapCoordinate, compact = false, compactSize = 30, bare = false, showLabel = false }: Props) {
  const { t } = useTranslation();
  const navigationMap = usePilgrimagePreferences((state) => state.navigationMap);
  const mapName = t(navigationMap);
  const opening = useRef(false);

  const openNavigation = async (event: GestureResponderEvent) => {
    event.stopPropagation();
    if (opening.current) return;
    opening.current = true;
    try {
      const url = buildWalkingNavigationUrl(navigationMap, point ? point.geo : mapCoordinate, Platform.OS, point ? 'point' : 'map');
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
        w={showLabel ? undefined : compact ? compactSize : 36}
        h={compact ? compactSize - (showLabel ? 4 : 0) : 36}
        px={showLabel ? '2-5' : undefined}
        rounded={26}
        bg={bare ? 'transparent' : 'color-2'}
        flexDirection="row"
        gap="0-5"
        items="center"
        justify="center"
      >
        {showLabel ? <Text fontSize="caption" color="primary">{t('navigationAction')}</Text> : null}
        <Navigation size={compact ? compactSize * (bare ? 0.58 : 0.5) : 18} color="primary" />
      </View>
    </Pressable>
  );
}
