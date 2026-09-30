import { Heart } from '@tamagui/lucide-icons-2';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, View } from 'tamagui';

export default function RemoveFavoriteButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('removeLocationFromFavorites', { defaultValue: '取消收藏巡礼点' })}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
    >
      <View
        width={36}
        height={36}
        rounded="$9"
        bg="$color2"
        items="center"
        justify="center"
        boxShadow="0 1px 3px $shadowColor"
      >
        <Heart size={18} color={theme.primary.val} fill={theme.primary.val} />
      </View>
    </Pressable>
  );
}
