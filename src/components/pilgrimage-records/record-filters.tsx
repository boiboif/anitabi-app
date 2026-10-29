import { RecordDateCalendar } from '@/components/pilgrimage-records/record-date-calendar';
import { StrictButton as Button } from '@/components/ui/strict-button';
import { ThemeChoiceChip } from '@/components/ui/theme-choice-chip';
import { ThemeInput } from '@/components/ui/theme-input';
import { getPilgrimagePresetRange, type PilgrimageTimePreset } from '@/lib/pilgrimage-record-filter';
import { isPilgrimageDateRangeValid, type PilgrimageDateRange } from '@/lib/pilgrimage-record-query';
import { TrueSheet, TrueSheetPeek } from '@lodev09/react-native-true-sheet';
import { ChevronDown, Square, SquareCheckBig, X } from '@tamagui/lucide-icons-2';
import { useIsFocused, useNavigation, usePreventRemove } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, FlatList, Keyboard, Platform, Pressable } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack, useTheme } from 'tamagui';

export type RecordTimeFilter = { preset: PilgrimageTimePreset; range: PilgrimageDateRange };
export type RecordBangumiOption = { id: string; name: string };
type FilterMode = 'bangumi' | 'date';
type FilterProps = {
  bangumi: RecordBangumiOption[];
  bangumiIds: string[];
  timeFilter: RecordTimeFilter;
  onBangumiChange: (ids: string[]) => void;
  onTimeChange: (value: RecordTimeFilter) => void;
  onClear: () => void;
};
// Render only the bar inside the caller's list. Native sheets retain React context,
// so their virtualized content must stay outside the list's ScrollView subtree.
type Props = FilterProps & { children: (filterBar: ReactElement) => ReactNode };

const EMPTY_RANGE: PilgrimageDateRange = { startDate: '', endDate: '' };
const PRESETS = [
  { value: 'all', label: 'pilgrimageRecordsFilterDateAll' },
  { value: 'last7', label: 'pilgrimageRecordsFilterDateLast7' },
  { value: 'last30', label: 'pilgrimageRecordsFilterDateLast30' },
  { value: 'month', label: 'pilgrimageRecordsFilterDateMonth' },
  { value: 'year', label: 'pilgrimageRecordsFilterDateYear' },
  { value: 'custom', label: 'pilgrimageRecordsFilterDateCustom' },
] as const;

function BangumiRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
    >
      <XStack minH={52} px="$4" py="$2" gap="$3" items="center">
        <Text flex={1} minW={0} fontSize="$body" color="$color12" numberOfLines={2}>
          {label}
        </Text>
        {selected ? (
          <SquareCheckBig size={23} strokeWidth={2.5} color={theme.primary.val} />
        ) : (
          <Square size={23} color="$color8" />
        )}
      </XStack>
    </Pressable>
  );
}

