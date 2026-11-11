import type { PreparedPlaceIcon } from '@/services/nearby-place-sprite';
import { Bus, Fuel, Hospital, School, Shield, Train, Utensils } from '@tamagui/lucide-icons-2';
import { Image } from 'expo-image';
import type { ComponentProps } from 'react';
import { View } from 'tamagui';

type Props = { name?: string; fallbackName?: string; color: string; asset?: PreparedPlaceIcon | null };

function fallbackIcon(name: string | undefined, color: string) {
  const iconColor = color as ComponentProps<typeof Shield>['color'];
  switch (name) {
    case 'police':
      return <Shield size={16} color={iconColor} />;
    case 'fuel':
      return <Fuel size={16} color={iconColor} />;
    case 'hospital':
      return <Hospital size={16} color={iconColor} />;
    case 'school':
      return <School size={16} color={iconColor} />;
    case 'rail':
    case 'rail-light':
    case 'rail-metro':
      return <Train size={16} color={iconColor} />;
    case 'bus':
      return <Bus size={16} color={iconColor} />;
    case 'restaurant':
      return <Utensils size={16} color={iconColor} />;
    default:
      return null;
  }
}

/** The source is already decoded; a displayed card never upgrades its fallback icon. */
export default function NearbyPlaceIcon({ name, fallbackName, color, asset }: Props) {
  if (asset) {
    return (
      <View width={asset.width} height={asset.height} pointerEvents="none">
        <Image source={asset.source} contentFit="contain" transition={0} style={{ width: asset.width, height: asset.height }} />
      </View>
    );
  }
  const candidates = [name, fallbackName].filter((value): value is string => !!value);
  return candidates.map((value) => fallbackIcon(value, color)).find(Boolean) ?? null;
}
