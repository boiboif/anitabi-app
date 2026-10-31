import FavoritePointButton from '@/components/point/favorite-point-button';
import PointCardActions from '@/components/point/point-card-actions';
import PointImage from '@/components/point/point-image';
import PointSequenceBadge from '@/components/point/point-sequence-badge';
import { formatDuration } from '@/lib/formatDuration';
import { getBangumiTitle, getPointTitle } from '@/lib/localized-data';
import type { Bangumi, Point } from '@/services/types';
import type { ImageSource } from 'expo-image';
import { useMemo, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, type AccessibilityState } from 'react-native';
import { getTokens, Text, useTheme, View, XStack, YStack } from 'tamagui';

export const POINT_LIST_CARD_HEIGHT = 110;

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
  /** 简介行数，默认为 2。 */
  descriptionNumberOfLines?: number;
  /** 自定义截图路径，未传入时使用巡礼点截图。 */
  image?: string;
  /** 无截图时展示的封面，可用于收藏或计划快照。 */
  cover?: string;
  /** 排序过程中禁用图片预览，默认启用。 */
  previewEnabled?: boolean;
  /** 已解析的图片源；排序浮层可与列表项复用同一个 source 和 cacheKey。 */
  imageSource?: string | (ImageSource & { uri: string });
  /** 虚拟列表回收标识；默认使用图片路径，变化时清除上一条目的图片内容。 */
  imageRecyclingKey?: string;
  /** 图片加载前或缺失时使用的背景色。 */
  imageColor?: string;
  /** 点击卡片主体时触发的回调。 */
  onPress?: () => void;
  /** 是否禁用卡片主体点击。 */
  disabled?: boolean;
  /** 整张卡片的透明度，默认为 1。 */
  opacity?: number;
  /** 可选阴影，默认不显示；拖拽预览等浮起状态由调用方传入。 */
  boxShadow?: ComponentProps<typeof View>['boxShadow'];
  /** 是否显示选中描边。 */
  selected?: boolean;
  /** 卡片主体的无障碍操作说明。 */
  accessibilityLabel?: string;
  /** 卡片主体的无障碍状态。 */
  accessibilityState?: AccessibilityState;
  /** 卡片最左侧的自定义内容，例如排序拖拽把手。 */
  leading?: ReactNode;
  /** 卡片最右侧的自定义内容，例如排序拖拽把手。 */
  trailing?: ReactNode;
  /** 卡片右上角的自定义操作，例如添加或删除按钮。 */
  topRightAction?: ReactNode;
  /** 是否将右上角自定义操作沿卡片高度垂直居中。 */
  topRightActionCentered?: boolean;
  /** 标题行右侧的状态操作，例如完成状态按钮。 */
  statusAction?: ReactNode;
  /** 是否在图片底部显示集数和时间标签。 */
  showMediaLabels?: boolean;
  /** 显示在图片左上角的计划序号。 */
  sequenceNumber?: number;
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
  /** 卡片及图片高度，默认为 POINT_LIST_CARD_HEIGHT，不含列表项留白。 */
  height?: number;
  /** 图片宽度，默认为 150。 */
  imageWidth?: number;
};

