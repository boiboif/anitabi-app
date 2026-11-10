type PlaceColor = 'blue' | 'teal' | 'green' | 'red' | 'amber' | 'purple';
type CardColorScheme = 'light' | 'dark';

// The colors are designed for the card background, rather than copying the
// map's paint color, which may be almost white on a satellite or dark style.
const COLORS: Record<PlaceColor, Record<CardColorScheme, string>> = {
  blue: { light: '#3156A7', dark: '#A9C2FF' },
  teal: { light: '#147A68', dark: '#75D9C2' },
  green: { light: '#356B2A', dark: '#A9D995' },
  red: { light: '#A63545', dark: '#FFB1B9' },
  amber: { light: '#805308', dark: '#EFC577' },
  purple: { light: '#7247A1', dark: '#D2B8FC' },
};

// More specific Maki categories take precedence over the broader Mapbox class.
const MAKI_COLORS = new Map<string, PlaceColor>([
  ['fuel', 'teal'],
  ['police', 'blue'], ['police-station', 'blue'],
  ['rail', 'blue'], ['rail-light', 'blue'], ['rail-metro', 'blue'],
  ['bus', 'blue'], ['bus-stop', 'blue'], ['ferry', 'blue'], ['airport', 'blue'],
  ['hospital', 'red'], ['doctor', 'red'], ['dentist', 'red'], ['pharmacy', 'red'],
  ['park', 'green'], ['garden', 'green'], ['tree', 'green'], ['picnic-site', 'green'],
  ['nature-reserve', 'green'], ['zoo', 'green'],
  ['restaurant', 'amber'], ['cafe', 'amber'], ['fast-food', 'amber'], ['bar', 'amber'],
  ['bakery', 'amber'], ['grocery', 'amber'],
  ['school', 'amber'], ['college', 'amber'], ['university', 'amber'], ['library', 'amber'],
  ['museum', 'purple'], ['theatre', 'purple'], ['cinema', 'purple'],
  ['monument', 'purple'], ['attraction', 'purple'], ['artwork', 'purple'], ['lodging', 'purple'],
]);

const CLASS_COLORS = new Map<string, PlaceColor>([
  ['food_and_drink', 'amber'], ['food_and_drink_stores', 'amber'],
  ['education', 'amber'], ['medical', 'red'], ['park_like', 'green'],
  ['sport_and_leisure', 'green'], ['store_like', 'blue'],
  ['commercial_services', 'purple'], ['motorist', 'purple'], ['lodging', 'purple'],
  ['arts_and_entertainment', 'purple'], ['historic', 'purple'], ['landmark', 'purple'],
]);

/** Return a readable card color, or null when the place category is unknown. */
export function getNearbyPlaceColor(
  maki: string | undefined,
  category: string | undefined,
  colorScheme: CardColorScheme,
): string | null {
  // Some map styles append the Maki symbol size to the icon identifier.
  const icon = maki?.trim().toLowerCase().replace(/-(?:11|15)$/, '');
  const color = (icon && MAKI_COLORS.get(icon)) ||
    (category && CLASS_COLORS.get(category.trim().toLowerCase()));
  return color ? COLORS[color][colorScheme] : null;
}
