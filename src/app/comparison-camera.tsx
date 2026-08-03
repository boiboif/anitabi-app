import ComparisonCameraScreen from '@/components/comparison-camera/comparison-camera-screen';
import { buildImageUrl } from '@/services/handlers';
import { useMapData } from '@/store/use-map-data';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StatusBar } from 'react-native';
import { Text, View, XStack } from 'tamagui';

export default function ComparisonCameraRoute() {
  const router = useRouter();
  const { bangumiId, pointId } = useLocalSearchParams<{ bangumiId?: string; pointId?: string }>();
  const data = useMapData((state) => state.data);
  const bangumi = data?.data.bangumis.find((item) => item.id === Number(bangumiId));
  const point = bangumi?.points.find((item) => item.id === pointId);

  if (!bangumi || !point) {
    return (
      <View flex={1} bg="black" items="center" justify="center" gap="$3" p="$4">
        <StatusBar hidden />
        <Text color="white" fontSize={16} fontWeight="700">
          无法加载巡礼点
        </Text>
        <Text color="$gray10" fontSize={13} text="center">
          点位数据可能仍在加载，或该点位已经不可用。
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
        >
          <XStack mt="$4" px="$8" py="$2" rounded={999} bg="$primary" items="center">
            <Text color="white" fontWeight="700">
              返回
            </Text>
          </XStack>
        </Pressable>
      </View>
    );
  }

  return (
    <ComparisonCameraScreen
      bangumi={bangumi}
      point={point}
      initialReferenceUri={point.image ? buildImageUrl(point.image) : undefined}
    />
  );
}
