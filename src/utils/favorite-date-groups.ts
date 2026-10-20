type FavoriteDateGroupingOptions = {
  language: string;
  todayLabel: string;
  yesterdayLabel: string;
  now?: Date;
};

/** Keep localized group labels and encounter order while formatting each local day only once. */
export function groupFavoriteItemsByDate<T>(
  items: readonly T[],
  getTimestamp: (item: T) => number,
  { language, todayLabel, yesterdayLabel, now = new Date() }: FavoriteDateGroupingOptions,
): [string, T[]][] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const labelsByDay = new Map<number, string>();
  const groups = new Map<string, T[]>();
  let formatter: Intl.DateTimeFormat | undefined;

  for (const item of items) {
    const target = new Date(getTimestamp(item));
    const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
    let label = labelsByDay.get(targetStart);
    if (label === undefined) {
      // Local midnight gaps can be 23 or 25 hours across DST. Preserve the existing rounding.
      const days = Math.round((todayStart - targetStart) / 86_400_000);
      if (days === 0) label = todayLabel;
      else if (days === 1) label = yesterdayLabel;
      else {
        formatter ??= new Intl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric' });
        label = formatter.format(target);
      }
      labelsByDay.set(targetStart, label);
    }

    // Keep merging identical labels, including labels supplied for today and yesterday.
    const group = groups.get(label);
    if (group) group.push(item);
    else groups.set(label, [item]);
  }

  return Array.from(groups.entries());
}
