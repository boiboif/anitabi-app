import type { Point } from '@/services/types';
import { Navigation } from '@tamagui/lucide-icons-2';
import type { GestureResponderEvent } from 'react-native';
import { Linking, Platform, Pressable } from 'react-native';
import { useTheme, View } from 'tamagui';

type Props = {
  point: Point;
};

function buildGoogleMapsUrl([latitude, longitude]: [number, number], fallback = false): string {
  const destination = `${latitude},${longitude}`;
  if (fallback) {
    return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  }

  if (Platform.OS === 'ios') {
    return `comgooglemaps://?daddr=${destination}`;
  }

  if (Platform.OS === 'android') {
    return `google.navigation:q=${destination}`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

export default function GoogleMapsNavigationButton({ point }: Props) {
  const theme = useTheme();

  const openGoogleMaps = async (event: GestureResponderEvent) => {
    event.stopPropagation();
    const appUrl = buildGoogleMapsUrl(point.geo);
    const webUrl = buildGoogleMapsUrl(point.geo, true);

    try {
      await Linking.openURL(appUrl);
    } catch {
      await Linking.openURL(webUrl);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="在谷歌地图中导航"
      hitSlop={8}
      onPress={openGoogleMaps}
      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
    >
      <View width={36} height={36} rounded="$9" bg="$color2" items="center" justify="center">
        <Navigation size={18} color={theme.primary.val} />
      </View>
    </Pressable>
  );
}
