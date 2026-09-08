import type { Bangumi, Point } from '@/services/types';
import { getFavoritePointKey, useFavoritePoints } from '@/store/use-favorite-points';
import { Heart } from '@tamagui/lucide-icons-2';
import { Pressable } from 'react-native';
import { useTheme, View } from 'tamagui';

type Props = {
  point: Point;
  bangumi: Bangumi;
  size?: number;
  buttonSize?: number;
  overlay?: boolean;
};

export default function FavoritePointButton({ point, bangumi, size = 18, buttonSize = 36, overlay = false }: Props) {
  const theme = useTheme();
  const key = getFavoritePointKey(bangumi.id, point.id);
  const isFavorite = useFavoritePoints((state) => state.favoriteKeys.has(key));
  const toggleFavorite = useFavoritePoints((state) => state.toggleFavorite);
  const iconColor = isFavorite ? theme.primary.val : theme.color11.val;

  const button = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isFavorite ? '取消收藏巡礼点' : '收藏巡礼点'}
      hitSlop={8}
      onPress={(event) => {
        event.stopPropagation();
        toggleFavorite(point, bangumi);
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
    >
      <View width={buttonSize} height={buttonSize} rounded="$9" bg="$color2" items="center" justify="center">
        <Heart size={size} color={iconColor} fill={isFavorite ? iconColor : 'transparent'} />
      </View>
    </Pressable>
  );

  return overlay ? (
    <View position="absolute" t="$2" r="$2">
      {button}
    </View>
  ) : (
    button
  );
}
