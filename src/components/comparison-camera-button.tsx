import type { Bangumi, Point } from '@/services/types';
import { Camera } from '@tamagui/lucide-icons-2';
import { type Href, useRouter } from 'expo-router';
import type { GestureResponderEvent } from 'react-native';
import { Pressable } from 'react-native';
import { Text, useTheme, View, XStack } from 'tamagui';

type Props = {
  bangumi: Bangumi;
  point: Point;
  compact?: boolean;
};

export default function ComparisonCameraButton({ bangumi, point, compact = false }: Props) {
  const router = useRouter();
  const theme = useTheme();

  const openCamera = (event: GestureResponderEvent) => {
    event.stopPropagation();
    router.push({
      pathname: '/comparison-camera',
      params: { bangumiId: String(bangumi.id), pointId: point.id },
    } as Href);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="打开对比图相机"
      hitSlop={compact ? 8 : 4}
      onPress={openCamera}
      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
    >
      {compact ? (
        <View width={36} height={36} rounded="$9" bg="$color2" items="center" justify="center">
          <Camera size={18} color={theme.primary.val} />
        </View>
      ) : (
        <XStack height={38} rounded="$2" bg="$primary" items="center" justify="center" gap="$1.5" px="$3">
          <Camera size={17} color="white" />
          <Text color="white" fontSize={13} fontWeight="700">
            对比拍摄
          </Text>
        </XStack>
      )}
    </Pressable>
  );
}
