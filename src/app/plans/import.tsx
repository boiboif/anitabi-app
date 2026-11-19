import { StrictButton as Button } from '@/components/ui/strict-button';
import i18n from '@/i18n';
import { decodeSharedPlan, resolveSharedPlan, type SharedPlan } from '@/lib/plan-sharing';
import { BLOCK_BUTTON_ICON_SIZE } from '@/lib/ui-sizes';
import { useFavoritePoints } from '@/store/use-favorite-points';
import { useMapData } from '@/store/use-map-data';
import { usePlanImport } from '@/store/use-plan-import';
import { usePlans } from '@/store/use-plans';
import { PageHorizontalInset } from '@/tamagui.config';
import { AlertCircle, Check, FileDown, MapPinned, Square, SquareCheckBig } from '@/components/icons';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView } from 'react-native';
import { Spinner, Text, XStack, YStack, useTheme } from 'tamagui';

function parseLinkData(data: string | undefined): { plan: SharedPlan | null; error: string | null } {
  if (!data) return { plan: null, error: null };
  try {
    return { plan: decodeSharedPlan(data), error: null };
  } catch (error) {
    return {
      plan: null,
      error: error instanceof Error ? error.message : i18n.t('invalidShareLink', { defaultValue: '分享链接无效' }),
    };
  }
}

