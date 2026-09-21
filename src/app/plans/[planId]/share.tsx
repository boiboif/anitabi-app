import { PlanShareCard, type PlanShareCardPoint } from '@/components/plan-share-card';
import { StrictButton as Button } from '@/components/strict-button';
import { sharePlanFile, sharePlanImage } from '@/lib/plan-share-files';
import { createPlanShareBundle } from '@/lib/plan-sharing';
import { BLOCK_BUTTON_ICON_SIZE } from '@/lib/ui-sizes';
import { useMapData } from '@/store/use-map-data';
import { usePlans } from '@/store/use-plans';
import { Toast } from '@boiboif/react-native-toast';
import { FileJson, Share2 } from '@tamagui/lucide-icons-2';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { View as NativeView, Platform, ScrollView, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { captureRef } from 'react-native-view-shot';
import { Spinner, Text, View, YStack, useTheme } from 'tamagui';

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function PlanShareScreen() {
  const { t } = useTranslation();
  const { planId, displayOnly } = useLocalSearchParams<{ planId: string; displayOnly?: string }>();
  const plan = usePlans((state) => state.plans.find((item) => item.id === planId));
  const data = useMapData((state) => state.data);
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const cardRef = useRef<NativeView>(null);
  const [imageReady, setImageReady] = useState(false);
  const [sharing, setSharing] = useState<'image' | 'file' | null>(null);
  const showDisplayOnly = displayOnly === '1';

  const bundle = useMemo(() => (plan ? createPlanShareBundle(plan) : null), [plan]);
  const points = useMemo<PlanShareCardPoint[]>(() => {
    if (!plan || !data) return [];
    const bangumis = new Map(data.data.bangumis.map((bangumi) => [bangumi.id, bangumi]));
    return plan.items.flatMap((item) => {
      const bangumi = bangumis.get(item.bangumiId);
      const point = bangumi?.points.find((entry) => entry.id === item.pointId);
      return bangumi && point ? [{ bangumi, point }] : [];
    });
  }, [data, plan]);
  const hasRemoteImage =
    points.some(({ point }) => Boolean(point.image)) || points.some(({ bangumi }) => Boolean(bangumi.cover));
  const cardIsReady = Boolean(data) && (!hasRemoteImage || imageReady);
  const scale = Math.min(1, Math.max(0.74, (width - 24) / 360));

  const shareImage = async () => {
    if (!plan || !cardRef.current || !cardIsReady || sharing) return;
    if (Platform.OS === 'web') {
      Toast.show(t('sharingLocalImagesIsNotSupportedOnTheWebYet', { defaultValue: '网页版暂不支持分享本地图片' }));
      return;
    }
    setSharing('image');
    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        width: 1080,
        height: 1440,
        result: 'tmpfile',
      });
      await sharePlanImage(uri, plan.title);
    } catch (error) {
      Toast.show(messageFrom(error, t('sharingFailedPleaseTryAgainLater', { defaultValue: '分享失败，请稍后重试' })));
    } finally {
      setSharing(null);
    }
  };

  const shareFile = async () => {
    if (!plan || sharing) return;
    if (Platform.OS === 'web') {
      Toast.show(t('sharingPlanFilesIsNotSupportedOnTheWebYet', { defaultValue: '网页版暂不支持分享计划文件' }));
      return;
    }
    setSharing('file');
    try {
      await sharePlanFile(plan);
    } catch (error) {
      Toast.show(messageFrom(error, t('sharingFailedPleaseTryAgainLater', { defaultValue: '分享失败，请稍后重试' })));
    } finally {
      setSharing(null);
    }
  };

  if (!plan || !bundle) {
    return (
      <YStack flex={1} items="center" justify="center" bg="$background">
        <Text color="$color11">
          {t('thePlanDoesNotExistOrHasBeenDeleted', { defaultValue: '计划不存在或已被删除' })}
        </Text>
      </YStack>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('sharePilgrimagePlan', { defaultValue: '分享巡礼计划' }) }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: theme.background?.val }}
        contentContainerStyle={{ alignItems: 'center', padding: 12, paddingBottom: 32, gap: 16 }}
      >
        <View
          width={360 * scale}
          height={480 * scale}
          rounded={24 * scale}
          boxShadow="0 3px 14px rgba(75, 43, 55, 0.10)"
        >
          <NativeView style={{ width: 360, height: 480, transform: [{ scale }], transformOrigin: 'top left' }}>
            <NativeView ref={cardRef} collapsable={false}>
              <PlanShareCard
                title={plan.title}
                points={points}
                totalCount={plan.items.length}
                shareUrl={showDisplayOnly ? undefined : bundle.url}
                displayOnly={showDisplayOnly}
                onImageLoadEnd={() => setImageReady(true)}
              />
            </NativeView>
          </NativeView>
        </View>

        {showDisplayOnly ? (
          <YStack width="100%" maxW={520} p="$3" rounded="$4" bg="$color2" gap="$1">
            <Text color="$color12" fontSize="$body" fontWeight="700">
              {t('thisImageIsForDisplayOnly', { defaultValue: '这张图片仅供展示' })}
            </Text>
            <Text color="$color11" fontSize="$footnote" lineHeight={18}>
              {t('thisPlanIsTooLargeToIncludeAnImportableQrCodeShareThePlanFileIfTheRecipientNeedsToImportIt', {
                defaultValue: '计划内容较多，图片中不包含可导入二维码。如需让对方导入，请分享计划文件。',
              })}
            </Text>
          </YStack>
        ) : null}

        <YStack width="100%" maxW={520} gap="$2">
          <Button
            bg="$primary"
            color="white"
            icon={
              sharing === 'image' ? <Spinner color="white" /> : <Share2 size={BLOCK_BUTTON_ICON_SIZE} color="white" />
            }
            disabled={!cardIsReady || sharing !== null}
            accessibilityState={{ disabled: !cardIsReady || sharing !== null }}
            opacity={!cardIsReady || sharing !== null ? 0.55 : 1}
            onPress={() => void shareImage()}
          >
            {cardIsReady
              ? t('shareImage', { defaultValue: '分享图片' })
              : t('loadingImage', { defaultValue: '正在加载图片…' })}
          </Button>
          <Button
            bg="$color3"
            color="$color12"
            icon={sharing === 'file' ? <Spinner color="$color11" /> : <FileJson size={BLOCK_BUTTON_ICON_SIZE} />}
            disabled={sharing !== null}
            accessibilityState={{ disabled: sharing !== null }}
            opacity={sharing !== null ? 0.55 : 1}
            onPress={() => void shareFile()}
          >
            {t('sharePlanFile', { defaultValue: '分享计划文件' })}
          </Button>
        </YStack>
      </ScrollView>
    </>
  );
}
