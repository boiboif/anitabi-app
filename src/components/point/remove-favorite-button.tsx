import { Heart } from '@/components/icons';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'tamagui';

export default function RemoveFavoriteButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('removeLocationFromFavorites', { defaultValue: '取消收藏巡礼点' })}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
    >
      <View w={36} h={36} rounded={26} bg="color-2" items="center" justify="center">
        <Heart size={18} color="primary" fill="primary" />
      </View>
    </Pressable>
  );
}
