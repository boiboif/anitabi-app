import { CalendarDays } from '@/components/icons';
import { RecordFilters, type RecordTimeFilter } from '@/components/pilgrimage-records/record-filters';
import { RecordPointCard } from '@/components/pilgrimage-records/record-point-card';
import CardListItem from '@/components/ui/card-list-item';
import { StrictButton as Button } from '@/components/ui/strict-button';
import { getPilgrimagePresetRange } from '@/lib/pilgrimage-record-filter';
import { queryPilgrimagePoints } from '@/lib/pilgrimage-record-query';
import { usePilgrimageRecords } from '@/store/use-pilgrimage-records';
import { MaxContentWidth, PageHorizontalInset } from '@/tamagui.config';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, YStack, useTheme } from 'tamagui';

const EMPTY_FILTER: RecordTimeFilter = { preset: 'all', range: { startDate: '', endDate: '' } };

export default function PilgrimageRecordsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const points = usePilgrimageRecords((state) => state.points);
  const loadError = usePilgrimageRecords((state) => state.loadError);
  const [bangumiIds, setBangumiIds] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState(EMPTY_FILTER);
  const range = timeFilter.preset === 'custom' ? timeFilter.range : getPilgrimagePresetRange(timeFilter.preset);
  const bangumi = Array.from(
    new Map(
      points.filter((point) => point.days.length).map((point) => [String(point.bangumiId), point.snapshot.bangumiName]),
    ),
  )
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => ({ id, name }));
  const filteredPoints = queryPilgrimagePoints(points, range, bangumiIds);
  const hasFilters = bangumiIds.length > 0 || !!(range.startDate || range.endDate);

  const clearFilters = () => {
    setBangumiIds([]);
    setTimeFilter(EMPTY_FILTER);
  };

  return (
    <View flex={1} bg="pageBackground" items="center">
      <View flex={1} w="100%" maxW={MaxContentWidth}>
        <RecordFilters
          bangumi={bangumi}
          bangumiIds={bangumiIds}
          timeFilter={{ ...timeFilter, range }}
          onBangumiChange={setBangumiIds}
          onTimeChange={setTimeFilter}
          onClear={clearFilters}
        >
          {(filterBar) => (
            <FlashList
              data={loadError ? [] : filteredPoints}
              keyExtractor={(point) => point.key}
              contentInsetAdjustmentBehavior="automatic"
              keyboardShouldPersistTaps="handled"
              style={{ backgroundColor: theme.pageBackground.val }}
              contentContainerStyle={{
                paddingHorizontal: PageHorizontalInset,
                paddingTop: 12,
                paddingBottom: insets.bottom + 24,
              }}
              ListHeaderComponent={
                !loadError && (points.length || hasFilters) ? (
                  <YStack gap="7px" pb="13px">
                    {filterBar}
                    <Text pl="7px" fontSize="caption" color="color-11">
                      {t('pilgrimageRecordsPointCount', { count: filteredPoints.length })}
                      {range.startDate || range.endDate
                        ? ` · ${t('pilgrimageRecordsFilterDateRange', {
                            start: range.startDate || '…',
                            end: range.endDate || '…',
                          })}`
                        : ''}
                    </Text>
                  </YStack>
                ) : null
              }
              renderItem={({ item }) => (
                <CardListItem>
                  <RecordPointCard
                    point={item}
                    onPress={() =>
                      router.navigate({
                        pathname: '/pilgrimage-records/[pointKey]',
                        params: { pointKey: item.key, startDate: range.startDate, endDate: range.endDate },
                      } as never)
                    }
                  />
                </CardListItem>
              )}
              ListEmptyComponent={
                <YStack minH={280} justify="center" items="center" gap="13px" px="18px">
                  <CalendarDays size={32} color="color-9" />
                  <Text
                    fontSize="body"
                    color="color-12"
                    text="center"
                    accessibilityRole={loadError ? 'alert' : undefined}
                  >
                    {t(
                      loadError
                        ? 'pilgrimageRecordsLoadFailed'
                        : hasFilters
                          ? 'pilgrimageRecordsNoMatches'
                          : 'pilgrimageRecordsEmpty',
                    )}
                  </Text>
                  <Text fontSize="footnote" color="color-11" text="center" lineHeight="20px">
                    {t(
                      loadError
                        ? 'pilgrimageRecordsLoadFailedHint'
                        : hasFilters
                          ? 'pilgrimageRecordsNoMatchesHint'
                          : 'pilgrimageRecordsEmptyHint',
                    )}
                  </Text>
                  {loadError ? (
                    <Button
                      bg="color-3 hover:background-hover press:background-press"
                      color="color-12"
                      onPress={() => router.push('/data-backup' as never)}
                    >
                      {t('pilgrimageRecordsOpenBackup')}
                    </Button>
                  ) : hasFilters ? (
                    <Button bg="color-3 hover:background-hover press:background-press" onPress={clearFilters}>
                      <Text color="primary" fontSize="body">
                        {t('pilgrimageRecordsClearFilters')}
                      </Text>
                    </Button>
                  ) : null}
                </YStack>
              }
            />
          )}
        </RecordFilters>
      </View>
    </View>
  );
}
