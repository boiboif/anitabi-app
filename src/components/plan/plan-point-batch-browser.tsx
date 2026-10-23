import BangumiListCard from '@/components/bangumi/bangumi-list-card';
import AddPointBatchButton from '@/components/plan/add-point-batch-button';
import CardListItem from '@/components/ui/card-list-item';
import { StrictButton as Button } from '@/components/ui/strict-button';
import { getCardListBoundarySpacing } from '@/lib/card-list-layout';
import { getBangumiTitle } from '@/lib/localized-data';
import type { Bangumi } from '@/services/types';
import { useMapData } from '@/store/use-map-data';
import { usePlans } from '@/store/use-plans';
import { PageHorizontalInset } from '@/tamagui.config';
import { groupPointsForDetails } from '@/utils/plan-point-batches';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { ChevronLeft } from '@tamagui/lucide-icons-2';
import { useFocusEffect, useIsFocused, usePreventRemove } from 'expo-router';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Keyboard, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTokens, Spinner, Text, useTheme, View, XStack, YStack } from 'tamagui';
import SearchBox from '../ui/search-box';

export default function PlanPointBatchBrowser({ planId }: { planId: string }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const data = useMapData((state) => state.data);
  const status = useMapData((state) => state.status);
  const error = useMapData((state) => state.error);
  const initialize = useMapData((state) => state.initialize);
  const [query, setQuery] = useState('');
  const [bangumiId, setBangumiId] = useState<number>();
  const workListRef = useRef<FlashListRef<Bangumi>>(null);
  const isFocused = useIsFocused();
  const bangumis = data?.data.bangumis ?? [];
  const selectedBangumi = bangumis.find((bangumi) => bangumi.id === bangumiId);
  const planItems = usePlans((state) => state.plans.find((plan) => plan.id === planId)?.items);
  const planPointKeys = selectedBangumi ? new Set(planItems?.map((item) => item.key)) : undefined;
  const isBrowsingGroups = selectedBangumi !== undefined;
  const selectedTitle = selectedBangumi ? getBangumiTitle(selectedBangumi, i18n.resolvedLanguage ?? i18n.language) : '';
  const search = query.trim().toLocaleLowerCase();
  const matchingBangumis = bangumis.filter(
    (bangumi) =>
      bangumi.points.length > 0 &&
      (!search ||
        [bangumi.cn, bangumi.en, bangumi.title, bangumi.city].some((value) =>
          value?.toLocaleLowerCase().includes(search),
        )),
  );

  const handleQueryChange = (value: string) => {
    setQuery(value);
    workListRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  // Group browsing is a local step within the add-points route. Use the native
  // stack's supported removal guard for its header back button and swipe back.
  // Do not repeat the blocked removal: this back action only returns to works.
  usePreventRemove(isFocused && isBrowsingGroups, () => setBangumiId(undefined));
  useFocusEffect(
    useCallback(() => {
      if (!isBrowsingGroups) return;
      // Also handle Android back when this route has no previous stack entry.
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setBangumiId(undefined);
        return true;
      });
      return () => subscription.remove();
    }, [isBrowsingGroups]),
  );

  if (!data) {
    return (
      <YStack flex={1} minH={220} items="center" justify="center" gap="$3" px="$pageHorizontalInset">
        {status === 'error' ? (
          <>
            <Text fontSize="$body" color="$color11" text="center">
              {error?.message || t('mapDataFailedToLoad', { defaultValue: '地图数据加载失败' })}
            </Text>
            <Button color="$primary" onPress={() => void initialize()}>
              {t('retry', { defaultValue: '重试' })}
            </Button>
          </>
        ) : (
          <>
            <Spinner color="$primary" />
            <Text fontSize="$body" color="$color11">
              {t('loadingWorkList', { defaultValue: '加载番剧列表…' })}
            </Text>
          </>
        )}
      </YStack>
    );
  }

  let groupList: ReactNode = null;
  if (selectedBangumi) {
    const groups = groupPointsForDetails(
      selectedBangumi.points,
      selectedTitle,
      t('unnamedCollection', { defaultValue: '未命名合辑' }),
    );
    const choices = [
      { key: 'all', title: t('allWorkLocations', { defaultValue: '作品全部点位' }), data: selectedBangumi.points },
      ...groups,
    ];
    groupList = (
      <FlashList
        data={choices}
        style={{ flex: 1, backgroundColor: theme.pageBackground.val }}
        keyExtractor={(item) => item.key}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <YStack
            px="$pageHorizontalInset"
            pt="$2"
            pb={getCardListBoundarySpacing(getTokens().space['3'].val)}
            gap="$2"
          >
            <Pressable accessibilityRole="button" onPress={() => setBangumiId(undefined)} hitSlop={8}>
              <XStack minH={40} items="center" gap="$1">
                <ChevronLeft size={18} color={theme.primary.val} />
                <Text color="$primary" fontSize="$body">
                  {t('chooseAnotherWork', { defaultValue: '重新选择作品' })}
                </Text>
              </XStack>
            </Pressable>
            <Text fontSize="$subtitle" fontWeight="600" color="$color12">
              {selectedTitle}
            </Text>
            <Text fontSize="$caption" color="$color10">
              {t('existingPointGroupsHint', { defaultValue: '沿用作品详情中的分组，已加入的点位会自动跳过。' })}
            </Text>
          </YStack>
        }
        renderItem={({ item }) => (
          <CardListItem horizontalInset={PageHorizontalInset}>
            <XStack p="$3" gap="$2" items="center" rounded="$3" bg="$background">
              <YStack flex={1} gap="$1">
                <Text fontSize="$body" color="$color12" fontWeight={item.key === 'all' ? '600' : '400'}>
                  {item.title}
                </Text>
                <Text fontSize="$caption" color="$color10">
                  {t('locationCount', { defaultValue: '{{count}} 个点位', count: item.data.length })}
                </Text>
              </YStack>
              <AddPointBatchButton
                planId={planId}
                planPointKeys={planPointKeys}
                entries={item.data.map((point) => ({ point, bangumi: selectedBangumi }))}
                title={`${selectedTitle} · ${item.title}`}
                label={item.key === 'all' ? t('addAllToPlan', { defaultValue: '全部加入' }) : undefined}
              />
            </XStack>
          </CardListItem>
        )}
      />
    );
  }

  return (
    <View flex={1} position="relative" bg="$pageBackground">
      {/* Keep the work list mounted at its original size to retain its scroll position. */}
      <View
        flex={1}
        opacity={isBrowsingGroups ? 0 : 1}
        pointerEvents={isBrowsingGroups ? 'none' : 'auto'}
        accessibilityElementsHidden={isBrowsingGroups}
        importantForAccessibility={isBrowsingGroups ? 'no-hide-descendants' : 'auto'}
      >
        <YStack
          px="$pageHorizontalInset"
          pt="$2.5"
          pb={getCardListBoundarySpacing(getTokens().space['3'].val)}
          gap="$2"
        >
          <SearchBox
            value={query}
            onChangeText={handleQueryChange}
            placeholder={t('searchWorksForPlan', { defaultValue: '搜索作品名称或城市' })}
            accessibilityLabel={t('searchWorksForPlan', { defaultValue: '搜索作品名称或城市' })}
            autoCorrect={false}
            returnKeyType="search"
            placeholderTextColor="$color10"
          />
          <Text fontSize="$caption" color="$color10">
            {t('chooseWorkForBatchPlan', { defaultValue: '选择作品，将全部点位或某个已有分组加入当前计划。' })}
          </Text>
        </YStack>
        <FlashList
          ref={workListRef}
          data={matchingBangumis}
          style={{ flex: 1 }}
          keyExtractor={(item) => String(item.id)}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          maintainVisibleContentPosition={{ disabled: true }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <CardListItem horizontalInset={PageHorizontalInset}>
              <BangumiListCard
                bangumi={item}
                onPress={() => {
                  Keyboard.dismiss();
                  setBangumiId(item.id);
                }}
              />
            </CardListItem>
          )}
          ListEmptyComponent={
            <YStack minH={180} px="$pageHorizontalInset" gap="$3" items="center" justify="center">
              <Text fontSize="$body" color="$color11">
                {t('noWorksAvailableForPlan', { defaultValue: '没有可添加的作品' })}
              </Text>
              {query ? (
                <Button color="$primary" onPress={() => handleQueryChange('')}>
                  {t('clearWorkSearch', { defaultValue: '清除搜索' })}
                </Button>
              ) : null}
            </YStack>
          }
        />
      </View>
      {groupList && (
        <View position="absolute" t={0} r={0} b={0} l={0} bg="$pageBackground">
          {groupList}
        </View>
      )}
    </View>
  );
}
