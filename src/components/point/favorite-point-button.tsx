import type { Bangumi, Point } from '@/services/types';
import { getFavoritePointKey, useFavoritePoints } from '@/store/use-favorite-points';
import { Heart } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { View } from 'tamagui';

type Props = {
  point: Point;
  bangumi: Bangumi;
  size?: number;
  buttonSize?: number;
  overlay?: boolean;
};

export default function FavoritePointButton({ point, bangumi, size = 20, buttonSize = 30, overlay = false }: Props) {
  const { t } = useTranslation();
  const key = getFavoritePointKey(bangumi.id, point.id);
  const isFavorite = useFavoritePoints((state) => state.favoriteKeys.has(key));
  const toggleFavorite = useFavoritePoints((state) => state.toggleFavorite);
  const iconColor = isFavorite ? 'primary' : 'color-11';

  const button = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        isFavorite
          ? t('removeLocationFromFavorites', { defaultValue: '取消收藏巡礼点' })
          : t('favoriteLocation', { defaultValue: '收藏巡礼点' })
      }
      hitSlop={8}
      onPress={(event) => {
        event.stopPropagation();
        toggleFavorite(point, bangumi);
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
    >
      <View w={buttonSize} h={buttonSize} rounded={26} bg="color-2" items="center" justify="center">
        <Heart size={size} color={iconColor} fill={isFavorite ? iconColor : 'transparent'} />
      </View>
    </Pressable>
  );

  return overlay ? (
    <View position="absolute" t="7px" r="7px">
      {button}
    </View>
  ) : (
    button
  );
}