function FilterPanel({
  mode,
  bangumi,
  bangumiIds,
  timeFilter,
  onBangumiChange,
  onTimeChange,
  sheetRef,
  onPresent,
  onClose,
  onDismiss,
}: Omit<FilterProps, 'onClear'> & {
  mode: FilterMode;
  sheetRef: RefObject<TrueSheet | null>;
  onPresent: () => void;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  // Each opening mounts a fresh panel; dismissing never commits these drafts.
  const [draftBangumi, setDraftBangumi] = useState(bangumiIds);
  const [draftPreset, setDraftPreset] = useState(timeFilter.preset);
  const [draftRange, setDraftRange] = useState(timeFilter.range);
  const [search, setSearch] = useState('');
  const initialDatePreset = useRef(timeFilter.preset);
  const [calendarExpanded, setCalendarExpanded] = useState(timeFilter.preset === 'custom');
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);
  const range = draftPreset === 'custom' ? draftRange : getPilgrimagePresetRange(draftPreset);
  const searchTerm = search.trim().toLocaleLowerCase();
  const options = bangumi.filter((option) => option.name.toLocaleLowerCase().includes(searchTerm));
  const canConfirm =
    mode === 'bangumi' ||
    draftPreset !== 'custom' ||
    (!!range.startDate && !!range.endDate && isPilgrimageDateRangeValid(range));

  useEffect(() => {
    if (mode !== 'date') return;
    let active = true;
    // Unlike initialDetentIndex, present() waits for the native content mount.
    // Auto detents need that content before calculating the opening position.
    void sheetRef.current?.present(initialDatePreset.current === 'custom' ? 1 : 0).catch((error) => {
      if (!active) return;
      console.error('Failed to open the pilgrimage date filter', error);
      onClose();
    });
    return () => {
      active = false;
    };
  }, [mode, sheetRef, onClose]);

  const actions = (
    <XStack
      px="$4"
      pt="$3"
      pb={Math.max(insets.bottom, 12)}
      gap="$3"
      shrink={0}
      bg="$color2"
      borderTopWidth={1}
      borderColor="$color5"
      onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
    >
      <Button
        flex={1}
        minH={44}
        bg="$color4"
        onPress={() => {
          if (mode === 'bangumi') setDraftBangumi([]);
          else {
            setDraftPreset('all');
            setDraftRange(EMPTY_RANGE);
            void sheetRef.current?.resize(0);
          }
        }}
      >
        <Text fontSize="$body" color="$color12">
          {t('pilgrimageRecordsFilterReset')}
        </Text>
      </Button>
      <Button
        flex={1}
        minH={44}
        bg="$primary"
        disabled={!canConfirm}
        disabledStyle={{ opacity: 0.4 }}
        onPress={() => {
          if (!canConfirm) return;
          if (mode === 'bangumi') onBangumiChange(draftBangumi);
          else
            onTimeChange({
              preset: draftPreset,
              range: draftPreset === 'custom' ? draftRange : getPilgrimagePresetRange(draftPreset),
            });
          onClose();
        }}
      >
        <Text fontSize="$body" color="white">
          {t('pilgrimageRecordsFilterConfirm')}
        </Text>
      </Button>
    </XStack>
  );

  return (
    <TrueSheet
      ref={sheetRef}
      detents={mode === 'bangumi' ? [0.55] : ['peek', 'auto']}
      dimmedDetentIndex={0}
      initialDetentIndex={mode === 'bangumi' ? 0 : undefined}
      initialDetentAnimated
      scrollable={mode === 'bangumi'}
      scrollableOptions={
        mode === 'bangumi' ? { scrollingExpandsSheet: false, keyboardScrollOffset: footerHeight + 24 } : undefined
      }
      cornerRadius={20}
      backgroundColor={theme.color2.val}
      grabberOptions={{ color: theme.primary.val, adaptive: false, topMargin: 8, width: 42, height: 5 }}
      onDidPresent={(event) => {
        if (mode === 'date') setCalendarExpanded(event.nativeEvent.index === 1);
        onPresent();
      }}
      onDetentChange={mode === 'date' ? (event) => setCalendarExpanded(event.nativeEvent.index === 1) : undefined}
      onDidDismiss={() => {
        Keyboard.dismiss();
        onDismiss();
      }}
      header={
        <YStack bg="$color2">
          <XStack px="$4" pt="$3" pb="$2" gap="$3" items="center">
            <Text flex={1} fontSize="$subtitle" fontWeight="600" color="$color12" accessibilityRole="header">
              {t(mode === 'bangumi' ? 'pilgrimageRecordsBangumiFilter' : 'pilgrimageRecordsDateFilter')}
            </Text>
            <Button
              width={44}
              height={44}
              p={0}
              chromeless
              accessibilityLabel={t('pilgrimageRecordsFilterClose')}
              onPress={onClose}
              icon={<X size={20} color="$color11" />}
            />
          </XStack>
          {mode === 'bangumi' ? (
            <YStack px="$4" pb="$3">
              <ThemeInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('pilgrimageRecordsFilterSearchBangumi')}
                accessibilityLabel={t('pilgrimageRecordsFilterSearchBangumi')}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={Keyboard.dismiss}
              />
            </YStack>
          ) : null}
        </YStack>
      }
      footer={actions}
    >
      {mode === 'bangumi' ? (
        <GestureHandlerRootView style={{ flexGrow: 1 }}>
          <FlatList
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: footerHeight + 12 }}
            data={options}
            keyExtractor={(option) => option.id}
            extraData={draftBangumi}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListHeaderComponent={
              <BangumiRow
                label={t('pilgrimageRecordsAllBangumi')}
                selected={draftBangumi.length === 0}
                onPress={() => setDraftBangumi([])}
              />
            }
            renderItem={({ item }) => (
              <BangumiRow
                label={item.name}
                selected={draftBangumi.includes(item.id)}
                onPress={() =>
                  setDraftBangumi((current) =>
                    current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
                  )
                }
              />
            )}
            ListEmptyComponent={
              <Text p="$4" text="center" fontSize="$footnote" color="$color11">
                {t('pilgrimageRecordsFilterNoBangumiMatches')}
              </Text>
            }
          />
        </GestureHandlerRootView>
      ) : (
        // Peek measures the quick options plus the native header and footer.
        // Keep the calendar mounted so expanding changes detents, not the dim threshold.
        <YStack pb={footerHeight}>
          <TrueSheetPeek>
            <XStack
              px="$4"
              pt="$1"
              pb={16}
              flexWrap="wrap"
              gap="$2"
              accessibilityRole="radiogroup"
              accessibilityLabel={t('pilgrimageRecordsDateFilter')}
            >
              {PRESETS.map((preset) => (
                <ThemeChoiceChip
                  key={preset.value}
                  label={t(preset.label)}
                  selected={draftPreset === preset.value}
                  onPress={() => {
                    if (preset.value === 'custom' && draftPreset !== 'custom') setDraftRange(range);
                    setDraftPreset(preset.value);
                    void sheetRef.current?.resize(preset.value === 'custom' ? 1 : 0);
                  }}
                />
              ))}
            </XStack>
          </TrueSheetPeek>
          <YStack
            px="$4"
            pb={16}
            pointerEvents={calendarExpanded ? 'auto' : 'none'}
            accessibilityElementsHidden={!calendarExpanded}
            importantForAccessibility={calendarExpanded ? 'auto' : 'no-hide-descendants'}
          >
            <RecordDateCalendar
              range={range}
              onChange={(next) => {
                setDraftPreset('custom');
                setDraftRange(next);
              }}
            />
          </YStack>
        </YStack>
      )}
    </TrueSheet>
  );
}

