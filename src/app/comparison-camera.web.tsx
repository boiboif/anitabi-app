import { ArrowLeft } from '@tamagui/lucide-icons-2';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Text, View, XStack } from 'tamagui';

export default function ComparisonCameraWebRoute() {
  const router = useRouter();

  return (
    <View flex={1} bg="$background" items="center" justify="center" gap="$3" p="$4">
      <Text color="$color12" fontSize={18} fontWeight="700">
        对比图相机仅支持手机端
      </Text>
      <Text color="$color11" fontSize={13} text="center">
        请在 iOS 或 Android 应用中使用拍摄功能。
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
      >
        <XStack height={44} px="$3" rounded="$2" bg="$primary" items="center" gap="$2">
          <ArrowLeft size={18} color="white" />
          <Text color="white" fontWeight="700">
            返回
          </Text>
        </XStack>
      </Pressable>
    </View>
  );
}
