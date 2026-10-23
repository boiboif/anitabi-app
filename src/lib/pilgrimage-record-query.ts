import type { PilgrimageDay, PilgrimagePoint } from '@/lib/pilgrimage-records';

export type PilgrimageDateRange = { startDate: string; endDate: string };

export function isPilgrimageDateInputValid(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(0);
  date.setFullYear(year, month, 0);
  return day <= date.getDate();
}

export function isPilgrimageDateRangeValid({ startDate, endDate }: PilgrimageDateRange) {
  return (
    isPilgrimageDateInputValid(startDate) &&
    isPilgrimageDateInputValid(endDate) &&
    (!startDate || !endDate || startDate <= endDate)
  );
}

export function filterPilgrimageDays(days: PilgrimageDay[], { startDate, endDate }: PilgrimageDateRange) {
  return days
    .filter((day) => (!startDate || day.dateKey >= startDate) && (!endDate || day.dateKey <= endDate))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

export function queryPilgrimagePoints(
  points: PilgrimagePoint[],
  range: PilgrimageDateRange,
  bangumiIds: readonly string[] = [],
) {
  const selectedBangumiIds = new Set(bangumiIds);
  return points
    .filter((point) => selectedBangumiIds.size === 0 || selectedBangumiIds.has(String(point.bangumiId)))
    .map((point) => ({ ...point, days: filterPilgrimageDays(point.days, range) }))
    .filter((point) => point.days.length > 0)
    .sort((a, b) => {
      const aTime = a.days.reduce((latest, day) => Math.max(latest, day.firstRecordedAt), 0);
      const bTime = b.days.reduce((latest, day) => Math.max(latest, day.firstRecordedAt), 0);
      return bTime - aTime || a.key.localeCompare(b.key);
    });
}
