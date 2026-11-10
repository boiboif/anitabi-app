import { observePlaceSprite, type PlaceSprite, type SpriteRect } from '@/services/nearby-place-sprite';
import { Bus, Fuel, Hospital, School, Shield, Train, Utensils } from '@tamagui/lucide-icons-2';
import { Image } from 'expo-image';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { View } from 'tamagui';

type Props = { name?: string; fallbackName?: string; color: string };

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

function SpriteImage({ sprite, rect, fallback }: { sprite: PlaceSprite; rect: SpriteRect; fallback: ReactNode }) {
  const [phase, setPhase] = useState<'loading' | 'loaded' | 'failed'>('loading');
  if (phase === 'failed') return fallback;
  // The upstream image is 2x; keep unusually large symbols inside the card.
  const scale = Math.min(0.5, 22 / rect.width, 22 / rect.height);
  return (
    <View width={rect.width * scale} height={rect.height * scale} overflow="hidden" pointerEvents="none">
      <Image
        source={{ uri: sprite.uri }}
        contentFit="fill"
        cachePolicy="memory-disk"
        transition={0}
        onLoad={() => setPhase('loaded')}
        onError={() => setPhase('failed')}
        style={{
          position: 'absolute',
          left: -rect.x * scale,
          top: -rect.y * scale,
          width: 1024 * scale,
          height: 1082 * scale,
        }}
      />
      {phase === 'loading' && fallback ? (
        <View position="absolute" t={0} r={0} b={0} l={0} items="center" justify="center">
          {fallback}
        </View>
      ) : null}
    </View>
  );
}

/** Draw the selected map symbol using Anitabi's sprite; missing data keeps the existing fallback. */
export default function NearbyPlaceIcon({ name, fallbackName, color }: Props) {
  const [sprite, setSprite] = useState<PlaceSprite | null>(null);
  const hasName = !!(name || fallbackName);
  useEffect(() => {
    if (!hasName) return;
    return observePlaceSprite(setSprite);
  }, [hasName]);

  if (!hasName) return null;
  const candidates = [name, fallbackName].filter((value): value is string => !!value);
  const fallback = candidates.map((value) => fallbackIcon(value, color)).find(Boolean) ?? null;
  for (const candidate of candidates) {
    // Some Mapbox styles suffix a Maki name with the icon's nominal size.
    const match = [candidate, candidate.replace(/-(?:11|15)$/, '')].find((value) => sprite?.icons.has(value));
    if (!match || !sprite) continue;
    const rect = sprite.icons.get(match)!;
    return <SpriteImage key={`${sprite.uri}:${match}`} sprite={sprite} rect={rect} fallback={fallback} />;
  }
  return fallback;
}