export default function ImportPlanScreen() {
  const { t } = useTranslation();
  const { data: packed } = useLocalSearchParams<{ data?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const theme = useTheme();
  const pending = usePlanImport((state) => state.pending);
  const source = usePlanImport((state) => state.source);
  const clearImport = usePlanImport((state) => state.clear);
  const mapData = useMapData((state) => state.data);
  const isPartial = useMapData((state) => state.isPartial);
  const progress = useMapData((state) => state.progress);
  const importPlan = usePlans((state) => state.importPlan);
  const addFavorites = useFavoritePoints((state) => state.addFavorites);
  const [alsoFavorite, setAlsoFavorite] = useState(true);
  const linkResult = useMemo(() => parseLinkData(packed), [packed]);
  const sharedPlan = linkResult.plan ?? pending;
  const resolved = useMemo(
    () => (sharedPlan && mapData && !isPartial ? resolveSharedPlan(sharedPlan, mapData) : null),
    [isPartial, mapData, sharedPlan],
  );

  useEffect(() => {
    if (!pending) return;
    const unsubscribe = navigation.addListener('removed', () => {
      // A later import may already own the shared store when this page is removed.
      if (usePlanImport.getState().pending === pending) clearImport();
    });
    // SDK 58 delivers removal after unmount cleanup, before the next microtask.
    return () => queueMicrotask(unsubscribe);
  }, [clearImport, navigation, pending]);

  const close = () => {
    clearImport();
    router.dismissTo('/plan');
  };

  const confirmImport = () => {
    if (useMapData.getState().isPartial || !sharedPlan || !resolved || resolved.points.length === 0) return;
    const id = importPlan(sharedPlan.t, resolved.points);
    if (alsoFavorite) addFavorites(resolved.points);
    clearImport();
    router.replace({ pathname: '/plans/[planId]', params: { planId: id } } as never);
  };

  const error =
    linkResult.error ||
    (!sharedPlan ? t('noPilgrimagePlanToImport', { defaultValue: '没有找到可导入的巡礼计划' }) : null);
  const sourceLabel =
    Boolean(packed) || source === 'link'
      ? t('shareLink', { defaultValue: '分享链接' })
      : source === 'file'
        ? t('planFile', { defaultValue: '计划文件' })
        : t('qrCode', { defaultValue: '二维码' });

  return (
    <>
      <Stack.Screen
        options={{
          title: t('importPilgrimagePlan', { defaultValue: '导入巡礼计划' }),
          presentation: 'modal',
          headerBackVisible: false,
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: theme.pageBackground?.val }}
        contentContainerStyle={{
          paddingHorizontal: PageHorizontalInset,
          paddingTop: 20,
          paddingBottom: 36,
          gap: 18,
        }}
      >
        {error ? (
          <YStack minH={300} items="center" justify="center" gap="13px" p="18px">
            <AlertCircle size={38} color="red-10" />
            <Text fontSize="subtitle" fontWeight="700" color="color-12" text="center">
              {t('couldNotImportPilgrimagePlan', { defaultValue: '无法导入巡礼计划' })}
            </Text>
            <Text fontSize="footnote" lineHeight="19px" color="color-11" text="center" select="text">
              {error}
            </Text>
            <Button mt="13px" bg="color-3" color="color-12" px="39px" onPress={close}>
              {t('backToPilgrimagePlans', { defaultValue: '返回巡礼计划' })}
            </Button>
          </YStack>
        ) : !mapData || !resolved ? (
          <YStack minH={300} items="center" justify="center" gap="13px">
            <Spinner size="large" color="primary" />
            <Text color="color-11" fontSize="footnote">
              {progress?.message || t('matchingLocalLocations', { defaultValue: '正在匹配本地点位…' })}
            </Text>
          </YStack>
        ) : (
          <YStack gap="18px">
            <YStack gap="7px">
              <Text fontSize="caption" color="color-10">
                {t('fromSource', { defaultValue: '来自{{source}}', source: sourceLabel })}
              </Text>
              <Text fontSize="heading" lineHeight="30px" fontWeight="800" color="color-12" select="text">
                {sharedPlan?.t}
              </Text>
              <Text fontSize="body" lineHeight="21px" color="color-11">
                {t('saveThisPilgrimagePlanAsAnIndependentCopyItWillNotStaySyncedWithTheSender', {
                  defaultValue: '是否将这个巡礼计划保存为一份独立副本？导入后不会与分享者同步。',
                })}
              </Text>
            </YStack>

            <YStack rounded={9} bg="background" overflow="hidden">
              <XStack minH={62} px="13px" items="center" gap="13px">
                <YStack w={34} h={34} rounded={26} bg="color-3" items="center" justify="center">
                  <MapPinned size={18} color="primary" />
                </YStack>
                <YStack flex={1}>
                  <Text color="color-12" fontSize="body" fontWeight="700">
                    {t('locationCount', { defaultValue: '{{count}} 个点位', count: resolved.points.length })}
                  </Text>
                  <Text color="color-10" fontSize="footnote">
                    {t('fromCountWorks', { defaultValue: '来自 {{count}} 部作品', count: resolved.bangumiCount })}
                  </Text>
                </YStack>
                <Check size={20} color="green-10" />
              </XStack>
              {resolved.missingCount > 0 ? (
                <XStack px="13px" py="2-5" bg="yellow-2" gap="7px" items="center">
                  <AlertCircle size={16} color="yellow-10" />
                  <Text flex={1} color="yellow-11" fontSize="footnote" lineHeight="17px">
                    {t('countMoreLocationsAreMissingFromCurrentDataAndWillBeIgnored', {
                      defaultValue: '另有 {{count}} 个点位在当前数据中不存在，将被忽略。',
                      count: resolved.missingCount,
                    })}
                  </Text>
                </XStack>
              ) : null}
            </YStack>

            {resolved.points.length === 0 ? (
              <Text color="red-10" fontSize="footnote" lineHeight="18px" text="center">
                {t('noLocationsCouldBeMatchedSoThePlanCannotBeCreated', {
                  defaultValue: '当前没有能够匹配的点位，无法创建计划。',
                })}
              </Text>
            ) : null}

            <YStack gap="7px" pt="7px">
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={t('favoriteImportedLocations', { defaultValue: '导入同时收藏' })}
                accessibilityState={{ checked: alsoFavorite }}
                onPress={() => setAlsoFavorite((current) => !current)}
                style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
              >
                <XStack minH={44} px="13px" items="center" justify="space-between" rounded={7} bg="background">
                  <Text fontSize="body" color="color-12">
                    {t('favoriteImportedLocations', { defaultValue: '导入同时收藏' })}
                  </Text>
                  {alsoFavorite ? (
                    <SquareCheckBig size={23} strokeWidth={2.5} color="primary" />
                  ) : (
                    <Square size={23} color="color-8" />
                  )}
                </XStack>
              </Pressable>
              <Button
                bg="primary"
                color="white"
                icon={<FileDown size={BLOCK_BUTTON_ICON_SIZE} color="white" />}
                disabled={resolved.points.length === 0}
                opacity={resolved.points.length === 0 ? 0.5 : 1}
                onPress={confirmImport}
              >
                {t('importPlan', { defaultValue: '导入计划' })}
              </Button>
              <Button bg="color-3" color="color-11" onPress={close}>
                {t('cancel', { defaultValue: '取消' })}
              </Button>
            </YStack>
          </YStack>
        )}
      </ScrollView>
    </>
  );
}
