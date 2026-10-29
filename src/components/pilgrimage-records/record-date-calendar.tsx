import { StrictButton as Button } from '@/components/ui/strict-button';
import {
  getPilgrimageCalendarDays,
  getPilgrimageCalendarMonth,
  getPilgrimageDateRangeDayCount,
  getPilgrimageLocalDateKey,
  movePilgrimageCalendarMonth,
  selectPilgrimageDateRange,
} from '@/lib/pilgrimage-record-filter';
import type { PilgrimageDateRange } from '@/lib/pilgrimage-record-query';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from '@tamagui/lucide-icons-2';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, type PressableProps } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

type Props = { range: PilgrimageDateRange; onChange: (range: PilgrimageDateRange) => void };
type CalendarMode = 'days' | 'months' | 'years';

function CalendarHeaderButton({
  children,
  disabled,
  ...props
}: Pick<PressableProps, 'accessibilityLabel' | 'accessibilityState' | 'disabled' | 'onPress'> & {
  children: ReactNode;
}) {
  return (
    <Pressable
      {...props}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({ minWidth: 0, flexShrink: 1, opacity: pressed && !disabled ? 0.65 : 1 })}
    >
      <XStack px="$2" py="$2" gap="$1" minW={0} items="center" justify="center">
        {children}
      </XStack>
    </Pressable>
  );
}