export default function PointListCard({
  point,
  bangumi,
  title,
  subtitle,
  showSubtitle = true,
  description,
  descriptionNumberOfLines = 2,
  meta,
  image,
  cover,
  previewEnabled = true,
  imageSource,
  imageRecyclingKey,
  imageColor,
  onPress,
  disabled = false,
  opacity = 1,
  boxShadow,
  selected = false,
  accessibilityLabel,
  accessibilityState,
  leading,
  trailing,
  topRightAction,
  topRightActionCentered = false,
  statusAction,
  showMediaLabels = false,
  sequenceNumber,
  showFavorite = false,
  showAddToPlan = false,
  showCamera = false,
  showNavigation = false,
  actionSize = 30,
  height = POINT_LIST_CARD_HEIGHT,
  imageWidth = 150,
}: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const resolvedTitle =
    (title ?? (point ? getPointTitle(point, i18n.resolvedLanguage) : '')) ||
    t('unnamedLocation', { defaultValue: '未命名点位' });
  const screenshotPath = image || point?.image;
  const coverPath = cover || bangumi?.cover;
  const imagePath = screenshotPath || coverPath;
  const imageStyle = useMemo(
    () => ({
      width: imageWidth,
      height,
      backgroundColor: imageColor || bangumi?.color || theme.color9.val,
      borderRadius: getTokens().radius['4'].val,
    }),
    [bangumi?.color, height, imageColor, imageWidth, theme.color9.val],
  );
  const resolvedSubtitle =
    (subtitle ?? (bangumi ? getBangumiTitle(bangumi, i18n.resolvedLanguage) : '')) ||
    t('unknown', { defaultValue: '未知' });
  const epLabel =
    typeof point?.ep === 'number' && point.ep > 0
      ? `EP${point.ep}`
      : typeof point?.ep === 'string' && point.ep
        ? point.ep
        : undefined;
  const timeLabel = typeof point?.s === 'number' && point.s >= 0 ? formatDuration(point.s) : undefined;

  return (
    <View bg="$background" rounded="$4" overflow="hidden" position="relative" opacity={opacity} boxShadow={boxShadow}>
      <XStack height={height}>
        {leading}
        <XStack flex={1} height={height} gap="$2">
          <PointImage
            image={screenshotPath}
            cover={coverPath}
            title={resolvedTitle}
            thumbnailSize="h160"
            thumbnailSource={imageSource}
            recyclingKey={imageRecyclingKey ?? imagePath}
            imageStyle={imageStyle}
            width={imageWidth}
            height={height}
            rounded="$4"
            previewBorderRadius={getTokens().radius['4'].val}
            previewEnabled={previewEnabled}
          >
            {typeof sequenceNumber === 'number' ? (
              <YStack fullscreen pointerEvents="none">
                <PointSequenceBadge sequenceNumber={sequenceNumber} />
              </YStack>
            ) : null}
            {showMediaLabels && epLabel ? (
              <View
                pointerEvents="none"
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
                pointerEvents="none"
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
          </PointImage>
          <Pressable
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={accessibilityLabel}
            accessibilityState={accessibilityState}
            disabled={disabled}
            onPress={onPress}
            style={{ flex: 1 }}
          >
            <YStack flex={1} px="$2" py="$1" pl="$0" pr={topRightAction ? 44 : '$2'} justify="space-between">
              <YStack>
                <XStack height={30} items="center" gap="$1">
                  <Text
                    flex={1}
                    fontSize="$body"
                    fontWeight="600"
                    color="$color12"
                    numberOfLines={1}
                    pr={showFavorite ? '$5' : undefined}
                  >
                    {resolvedTitle}
                  </Text>
                  {statusAction}
                  {showFavorite && point && bangumi ? (
                    <View position="absolute" t="$1.5" r="$0">
                      <FavoritePointButton point={point} bangumi={bangumi} buttonSize={28} size={16} />
                    </View>
                  ) : null}
                </XStack>
                {showSubtitle && resolvedSubtitle ? (
                  <Text fontSize="$footnote" color="$primary" mt="$0.5" numberOfLines={1}>
                    {resolvedSubtitle}
                  </Text>
                ) : null}
                {description ? (
                  <Text
                    fontSize="$caption"
                    lineHeight={12}
                    color="$color11"
                    mt="$0.5"
                    numberOfLines={descriptionNumberOfLines}
                  >
                    {description}
                  </Text>
                ) : null}
              </YStack>

              <XStack height={meta ? actionSize : undefined} items="center" gap="$1">
                <Text flex={1} fontSize="$caption" color="$color10" numberOfLines={1} pt="$1.5">
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
          </Pressable>
        </XStack>
        {trailing}
      </XStack>
      {topRightAction ? (
        <View position="absolute" t={topRightActionCentered ? (height - 30) / 2 : '$2'} r="$2">
          {topRightAction}
        </View>
      ) : null}
      {selected ? (
        <View
          pointerEvents="none"
          position="absolute"
          t={0}
          r={0}
          b={0}
          l={0}
          rounded="$4"
          borderWidth={2}
          borderColor="$primary"
          z={3}
        />
      ) : null}
    </View>
  );
}
