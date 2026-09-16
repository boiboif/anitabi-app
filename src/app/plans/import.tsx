import { StrictButton as Button } from '@/components/strict-button';
import { decodeSharedPlan, resolveSharedPlan, type SharedPlan } from '@/lib/plan-sharing';
import { BLOCK_BUTTON_ICON_SIZE } from '@/lib/ui-sizes';
import { useMapData } from '@/store/use-map-data';
import { usePlanImport } from '@/store/use-plan-import';
import { usePlans } from '@/store/use-plans';
import { AlertCircle, Check, FileDown, MapPinned } from '@tamagui/lucide-icons-2';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView } from 'react-native';
import { Spinner, Text, XStack, YStack, useTheme } from 'tamagui';

function parseLinkData(data: string | undefined): { plan: SharedPlan | null; error: string | null } {
  if (!data) return { plan: null, error: null };
  try {
    return { plan: decodeSharedPlan(data), error: null };
  } catch (error) {
    return { plan: null, error: error instanceof Error ? error.message : '分享链接无效' };
  }
}

export default function ImportPlanScreen() {
  const { data: packed } = useLocalSearchParams<{ data?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const pending = usePlanImport((state) => state.pending);
  const source = usePlanImport((state) => state.source);
  const clearImport = usePlanImport((state) => state.clear);
  const mapData = useMapData((state) => state.data);
  const progress = useMapData((state) => state.progress);
  const importPlan = usePlans((state) => state.importPlan);
  const linkResult = useMemo(() => parseLinkData(packed), [packed]);
  const sharedPlan = linkResult.plan ?? pending;
  const resolved = useMemo(
    () => (sharedPlan && mapData ? resolveSharedPlan(sharedPlan, mapData) : null),
    [mapData, sharedPlan],
  );

  const close = () => {
    clearImport();
    router.replace('/plans' as never);
  };

  const confirmImport = () => {
    if (!sharedPlan || !resolved || resolved.points.length === 0) return;
    const id = importPlan(sharedPlan.t, resolved.points);
    clearImport();
    router.replace({ pathname: '/plans/[planId]', params: { planId: id } } as never);
  };

  const error = linkResult.error || (!sharedPlan ? '没有找到可导入的巡礼计划' : null);
  const sourceLabel = Boolean(packed) || source === 'link' ? '分享链接' : source === 'file' ? '计划文件' : '二维码';

  return (
    <>
      <Stack.Screen options={{ title: '导入巡礼计划', presentation: 'modal', headerBackVisible: false }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: theme.background?.val }}
        contentContainerStyle={{ padding: 20, paddingBottom: 36, gap: 18 }}
      >
        {error ? (
          <YStack minH={300} items="center" justify="center" gap="$3" p="$4">
            <AlertCircle size={38} color="$red10" />
            <Text fontSize="$subtitle" fontWeight="700" color="$color12" text="center">
              无法导入巡礼计划
            </Text>
            <Text fontSize="$footnote" lineHeight={19} color="$color11" text="center" selectable>
              {error}
            </Text>
            <Button mt="$3" bg="$color3" color="$color12" px="$7" onPress={close}>
              返回巡礼计划
            </Button>
          </YStack>
        ) : !mapData || !resolved ? (
          <YStack minH={300} items="center" justify="center" gap="$3">
            <Spinner size="large" color="$primary" />
            <Text color="$color11" fontSize="$footnote">
              {progress?.message || '正在匹配本地点位…'}
            </Text>
          </YStack>
        ) : (
          <YStack gap="$4">
            <YStack gap="$2">
              <Text fontSize="$caption" color="$color10">
                来自{sourceLabel}
              </Text>
              <Text fontSize="$heading" lineHeight={30} fontWeight="800" color="$color12" selectable>
                {sharedPlan?.t}
              </Text>
              <Text fontSize="$body" lineHeight={21} color="$color11">
                是否将这个巡礼计划保存为一份独立副本？导入后不会与分享者同步。
              </Text>
            </YStack>

            <YStack rounded="$4" bg="$color2" overflow="hidden">
              <XStack minH={62} px="$3" items="center" gap="$3">
                <YStack width={34} height={34} rounded="$9" bg="$color3" items="center" justify="center">
                  <MapPinned size={18} color="$primary" />
                </YStack>
                <YStack flex={1}>
                  <Text color="$color12" fontSize="$body" fontWeight="700">
                    {resolved.points.length} 个点位
                  </Text>
                  <Text color="$color10" fontSize="$footnote">
                    来自 {resolved.bangumiCount} 部作品
                  </Text>
                </YStack>
                <Check size={20} color="$green10" />
              </XStack>
              {resolved.missingCount > 0 ? (
                <XStack px="$3" py="$2.5" bg="$yellow2" gap="$2" items="center">
                  <AlertCircle size={16} color="$yellow10" />
                  <Text flex={1} color="$yellow11" fontSize="$footnote" lineHeight={17}>
                    另有 {resolved.missingCount} 个点位在当前数据中不存在，将被忽略。
                  </Text>
                </XStack>
              ) : null}
            </YStack>

            {resolved.points.length === 0 ? (
              <Text color="$red10" fontSize="$footnote" lineHeight={18} text="center">
                当前没有能够匹配的点位，无法创建计划。
              </Text>
            ) : null}

            <YStack gap="$2" pt="$2">
              <Button
                bg="$primary"
                color="white"
                icon={<FileDown size={BLOCK_BUTTON_ICON_SIZE} color="white" />}
                disabled={resolved.points.length === 0}
                opacity={resolved.points.length === 0 ? 0.5 : 1}
                onPress={confirmImport}
              >
                导入计划
              </Button>
              <Button bg="$color3" color="$color11" onPress={close}>
                取消
              </Button>
            </YStack>
          </YStack>
        )}
      </ScrollView>
    </>
  );
}
