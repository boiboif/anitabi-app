import PreviewableImage from '@/components/image-preview/previewable-image';
import { getCategoryMessage, translateMessage } from '@/i18n/messages';
import { getBangumiTitle } from '@/lib/localized-data';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi } from '@/services/types';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { getTokens, Text, useTheme, View } from 'tamagui';

export default function BangumiListCard({ bangumi, onPress }: { bangumi: Bangumi; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const categoryMessage = getCategoryMessage(bangumi.cat);
  const localizedTitle =
    getBangumiTitle(bangumi, i18n.resolvedLanguage) || t('unknownWork', { defaultValue: '未知作品' });
  const originalTitle = bangumi.title && bangumi.title !== localizedTitle ? bangumi.title : null;
  const coverUri = buildImageUrl(bangumi.cover ?? '');
  const thumbnailUri = buildImageUrl(bangumi.cover ?? '', 'plan=h160');
  return (
    <View bg="$background" p="$2" display="flex" flexDirection="row" rounded="$4" gap="$2.5">
      <PreviewableImage
        recyclingKey={String(bangumi.id)}
        source={{ uri: thumbnailUri }}
        previewUri={coverUri || undefined}
        previewBorderRadius={getTokens().radius['4'].val}
        accessibilityLabel={t('previewWorkCover', { title: localizedTitle })}
        style={{
          width: 100,
          height: 100,
          borderRadius: getTokens().radius['4'].val,
          backgroundColor: bangumi.color || theme.color9.val,
        }}
        contentFit="cover"
      />
      <Pressable accessibilityRole="button" accessibilityLabel={localizedTitle} onPress={onPress} style={{ flex: 1 }}>
        <View flex={1}>
          {localizedTitle ? (
            <Text fontWeight="600" fontSize="$subtitle" color="$color12" pr="$8" numberOfLines={2}>
              {localizedTitle}
            </Text>
          ) : null}
          {originalTitle ? (
            <Text fontSize="$footnote" color="$color11" mt="$1" mb="$1" numberOfLines={1}>
              {originalTitle}
            </Text>
          ) : null}
          <View flexDirection="row">
            {bangumi.city && (
              <Text fontSize="$footnote" color="$color11">
                {bangumi.city} {'· '}
              </Text>
            )}
            <Text fontSize="$footnote" color="$color11">
              <Text color="$primary" fontWeight="bold">
                {bangumi.points.length}
              </Text>
              {t('locationSuffix', { defaultValue: '个巡礼点' })}
            </Text>
          </View>
          <Text fontSize="$caption" color="$color11" position="absolute" r="$0" b="$0">
            {t('updatedDate', {
              defaultValue: '最近更新：{{date}}',
              date: dayjs(bangumi.modified).format('YYYY-MM-DD HH:mm'),
            })}
          </Text>
        </View>
        {bangumi.cat?.trim() ? (
          <View
            position="absolute"
            t={0}
            r={0}
            pointerEvents="none"
            px="$2"
            py="$1"
            rounded="$2"
            style={{ backgroundColor: bangumi.color || theme.color9.val }}
          >
            <Text fontSize="$caption" color="white" fontWeight="500">
              {categoryMessage ? translateMessage(t, categoryMessage) : bangumi.cat}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