export function RecordDateCalendar({ range, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const [month, setMonth] = useState(() =>
    getPilgrimageCalendarMonth(range.startDate || getPilgrimageLocalDateKey(new Date())),
  );
  const [mode, setMode] = useState<CalendarMode>('days');
  const today = getPilgrimageLocalDateKey(new Date());
  const yearPageStart = Math.floor((month.year - 1) / 12) * 12 + 1;
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'long' });
  // Keep stored date labels stable even when a local timezone skipped that day.
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'UTC',
  });
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 0, 5 + index)),
  );
  const days = getPilgrimageCalendarDays(month.year, month.month);
  const dayCount = getPilgrimageDateRangeDayCount(range);
  const previousDisabled =
    mode === 'years'
      ? yearPageStart === 1
      : mode === 'months'
        ? month.year === 1
        : month.year === 1 && month.month === 1;
  const nextDisabled =
    mode === 'years'
      ? yearPageStart + 12 > 9999
      : mode === 'months'
        ? month.year === 9999
        : month.year === 9999 && month.month === 12;

  const move = (direction: number) => {
    setMonth(
      movePilgrimageCalendarMonth(
        month.year,
        month.month,
        direction * (mode === 'days' ? 1 : mode === 'months' ? 12 : 144),
      ),
    );
  };

  return (
    <YStack gap="$2" bg="$background" rounded="$3" p="$2">
      <XStack items="center" justify="space-between" gap="$1">
        {/* Equal side regions keep the title centered despite the Today action. */}
        <XStack flex={1} minW={0} items="center">
          <CalendarHeaderButton
            disabled={previousDisabled}
            accessibilityLabel={t(
              mode === 'days'
                ? 'pilgrimageRecordsFilterPreviousMonth'
                : mode === 'months'
                  ? 'pilgrimageRecordsFilterPreviousYear'
                  : 'pilgrimageRecordsFilterPreviousYears',
            )}
            onPress={() => move(-1)}
          >
            <ChevronLeft size={20} color={previousDisabled ? '$color7' : '$color12'} />
          </CalendarHeaderButton>
        </XStack>
        <XStack flex={2} minW={0} justify="center" items="center" gap="$1">
          <CalendarHeaderButton
            accessibilityLabel={t('pilgrimageRecordsFilterYear', { year: month.year })}
            accessibilityState={{ expanded: mode === 'years' }}
            onPress={() => setMode(mode === 'years' ? 'days' : 'years')}
          >
            <Text
              color={mode === 'years' ? '$primary' : '$color12'}
              shrink={1}
              minW={0}
              fontSize="$footnote"
              fontWeight="600"
              numberOfLines={1}
            >
              {t('pilgrimageRecordsFilterYear', { year: month.year })}
            </Text>
            {mode === 'years' ? <ChevronUp size={14} color="$primary" /> : <ChevronDown size={14} color="$color11" />}
          </CalendarHeaderButton>
          <CalendarHeaderButton
            accessibilityLabel={t('pilgrimageRecordsFilterSelectMonth')}
            accessibilityState={{ expanded: mode === 'months' }}
            onPress={() => setMode(mode === 'months' ? 'days' : 'months')}
          >
            <Text
              color={mode === 'months' ? '$primary' : '$color12'}
              shrink={1}
              minW={0}
              fontSize="$footnote"
              fontWeight="600"
              numberOfLines={1}
            >
              {monthFormatter.format(new Date(2026, month.month - 1, 1))}
            </Text>
            {mode === 'months' ? <ChevronUp size={14} color="$primary" /> : <ChevronDown size={14} color="$color11" />}
          </CalendarHeaderButton>
        </XStack>
        <XStack flex={1} minW={0} justify="flex-end" items="center">
          <CalendarHeaderButton
            accessibilityLabel={t('pilgrimageRecordsFilterGoToToday')}
            onPress={() => {
              setMonth(getPilgrimageCalendarMonth(today));
              setMode('days');
            }}
          >
            <Text fontSize="$footnote" color="$primary" shrink={1} minW={0} numberOfLines={1}>
              {t('today')}
            </Text>
          </CalendarHeaderButton>
          <CalendarHeaderButton
            disabled={nextDisabled}
            accessibilityLabel={t(
              mode === 'days'
                ? 'pilgrimageRecordsFilterNextMonth'
                : mode === 'months'
                  ? 'pilgrimageRecordsFilterNextYear'
                  : 'pilgrimageRecordsFilterNextYears',
            )}
            onPress={() => move(1)}
          >
            <ChevronRight size={20} color={nextDisabled ? '$color7' : '$color12'} />
          </CalendarHeaderButton>
        </XStack>
      </XStack>
      {mode === 'days' ? (
        <YStack gap="$1">
          <XStack>
            {weekdays.map((weekday, index) => (
              <Text key={index} flex={1} text="center" fontSize="$caption" color="$color10" py="$1">
                {weekday}
              </Text>
            ))}
          </XStack>
          {Array.from({ length: 6 }, (_, week) => (
            <XStack key={week}>
              {days.slice(week * 7, week * 7 + 7).map((day, column) => {
                if (!day) return <View key={`empty-${column}`} flex={1} minW={0} minH={44} />;
                const start = day.dateKey === range.startDate;
                const end = day.dateKey === range.endDate;
                const endpoint = start || end;
                const inRange = !!dayCount && day.dateKey >= range.startDate && day.dateKey <= range.endDate;
                const isToday = day.dateKey === today;
                const date = new Date(0);
                const { year, month: dateMonth } = getPilgrimageCalendarMonth(day.dateKey);
                date.setUTCFullYear(year, dateMonth - 1, day.day);
                const label = [
                  dateFormatter.format(date),
                  isToday ? t('today') : '',
                  start ? t('pilgrimageRecordsFilterRangeStart') : '',
                  end ? t('pilgrimageRecordsFilterRangeEnd') : '',
                ]
                  .filter(Boolean)
                  .join(', ');
                return (
                  <View
                    key={day.dateKey}
                    testID={`pilgrimage-calendar-day-${day.dateKey}`}
                    flex={1}
                    minW={0}
                    minH={44}
                    items="center"
                    justify="center"
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ selected: endpoint || inRange }}
                    pressStyle={{ opacity: 0.6 }}
                    onPress={() => {
                      onChange(selectPilgrimageDateRange(range, day.dateKey));
                      if (!day.isCurrentMonth) setMonth(getPilgrimageCalendarMonth(day.dateKey));
                    }}
                  >
                    {inRange && dayCount > 1 ? (
                      <View
                        pointerEvents="none"
                        position="absolute"
                        t={4}
                        height={36}
                        l={start ? '50%' : 0}
                        r={end ? '50%' : 0}
                        bg="$primary"
                        opacity={0.14}
                        borderTopLeftRadius={column === 0 ? 18 : 0}
                        borderBottomLeftRadius={column === 0 ? 18 : 0}
                        borderTopRightRadius={column === 6 ? 18 : 0}
                        borderBottomRightRadius={column === 6 ? 18 : 0}
                      />
                    ) : null}
                    <View
                      pointerEvents="none"
                      width="90%"
                      maxW={36}
                      height={36}
                      rounded={18}
                      items="center"
                      justify="center"
                      bg={endpoint ? '$primary' : 'transparent'}
                      borderWidth={isToday && !endpoint ? 1 : 0}
                      borderColor="$primary"
                    >
                      <Text
                        fontSize="$footnote"
                        fontWeight={endpoint || isToday ? '600' : '400'}
                        color={endpoint ? 'white' : isToday ? '$primary' : day.isCurrentMonth ? '$color12' : '$color9'}
                      >
                        {day.day}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </XStack>
          ))}
        </YStack>
      ) : (
        <YStack gap="$2">
          {mode === 'years' ? (
            <Text text="center" fontSize="$caption" color="$color11" accessibilityLiveRegion="polite">
              {yearPageStart} - {Math.min(yearPageStart + 11, 9999)}
            </Text>
          ) : null}
          {Array.from({ length: 4 }, (_, row) => (
            <XStack key={row} gap="$2">
              {Array.from({ length: 3 }, (_, column) => {
                const value = row * 3 + column + (mode === 'years' ? yearPageStart : 1);
                const selected = value === (mode === 'years' ? month.year : month.month);
                if (value > 9999) return <View key={value} flex={1} />;
                return (
                  <Button
                    key={value}
                    testID={`pilgrimage-calendar-${mode === 'years' ? 'year' : 'month'}-${value}`}
                    flex={1}
                    minW={0}
                    minH={44}
                    px="$1"
                    rounded="$3"
                    borderWidth={1}
                    borderColor={selected ? '$primary' : '$color5'}
                    bg={selected ? '$primary' : 'transparent'}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setMonth(mode === 'years' ? { ...month, year: value } : { ...month, month: value });
                      setMode(mode === 'years' ? 'months' : 'days');
                    }}
                  >
                    <Text fontSize="$footnote" color={selected ? 'white' : '$color12'} numberOfLines={1}>
                      {mode === 'years' ? value : monthFormatter.format(new Date(2026, value - 1, 1))}
                    </Text>
                  </Button>
                );
              })}
            </XStack>
          ))}
        </YStack>
      )}
    </YStack>
  );
}
