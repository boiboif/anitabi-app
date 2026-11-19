import { Camera } from '@/components/icons';
import type { Bangumi, Point } from '@/services/types';
import { type Href, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { GestureResponderEvent } from 'react-native';
import { Pressable } from 'react-native';
import { Text, useTheme, View, XStack } from 'tamagui';

type Props = {
  bangumi: Bangumi;
  point: Point;
  initialReferenceUri?: string;
  compact?: boolean;
  compactSize?: number;
  bare?: boolean;
};

export default function ComparisonCameraButton({
  bangumi,
  point,
  initialReferenceUri,
  compact = false,
  compactSize = 36,
  bare = false,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();

  const openCamera = (event: GestureResponderEvent) => {
    event.stopPropagation();
    router.navigate({
      pathname: '/comparison-camera',
      params: { bangumiId: String(bangumi.id), pointId: point.id, initialReferenceUri },
    } as Href);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('openComparisonCamera', { defaultValue: '打开对比图相机' })}
      hitSlop={compact ? 8 : 4}
      onPress={openCamera}
      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
    >
      {compact ? (
        <View w={compactSize} h={compactSize} rounded={26} items="center" justify="center">
          <Camera size={compactSize * (bare ? 0.58 : 0.5)} color={theme.primary.val} />
        </View>
      ) : (
        <XStack h={38} rounded={5} bg="primary" items="center" justify="center" gap="1" px="13px">
          <Camera size={17} color="white" />
          <Text color="white" fontSize="footnote" fontWeight="700">
            {t('compareShot', { defaultValue: '对比拍摄' })}
          </Text>
        </XStack>
      )}
    </Pressable>
  );
}
