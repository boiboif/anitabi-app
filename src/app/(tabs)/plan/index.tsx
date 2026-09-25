import { ActionSheet, type ActionSheetRef } from '@/components/action-sheet';
import PlanListCard from '@/components/plan-list-card';
import PlanSortButton from '@/components/plan-sort-button';
import { StrictButton as Button } from '@/components/strict-button';
import { usePlanImportActions } from '@/hooks/use-plan-import-actions';
import { sharePlanFile } from '@/lib/plan-share-files';
import { createPlanShareBundle } from '@/lib/plan-sharing';
import type { ItineraryPlan } from '@/lib/plan-storage';
import { BLOCK_BUTTON_ICON_SIZE, ICON_BUTTON_ICON_SIZE } from '@/lib/ui-sizes';
import { usePlans } from '@/store/use-plans';
import { BottomTabInset, TopLevelPageTopPadding } from '@/tamagui.config';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import {
  FileDown,
  FileJson,
  Image as ImageIcon,
  Pencil,
  Plus,
  ScanLine,
  Share2,
  Trash2,
} from '@tamagui/lucide-icons-2';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack, useTheme } from 'tamagui';

const emptyListStyle = { flex: 1 } as const;

function planKeyExtractor(plan: ItineraryPlan) {
  return plan.id;
}

function PlanSeparator() {
  return <View height={12} />;
}

type EmptyPlansProps = {
  onCreate: () => void;
};

type PlanHeaderActionsProps = {
  onImport: () => void;
  onCreate: () => void;
};

const PlanHeaderActions = memo(function PlanHeaderActions({ onImport, onCreate }: PlanHeaderActionsProps) {
  const { t } = useTranslation();
  const sortOrder = usePlans((state) => state.planListSortOrder);
  const toggleSortOrder = usePlans((state) => state.togglePlanListSortOrder);

  return (
    <XStack items="center" gap="$1.5">
      <PlanSortButton sortOrder={sortOrder} onPress={toggleSortOrder} />
      <Button
        chromeless
        circular
        size="$3"
        icon={<ScanLine size={ICON_BUTTON_ICON_SIZE} strokeWidth={2} />}
        aria-label={t('importPilgrimagePlan', { defaultValue: '导入巡礼计划' })}
        onPress={onImport}
      />
      <Button
        chromeless
        circular
        size="$3"
        icon={<Plus size={ICON_BUTTON_ICON_SIZE} strokeWidth={2} />}
        aria-label={t('newPlan', { defaultValue: '新建计划' })}
        onPress={onCreate}
      />
    </XStack>
  );
});

const PlanListHeader = memo(function PlanListHeader({ onImport, onCreate }: PlanHeaderActionsProps) {
  const { t } = useTranslation();

  return (
    <XStack minH={36} items="flex-start" justify="space-between" mb="$3">
      <Text fontSize="$heading" lineHeight={30} fontWeight="700" color="$color12" px="$1">
        {t('pilgrimagePlans', { defaultValue: '巡礼计划' })}
      </Text>
      <PlanHeaderActions onImport={onImport} onCreate={onCreate} />
    </XStack>
  );
});

const EmptyPlans = memo(function EmptyPlans({ onCreate }: EmptyPlansProps) {
  const { t } = useTranslation();
  return (
    <YStack flex={1} minH={360} items="center" justify="center" gap="$3">
      <Text fontSize="$subtitle" fontWeight="600" color="$color12">
        {t('noPilgrimagePlansYet', { defaultValue: '还没有巡礼计划' })}
      </Text>
      <Button bg="$color3" color="$color12" icon={<Plus size={BLOCK_BUTTON_ICON_SIZE} />} onPress={onCreate}>
        {t('createAPilgrimagePlan', { defaultValue: '创建巡礼计划' })}
      </Button>
    </YStack>
  );
});

