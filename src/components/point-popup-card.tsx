import { formatDuration } from '@/lib/formatDuration';
import { baseUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { Image } from 'expo-image';
import { Linking } from 'react-native';
import { getTokens, Text, useTheme, View } from 'tamagui';

type Props = {
  point: Point;
  bangumi: Bangumi;
};

export default function PopupCard({ point, bangumi }: Props) {
  const theme = useTheme();
  const pointTitle = point.cn || point.name || '未命名点位';
  const animeTitle = bangumi.cn || bangumi.title || bangumi.en || '未知';
  const epLabel =
    typeof point.ep === 'number' && point.ep > 0
      ? `EP${point.ep}`
      : typeof point.ep === 'string' && point.ep
        ? point.ep
        : undefined;
  const timeLabel = typeof point.s === 'number' && point.s >= 0 ? formatDuration(point.s) : undefined;

  const innerRadius = getTokens().radius['2'].val;

  return (
    <View bg="$color2" rounded="$3" boxShadow="0 2px 8px rgba(0,0,0,0.4)" width={220}>
      {/* 图片 + EP / 时间覆盖层 */}
      <View
        style={{
          borderRadius: innerRadius,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {point.image ? (
          <Image
            source={{ uri: `${baseUrl}${point.image}?plan=h360` }}
            style={{
              width: 220,
              aspectRatio: 16 / 9,
              backgroundColor: theme.color9.val,
            }}
            contentFit="cover"
            contentPosition="center"
            transition={0}
          />
        ) : (
          <View
            style={{
              width: 220,
              aspectRatio: 16 / 9,
              position: 'relative',
            }}
          >
            <Image
              source={{ uri: `${baseUrl}${bangumi.cover}` }}
              style={{ height: '100%', width: '100%' }}
              contentFit="cover"
              contentPosition="center"
              transition={0}
            />
            <View position="absolute" l={0} r={0} t={0} b={0} bg="rgba(0,0,0,0.7)" justify="center" items="center">
              <Text fontSize={12} color="white">
                暂无截图
              </Text>
            </View>
          </View>
        )}
        {epLabel && (
          <View
            position="absolute"
            l={0}
            b={0}
            bg="rgba(0,0,0,0.55)"
            px="$1.5"
            py="$0.5"
            style={{ borderTopRightRadius: innerRadius }}
          >
            <Text fontSize={10} fontWeight="700" color="white">
              {epLabel}
            </Text>
          </View>
        )}
        {timeLabel && (
          <View
            position="absolute"
            r={0}
            b={0}
            bg="rgba(0,0,0,0.55)"
            px="$1.5"
            py="$0.5"
            style={{ borderTopLeftRadius: innerRadius }}
          >
            <Text fontSize={10} color="white">
              {timeLabel}
            </Text>
          </View>
        )}
      </View>

      {/* 文字内容 */}
      <View px="$2" py="$1.5">
        <Text fontWeight="600" fontSize={13} color="$color12" numberOfLines={1} mt="$1">
          {pointTitle}
        </Text>
        {point.mark ? (
          <Text fontSize={10} color="$color11" numberOfLines={3} mt="$0.5" mb="$1.5">
            {point.mark}
          </Text>
        ) : null}
        <Text fontSize={13} color="$primary" numberOfLines={2}>
          {animeTitle}
        </Text>
        {point.origin ? (
          <Text
            onPress={() => point.originLink && Linking.openURL(point.originLink)}
            fontSize={10}
            color={point.originLink ? '$blue9' : '$color11'}
            style={{ textAlign: 'right', textDecorationLine: 'underline' }}
            mt="$1.5"
          >
            @{point.origin}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
