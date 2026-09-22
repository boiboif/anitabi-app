import type { TranslationMessage } from '@/i18n/messages';

export const MAP_STYLES = [
  { key: 'streets', url: 'mapbox://styles/mapbox/streets-v12', label: { key: 'streets', defaultValue: '街道' } },
  {
    key: 'satellite',
    url: 'mapbox://styles/mapbox/satellite-streets-v12',
    label: { key: 'satellite', defaultValue: '卫星' },
  },
  { key: 'outdoors', url: 'mapbox://styles/mapbox/outdoors-v12', label: { key: 'outdoors', defaultValue: '户外' } },
  { key: 'dark', url: 'mapbox://styles/mapbox/dark-v11', label: { key: 'dark', defaultValue: '深色' } },
  { key: 'light', url: 'mapbox://styles/mapbox/light-v11', label: { key: 'light', defaultValue: '浅色' } },
] as const satisfies readonly { key: string; url: string; label: TranslationMessage }[];

export const STREET_MAP_STYLE_INDEX = MAP_STYLES.findIndex((style) => style.key === 'streets');
export const DARK_MAP_STYLE_INDEX = MAP_STYLES.findIndex((style) => style.key === 'dark');
