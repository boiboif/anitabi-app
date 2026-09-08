import FavoritePointButton from '@/components/favorite-point-button';
import PointCardActions from '@/components/point-card-actions';
import { formatDuration } from '@/lib/formatDuration';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { Image } from 'expo-image';
import { type ReactNode } from 'react';
import { Pressable, type AccessibilityState } from 'react-native';
import { getTokens, Text, useTheme, View, XStack, YStack } from 'tamagui';

const DEFAULT_CARD_HEIGHT = 110;

type Props = {
  /** 巡礼点数据，用于生成默认文案、图片和操作参数。 */
  point?: Point;
  /** 番剧数据，用于生成默认副标题、封面颜色和操作参数。 */
  bangumi?: Bangumi;
  /** 卡片标题，未传入时优先使用巡礼点中文名。 */
  title?: string;
  /** 番剧副标题，未传入时根据 bangumi 自动生成。 */
  subtitle?: string;
  /** 是否显示番剧副标题，默认为 true。 */
  showSubtitle?: boolean;
  /** 巡礼点简介，最多显示两行。 */
  description?: string;
  /** 卡片底部左侧的分组、收藏时间等辅助信息。 */
  meta?: string;
  /** 自定义图片路径，未传入时使用巡礼点图片或番剧封面。 */
  image?: string;
  /** 图片加载前或缺失时使用的背景色。 */
  imageColor?: string;
  /** 点击卡片主体时触发的回调。 */
  onPress?: () => void;
  /** 是否禁用卡片主体点击。 */
  disabled?: boolean;
  /** 整张卡片的透明度，默认为 1。 */
  opacity?: number;
  /** 卡片主体的无障碍操作说明。 */
  accessibilityLabel?: string;
  /** 卡片主体的无障碍状态。 */
  accessibilityState?: AccessibilityState;
  /** 卡片最左侧的自定义内容，例如排序拖拽把手。 */
  leading?: ReactNode;
  /** 卡片右上角的自定义操作，例如添加或删除按钮。 */
  topRightAction?: ReactNode;
  /** 是否将右上角自定义操作沿卡片高度垂直居中。 */
  topRightActionCentered?: boolean;
  /** 标题行右侧的状态操作，例如完成状态按钮。 */
  statusAction?: ReactNode;
  /** 是否在图片底部显示集数和时间标签。 */
  showMediaLabels?: boolean;
  /** 是否显示收藏按钮，需要同时传入 point 和 bangumi。 */
  showFavorite?: boolean;
  /** 是否显示加入巡礼计划按钮，需要同时传入 point 和 bangumi。 */
  showAddToPlan?: boolean;
  /** 是否显示拍照按钮，需要同时传入 point 和 bangumi。 */
  showCamera?: boolean;
  /** 是否显示导航按钮，需要同时传入 point 和 bangumi。 */
  showNavigation?: boolean;
  /** 底部操作按钮尺寸，默认为 30。 */
  actionSize?: number;
  /** 卡片及图片高度，默认为 116。 */
  height?: number;
};

