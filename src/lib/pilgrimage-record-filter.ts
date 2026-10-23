import type { PilgrimageDateRange } from '@/lib/pilgrimage-record-query';

export type PilgrimageTimePreset = 'all' | 'last7' | 'last30' | 'month' | 'year' | 'custom';
export type PilgrimageCalendarMonth = { year: number; month: number };
export type PilgrimageCalendarDay = { dateKey: string; day: number; isCurrentMonth: boolean };

type CalendarDate = PilgrimageCalendarMonth & { day: number };

function validateMonth(year: number, month: number) {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Invalid pilgrimage calendar month');
  }
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseDateKey(value: string): CalendarDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid pilgrimage calendar date');
  const [year, month, day] = value.split('-').map(Number);
  validateMonth(year, month);
  if (day < 1 || day > daysInMonth(year, month)) throw new Error('Invalid pilgrimage calendar date');
  return { year, month, day };
}

function formatDateKey({ year, month, day }: CalendarDate): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Work in local calendar dates rather than elapsed milliseconds: a day may have
// 23 or 25 hours, and a timezone change must not shift a stored date label.
function shiftCalendarDate(date: CalendarDate, amount: number): CalendarDate | null {
  let { year, month, day } = date;
  day += amount;
  while (day < 1) {
    month -= 1;
    if (month < 1) {
      year -= 1;
      month = 12;
    }
    if (year < 1) return null;
    day += daysInMonth(year, month);
  }
  while (day > daysInMonth(year, month)) {
    day -= daysInMonth(year, month);
    month += 1;
    if (month > 12) {
      year += 1;
      month = 1;
    }
    if (year > 9999) return null;
  }
  return { year, month, day };
}

export function getPilgrimageLocalDateKey(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid pilgrimage reference date');
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  validateMonth(year, month);
  return formatDateKey({ year, month, day: date.getDate() });
}

export function getPilgrimagePresetRange(
  preset: PilgrimageTimePreset,
  referenceDate = new Date(),
): PilgrimageDateRange {
  if (preset === 'all' || preset === 'custom') return { startDate: '', endDate: '' };
  const endDate = getPilgrimageLocalDateKey(referenceDate);
  const today = parseDateKey(endDate);
  if (preset === 'month') return { startDate: formatDateKey({ ...today, day: 1 }), endDate };
  if (preset === 'year') return { startDate: formatDateKey({ year: today.year, month: 1, day: 1 }), endDate };
  const start = shiftCalendarDate(today, preset === 'last7' ? -6 : -29);
  return { startDate: start ? formatDateKey(start) : '0001-01-01', endDate };
}

export function getPilgrimageCalendarMonth(dateKey: string): PilgrimageCalendarMonth {
  const { year, month } = parseDateKey(dateKey);
  return { year, month };
}

/** Inclusive calendar days, independent of DST and skipped local dates. */
export function getPilgrimageDateRangeDayCount(range: PilgrimageDateRange): number {
  if (!range.startDate || !range.endDate) return 0;

  const ordinal = ({ year, month, day }: CalendarDate) => {
    const previousYear = year - 1;
    let days =
      365 * previousYear +
      Math.floor(previousYear / 4) -
      Math.floor(previousYear / 100) +
      Math.floor(previousYear / 400) +
      day;
    for (let current = 1; current < month; current += 1) days += daysInMonth(year, current);
    return days;
  };

  const start = ordinal(parseDateKey(range.startDate));
  const end = ordinal(parseDateKey(range.endDate));
  return Math.max(0, end - start + 1);
}

export function movePilgrimageCalendarMonth(year: number, month: number, delta: number): PilgrimageCalendarMonth {
  validateMonth(year, month);
  if (!Number.isSafeInteger(delta)) throw new Error('Invalid pilgrimage month offset');
  const next = Math.max(0, Math.min(9999 * 12 - 1, (year - 1) * 12 + month - 1 + delta));
  return { year: Math.floor(next / 12) + 1, month: (next % 12) + 1 };
}

/** Monday-first six-week grid. Schema boundaries use empty cells, never year 0 or 10000. */
export function getPilgrimageCalendarDays(year: number, month: number): (PilgrimageCalendarDay | null)[] {
  validateMonth(year, month);
  const previousYear = year - 1;
  let daysBeforeMonth = 0;
  for (let current = 1; current < month; current += 1) daysBeforeMonth += daysInMonth(year, current);
  // 0001-01-01 is Monday in the proleptic Gregorian calendar used by the schema.
  const mondayOffset =
    (365 * previousYear +
      Math.floor(previousYear / 4) -
      Math.floor(previousYear / 100) +
      Math.floor(previousYear / 400) +
      daysBeforeMonth) %
    7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = shiftCalendarDate({ year, month, day: 1 }, index - mondayOffset);
    return date
      ? { dateKey: formatDateKey(date), day: date.day, isCurrentMonth: date.year === year && date.month === month }
      : null;
  });
}

/** The first tap starts over; the second completes an inclusive, ordered range. */
export function selectPilgrimageDateRange(range: PilgrimageDateRange, dateKey: string): PilgrimageDateRange {
  parseDateKey(dateKey);
  if (!range.startDate || range.endDate) return { startDate: dateKey, endDate: '' };
  parseDateKey(range.startDate);
  return dateKey < range.startDate
    ? { startDate: dateKey, endDate: range.startDate }
    : { startDate: range.startDate, endDate: dateKey };
}
