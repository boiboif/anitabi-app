import { buildImageUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { MapPinned } from '@tamagui/lucide-icons-2';
import { Image } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import { Text, View, XStack, YStack } from 'tamagui';

export type PlanShareCardPoint = {
  bangumi: Bangumi;
  point: Point;
};

type Props = {
  title: string;
  points: PlanShareCardPoint[];
  totalCount: number;
  shareUrl?: string;
  displayOnly?: boolean;
  onImageLoadEnd?: () => void;
};

const VISIBLE_POINT_COUNT = 5;

function bangumiName(bangumi: Bangumi) {
  return bangumi.cn || bangumi.title || bangumi.en || '未知作品';
}

function pointName(point: Point) {
  return point.cn || point.name || '未命名点位';
}

export function PlanShareCard({ title, points, totalCount, shareUrl, displayOnly = false, onImageLoadEnd }: Props) {
  const bangumis = Array.from(new Map(points.map(({ bangumi }) => [bangumi.id, bangumi])).values());
  const workNames = bangumis.map(bangumiName);
  const visibleWorkNames = workNames.slice(0, 3);
  const remainingWorks = Math.max(0, workNames.length - visibleWorkNames.length);
  const imagePath = points.find(({ point }) => point.image)?.point.image || bangumis.find((item) => item.cover)?.cover;
  const imageUrl = imagePath ? buildImageUrl(imagePath, 'plan=h360') : undefined;

  return (
    <YStack width={360} height={480} bg="white" overflow="hidden" rounded={24}>
      <View height={200} bg="#FCE8EE" position="relative">
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            contentFit="cover"
            style={{ width: '100%', height: '100%' }}
            onLoadEnd={onImageLoadEnd}
          />
        ) : (
          <YStack flex={1} items="center" justify="center" bg="#FCE8EE" onLayout={onImageLoadEnd}>
            <MapPinned size={54} color="#FB7299" strokeWidth={1.6} />
          </YStack>
        )}
        <View position="absolute" l={0} r={0} b={0} height={72} bg="rgba(0,0,0,0.36)" />
        <YStack position="absolute" l={18} r={18} b={14} gap={4}>
          <Text color="white" fontSize={22} lineHeight={27} fontWeight="800" numberOfLines={2}>
            {title}
          </Text>
          <Text color="rgba(255,255,255,0.92)" fontSize={12} lineHeight={16} fontWeight="600">
            {totalCount} 个点位 · {bangumis.length} 部作品
          </Text>
        </YStack>
      </View>

      <YStack flex={1} p={18} gap={12}>
        <YStack gap={4}>
          <Text color="#9A5A6D" fontSize={10} lineHeight={14} fontWeight="700">
            作品
          </Text>
          <Text color="#292126" fontSize={13} lineHeight={18} fontWeight="600" numberOfLines={2}>
            {visibleWorkNames.length > 0 ? visibleWorkNames.join(' · ') : '当前版本暂无可显示作品'}
            {remainingWorks > 0 ? ` 等 ${workNames.length} 部` : ''}
          </Text>
        </YStack>

        <XStack flex={1} gap={14}>
          <YStack flex={1} minW={0} gap={7}>
            <Text color="#9A5A6D" fontSize={10} lineHeight={14} fontWeight="700">
              巡礼点
            </Text>
            {points.slice(0, VISIBLE_POINT_COUNT).map(({ bangumi, point }, index) => (
              <XStack key={`${bangumi.id}:${point.id}`} gap={7} items="flex-start">
                <View width={17} height={17} rounded={9} bg="#FCE8EE" items="center" justify="center">
                  <Text color="#D9537D" fontSize={9} lineHeight={12} fontWeight="800">
                    {index + 1}
                  </Text>
                </View>
                <Text flex={1} color="#4C4147" fontSize={11} lineHeight={16} numberOfLines={1}>
                  {pointName(point)}
                </Text>
              </XStack>
            ))}
            {totalCount > VISIBLE_POINT_COUNT ? (
              <Text color="#9A8D93" fontSize={10} lineHeight={14}>
                还有 {totalCount - VISIBLE_POINT_COUNT} 个点位
              </Text>
            ) : null}
          </YStack>

          {shareUrl && !displayOnly ? (
            <YStack width={144} items="center" justify="center" gap={7}>
              <View p={6} bg="white" borderWidth={1} borderColor="#F1DCE3" rounded={12}>
                <QRCode value={shareUrl} size={128} quietZone={0} ecl="M" backgroundColor="white" color="#211A1E" />
              </View>
              <Text color="#6C5E65" fontSize={9} lineHeight={12} text="center">
                扫码导入巡礼计划
              </Text>
            </YStack>
          ) : (
            <YStack width={144} items="center" justify="center" gap={7} p={12} rounded={16} bg="#FFF3F6">
              <MapPinned size={34} color="#FB7299" strokeWidth={1.8} />
              <Text color="#9A5A6D" fontSize={10} lineHeight={14} fontWeight="700" text="center">
                使用 Anitabi{`\n`}规划巡礼路线
              </Text>
            </YStack>
          )}
        </XStack>

        <XStack items="center" justify="space-between">
          <Text color="#FB7299" fontSize={12} lineHeight={16} fontWeight="800">
            Anitabi
          </Text>
          <Text color="#A79BA1" fontSize={9} lineHeight={12}>
            动漫圣地巡礼地图
          </Text>
        </XStack>
      </YStack>
    </YStack>
  );
}