export default function PlansScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const plans = usePlans((state) => state.plans);
  const deletePlan = usePlans((state) => state.deletePlan);
  const sortOrder = usePlans((state) => state.planListSortOrder);
  const importSheetRef = useRef<ActionSheetRef>(null);
  const menuSheetRef = useRef<ActionSheetRef>(null);
  const overflowSheetRef = useRef<ActionSheetRef>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const { scanQrCode, importFromFile } = usePlanImportActions();
  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === selectedPlanId), [plans, selectedPlanId]);
  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => (sortOrder === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt)),
    [plans, sortOrder],
  );
  const openCreatePlan = useCallback(() => router.navigate('/plans/create' as never), [router]);
  const openImportSheet = useCallback(() => importSheetRef.current?.present(), []);
  const openPlan = useCallback(
    (planId: string) => router.navigate({ pathname: '/plans/[planId]', params: { planId } } as never),
    [router],
  );
  const openPlanMenu = useCallback((planId: string) => {
    setSelectedPlanId(planId);
    setTimeout(() => void menuSheetRef.current?.present(), 0);
  }, []);
  const renderPlan = useCallback<ListRenderItem<ItineraryPlan>>(
    ({ item }) => <PlanListCard plan={item} onPress={openPlan} onMorePress={openPlanMenu} />,
    [openPlan, openPlanMenu],
  );
  const renderEmptyPlans = useCallback(() => <EmptyPlans onCreate={openCreatePlan} />, [openCreatePlan]);
  const pagePaddingTop = useMemo(
    () => Platform.select({
      android: insets.top + TopLevelPageTopPadding,
      ios: TopLevelPageTopPadding,
      web: TopLevelPageTopPadding,
      default: TopLevelPageTopPadding,
    }),
    [insets.top],
  );
  const contentContainerStyle = useMemo(
    () => ({
      paddingHorizontal: 16,
      paddingBottom: insets.bottom + BottomTabInset + 24,
    }),
    [insets.bottom],
  );
  const contentInset = useMemo(
    () => ({ top: 0, right: insets.right, bottom: 0, left: insets.left }),
    [insets.left, insets.right],
  );
  const listStyle = useMemo(() => ({ flex: 1, backgroundColor: theme.background?.val }), [theme.background?.val]);

  const shareSelectedPlan = useCallback(() => {
    if (!selectedPlan) return;
    if (selectedPlan.items.length === 0) {
      Alert.alert(
        t('unableToShare', { defaultValue: '暂时无法分享' }),
        t('addLocationsToThePlanBeforeSharingIt', { defaultValue: '计划中还没有点位，添加点位后再分享吧。' }),
      );
      return;
    }

    const bundle = createPlanShareBundle(selectedPlan);
    if (bundle.qrEligible) {
      router.navigate({ pathname: '/plans/[planId]/share', params: { planId: selectedPlan.id } } as never);
      return;
    }
    void overflowSheetRef.current?.present();
  }, [router, selectedPlan, t]);

  const shareLargePlanFile = useCallback(() => {
    if (!selectedPlan) return;
    setTimeout(() => {
      void sharePlanFile(selectedPlan).catch((error) => {
        Alert.alert(
          t('couldNotSharePlanFile', { defaultValue: '无法分享计划文件' }),
          error instanceof Error ? error.message : t('pleaseTryAgainLater', { defaultValue: '请稍后重试' }),
        );
      });
    }, 220);
  }, [selectedPlan, t]);

  const openDisplayOnlyShare = useCallback(() => {
    if (!selectedPlan) return;
    setTimeout(() => {
      router.navigate({
        pathname: '/plans/[planId]/share',
        params: { planId: selectedPlan.id, displayOnly: '1' },
      } as never);
    }, 180);
  }, [router, selectedPlan]);

  const editSelectedPlan = useCallback(() => {
    if (!selectedPlan) return;
    router.navigate({ pathname: '/plans/[planId]/edit', params: { planId: selectedPlan.id } } as never);
  }, [router, selectedPlan]);

  const confirmDeleteSelectedPlan = useCallback(() => {
    if (!selectedPlan) return;
    Alert.alert(
      t('deletePilgrimagePlan', { defaultValue: '删除巡礼计划' }),
      t('confirmDeleteTitle', { defaultValue: '确定删除“{{title}}”吗？', title: selectedPlan.title }),
      [
        { text: t('cancel', { defaultValue: '取消' }), style: 'cancel' },
        {
          text: t('delete', { defaultValue: '删除' }),
          style: 'destructive',
          onPress: () => {
            deletePlan(selectedPlan.id);
            setSelectedPlanId(null);
          },
        },
      ],
    );
  }, [deletePlan, selectedPlan, t]);

  return (
    <>
      <YStack flex={1} bg="$background" pt={pagePaddingTop}>
        <View mx="$4">
          <PlanListHeader onImport={openImportSheet} onCreate={openCreatePlan} />
        </View>
        <FlashList
          data={sortedPlans}
          maintainVisibleContentPosition={{ disabled: true }}
          keyExtractor={planKeyExtractor}
          renderItem={renderPlan}
          ItemSeparatorComponent={PlanSeparator}
          ListEmptyComponent={renderEmptyPlans}
          ListEmptyComponentStyle={emptyListStyle}
          contentInset={contentInset}
          contentInsetAdjustmentBehavior="never"
          style={listStyle}
          contentContainerStyle={contentContainerStyle}
        />
      </YStack>
      <ActionSheet
        ref={importSheetRef}
        title={t('importPilgrimagePlan', { defaultValue: '导入巡礼计划' })}
        description={t('scanTheQrCodeInASharedImageOrSelectAPlanFileSentToYou', {
          defaultValue: '扫描分享图片中的二维码，或选择别人发送给你的计划文件。',
        })}
        primaryAction={{
          label: t('scanQrCode', { defaultValue: '扫描二维码' }),
          icon: ScanLine,
          onPress: () => setTimeout(() => void scanQrCode(), 180),
        }}
        sections={[
          {
            actions: [
              {
                label: t('importFromFile', { defaultValue: '从文件导入' }),
                icon: FileDown,
                onPress: () => setTimeout(() => void importFromFile(), 180),
              },
            ],
          },
        ]}
      />
      <ActionSheet
        ref={menuSheetRef}
        title={selectedPlan?.title}
        primaryAction={{
          label: t('sharePlan', { defaultValue: '分享计划' }),
          icon: Share2,
          disabled: !selectedPlan,
          onPress: () => setTimeout(shareSelectedPlan, 180),
        }}
        sections={[
          {
            actions: [
              {
                label: t('editPlanDetails', { defaultValue: '编辑计划信息' }),
                icon: Pencil,
                disabled: !selectedPlan,
                onPress: editSelectedPlan,
              },
              {
                label: t('deletePlan', { defaultValue: '删除计划' }),
                icon: Trash2,
                destructive: true,
                disabled: !selectedPlan,
                onPress: () => setTimeout(confirmDeleteSelectedPlan, 180),
              },
            ],
          },
        ]}
      />
      <ActionSheet
        ref={overflowSheetRef}
        title={t('largePlan', { defaultValue: '计划内容较多' })}
        description={t(
          'thisPlanHasCountLocationsItsQrCodeWouldBeTooDenseAndMayStopScanningAfterChatAppCompressionShareThePlanFileInsteadItOnlyContainsThePlanNameAndLocationIds',
          {
            defaultValue:
              '当前计划包含 {{count}} 个点位，生成的二维码会过于密集，经过聊天软件压缩后可能无法正常扫描。建议分享计划文件；文件仅包含计划名称和点位编号。',
            count: selectedPlan?.items.length ?? 0,
          },
        )}
        primaryAction={{
          label: t('sharePlanFile', { defaultValue: '分享计划文件' }),
          icon: FileJson,
          disabled: !selectedPlan,
          onPress: shareLargePlanFile,
        }}
        sections={[
          {
            actions: [
              {
                label: t('createDisplayImage', { defaultValue: '生成展示图片' }),
                icon: ImageIcon,
                disabled: !selectedPlan,
                onPress: openDisplayOnlyShare,
              },
            ],
          },
        ]}
      />
    </>
  );
}