export function RecordFilters(props: Props) {
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const navigation = useNavigation();
  const sheetRef = useRef<TrueSheet>(null);
  const didPresent = useRef(false);
  const nextSession = useRef(0);
  const [session, setSession] = useState<{ mode: FilterMode; key: number } | null>(null);
  const { timeFilter, bangumiIds } = props;
  const hasFilters = bangumiIds.length > 0 || timeFilter.preset !== 'all';
  const bangumiLabel =
    bangumiIds.length > 1
      ? t('pilgrimageRecordsSelectedBangumi', { count: bangumiIds.length })
      : props.bangumi.find((option) => option.id === bangumiIds[0])?.name || t('pilgrimageRecordsAllBangumi');
  const dateLabel = t(PRESETS.find((preset) => preset.value === timeFilter.preset)!.label);

  useEffect(
    () =>
      navigation.addListener('blur', () => {
        didPresent.current = false;
        setSession(null);
        Keyboard.dismiss();
      }),
    [navigation],
  );

  const close = useCallback(() => {
    Keyboard.dismiss();
    // Native dismiss can be a no-op before presentation; cancel the pending mount.
    if (!didPresent.current) {
      setSession(null);
      return;
    }
    void sheetRef.current?.dismiss();
  }, []);
  const hasOpenSheet = isFocused && session !== null;
  // Keep page removal blocked until the sheet's closing animation has finished.
  usePreventRemove(hasOpenSheet, close);
  useEffect(() => {
    if (Platform.OS !== 'android' || !hasOpenSheet) return;
    // TrueSheet registers its own listener only after its opening animation.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [hasOpenSheet, close]);

  const open = (mode: FilterMode) => {
    if (session) return;
    Keyboard.dismiss();
    didPresent.current = false;
    setSession({ mode, key: ++nextSession.current });
  };

  return (
    <>
      {props.children(
        <XStack gap="$2" items="center">
          {(
            [
              {
                mode: 'bangumi',
                label: bangumiLabel,
                active: bangumiIds.length > 0,
                name: t('pilgrimageRecordsBangumiFilter'),
              },
              {
                mode: 'date',
                label: dateLabel,
                active: timeFilter.preset !== 'all',
                name: t('pilgrimageRecordsDateFilter'),
              },
            ] as const
          ).map((filter) => (
            <Button
              key={filter.mode}
              shrink={1}
              minW={0}
              size="$3"
              px="$2"
              chromeless
              bg="transparent"
              borderWidth={0}
              accessibilityLabel={`${filter.name}: ${filter.label}`}
              accessibilityState={{ expanded: session?.mode === filter.mode }}
              onPress={() => open(filter.mode)}
            >
              <Text
                shrink={1}
                minW={0}
                numberOfLines={1}
                fontSize="$footnote"
                color={filter.active ? '$primary' : '$color12'}
              >
                {filter.label}
              </Text>
              <ChevronDown size={14} color={filter.active ? '$primary' : '$color11'} />
            </Button>
          ))}
          {hasFilters ? (
            <Button size="$3" shrink={0} ml="auto" chromeless px="$2" onPress={props.onClear}>
              <Text fontSize="$footnote" color="$primary">
                {t('pilgrimageRecordsClearFilters')}
              </Text>
            </Button>
          ) : null}
        </XStack>,
      )}
      {session && isFocused ? (
        <FilterPanel
          key={session.key}
          {...props}
          mode={session.mode}
          sheetRef={sheetRef}
          onPresent={() => {
            didPresent.current = true;
          }}
          onClose={close}
          onDismiss={() => {
            didPresent.current = false;
            setSession(null);
          }}
        />
      ) : null}
    </>
  );
}
