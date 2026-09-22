import type { ItineraryPlan } from '@/lib/plan-storage';
import { buildImageUrl } from '@/services/handlers';
import { CalendarDays, MoreHorizontal } from '@tamagui/lucide-icons-2';
import { Image } from 'expo-image';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

const CARD_HEIGHT = 90;
const IMAGE_WIDTH = 120;

type Props = {
  plan: ItineraryPlan;
  onPress: (planId: string) => void;
  onMorePress: (planId: string) => void;
};

export default memo(function PlanListCard({ plan, onPress, onMorePress }: Props) {
  const { t } = useTranslation();
  const firstItem = plan.items[0];
  const imagePath = firstItem?.snapshot.pointImage;
  const imageUrl = useMemo(() => (imagePath ? buildImageUrl(imagePath, 'plan=h160') : undefined), [imagePath]);
  const completed = plan.items.filter((item) => item.completed).length;

  return (
    <View bg="$color2" rounded="$4" overflow="hidden" boxShadow="0 1px 4px $shadowColor">
      <Pressable accessibilityRole="button" accessibilityLabel={plan.title} onPress={() => onPress(plan.id)}>
        <XStack height={CARD_HEIGHT} gap="$2">
          <View
            width={IMAGE_WIDTH}
            height={CARD_HEIGHT}
            shrink={0}
            overflow="hidden"
            items="center"
            justify="center"
            bg="$color4"
            rounded="$4"
            style={firstItem?.snapshot.bangumiColor ? { backgroundColor: firstItem.snapshot.bangumiColor } : undefined}
          >
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl, cacheKey: imageUrl }}
                recyclingKey={`${plan.id}:${imagePath}`}
                style={{ width: IMAGE_WIDTH, height: CARD_HEIGHT }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={120}
                alt={plan.title}
              />
            ) : (
              <CalendarDays size={28} color="$color9" />
            )}
          </View>

          <YStack flex={1} minW={0} pr="$2" py="$1.5" justify="space-between">
            <YStack gap="$1" minW={0}>
              <Text minW={0} fontSize="$body" fontWeight="600" color="$color12" numberOfLines={1}>
                {plan.title}
              </Text>
              {plan.description ? (
                <Text fontSize="$caption" lineHeight={17} color="$color11" numberOfLines={2}>
                  {plan.description}
                </Text>
              ) : null}
            </YStack>

            <XStack items="center" gap="$1">
              <Text flex={1} fontSize="$caption" color="$color10" numberOfLines={1}>
                {t('completedLocationCount', {
                  defaultValue: '{{completed}} / {{count}} 个点位',
                  completed,
                  count: plan.items.length,
                })}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('moreActions', { defaultValue: '更多操作' })}：${plan.title}`}
                hitSlop={8}
                onPress={(event) => {
                  event.stopPropagation();
                  onMorePress(plan.id);
                }}
                style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
              >
                <MoreHorizontal size={20} color="$color11" />
              </Pressable>
            </XStack>
          </YStack>
        </XStack>
      </Pressable>
    </View>
  );
});