export default function PointListCard({
  point,
  bangumi,
  title = point?.cn || point?.name || '未命名点位',
  subtitle,
  showSubtitle = true,
  description,
  meta,
  image,
  imageColor,
  onPress,
  disabled = false,
  opacity = 1,
  accessibilityLabel,
  accessibilityState,
  leading,
  topRightAction,
  topRightActionCentered = false,
  statusAction,
  showMediaLabels = false,
  showFavorite = false,
  showAddToPlan = false,
  showCamera = false,
  showNavigation = false,
  actionSize = 30,
  height = DEFAULT_CARD_HEIGHT,
}: Props) {
  const theme = useTheme();
  const imagePath = image ?? point?.image ?? bangumi?.cover;
  const resolvedSubtitle = subtitle ?? (bangumi?.cn || bangumi?.title || bangumi?.en || '未知');
  const epLabel =
    typeof point?.ep === 'number' && point.ep > 0
      ? `EP${point.ep}`
      : typeof point?.ep === 'string' && point.ep
        ? point.ep
        : undefined;
  const timeLabel = typeof point?.s === 'number' && point.s >= 0 ? formatDuration(point.s) : undefined;

  return (
    <View
      bg="$color2"
      rounded="$4"
      mb="$2"
      overflow="hidden"
      position="relative"
      boxShadow="0 1px 4px $shadowColor"
      opacity={opacity}
    >
      <XStack height={height}>
        {leading}
        <Pressable
          accessibilityRole={onPress ? 'button' : undefined}
          accessibilityLabel={accessibilityLabel}
          accessibilityState={accessibilityState}
          disabled={disabled}
          onPress={onPress}
          style={{ flex: 1 }}
        >
          <XStack height={height} gap="$2">
            <View width={150} height={height} overflow="hidden">
              <Image
                source={imagePath ? { uri: buildImageUrl(imagePath, 'plan=h160') } : undefined}
                style={{
                  width: 150,
                  height,
                  backgroundColor: imageColor || bangumi?.color || theme.color9.val,
                  borderRadius: getTokens().radius['4'].val,
                }}
                contentFit="cover"
              />
              {showMediaLabels && epLabel ? (
                <View
                  position="absolute"
                  l={0}
                  b={0}
                  bg="rgba(0,0,0,0.55)"
                  px="$1.5"
                  py="$0.5"
                  style={{ borderTopRightRadius: getTokens().radius['2'].val }}
                >
                  <Text fontSize="$caption" fontWeight="700" color="white">
                    {epLabel}
                  </Text>
                </View>
              ) : null}
              {showMediaLabels && timeLabel ? (
                <View
                  position="absolute"
                  r={0}
                  b={0}
                  bg="rgba(0,0,0,0.55)"
                  px="$1.5"
                  py="$0.5"
                  style={{ borderTopLeftRadius: getTokens().radius['2'].val }}
                >
                  <Text fontSize="$caption" color="white">
                    {timeLabel}
                  </Text>
                </View>
              ) : null}
            </View>

            <YStack flex={1} px="$2" py="$1" pl="$0" pr={topRightAction ? 44 : '$2'} justify="space-between">
              <YStack>
                <XStack height={30} items="center" gap="$1">
                  <Text flex={1} fontSize="$body" fontWeight="600" color="$color12" numberOfLines={1}>
                    {title}
                  </Text>
                  {statusAction}
                  {showFavorite && point && bangumi ? (
                    <FavoritePointButton point={point} bangumi={bangumi} buttonSize={30} />
                  ) : null}
                </XStack>
                {showSubtitle && resolvedSubtitle ? (
                  <Text fontSize="$footnote" color="$primary" mt="$0.5" numberOfLines={1}>
                    {resolvedSubtitle}
                  </Text>
                ) : null}
                {description ? (
                  <Text fontSize="$caption" lineHeight={12} color="$color11" mt="$0.5" numberOfLines={2}>
                    {description}
                  </Text>
                ) : null}
              </YStack>

              <XStack items="center" gap="$1">
                <Text flex={1} fontSize="$caption" color="$color10" numberOfLines={1}>
                  {meta || ' '}
                </Text>
                {point && bangumi && (showAddToPlan || showCamera || showNavigation) ? (
                  <PointCardActions
                    point={point}
                    bangumi={bangumi}
                    showAddToPlan={showAddToPlan}
                    showCamera={showCamera}
                    showNavigation={showNavigation}
                    size={actionSize}
                  />
                ) : null}
              </XStack>
            </YStack>
          </XStack>
        </Pressable>
      </XStack>
      {topRightAction ? (
        <View position="absolute" t={topRightActionCentered ? (height - 30) / 2 : '$2'} r="$2">
          {topRightAction}
        </View>
      ) : null}
    </View>
  );
}
