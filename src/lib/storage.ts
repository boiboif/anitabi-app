import { createMMKV } from 'react-native-mmkv';
import { CAMERA_RATIO_OPTIONS, type CameraRatioPreference } from './comparison-camera-geometry';
import { normalizeComparisonExportSettings, type ComparisonExportSettings } from './comparison-export';

export type ThemePreference = 'system' | 'light' | 'dark';
export type AppLanguage = 'zh-CN' | 'ja' | 'en';
export type LanguagePreference = 'system' | AppLanguage;

type LegacyDarkModeConfig = {
  followSystem: boolean;
  manualTheme: 'light' | 'dark';
};

const storage = createMMKV({ id: 'anitabi-settings' });

const DARK_MODE_KEY = 'dark-mode-config';
const LANGUAGE_KEY = 'language-preference';
const MAP_STYLE_FOLLOWS_THEME_KEY = 'map-style-follows-theme';
const CAMERA_RATIO_KEY = 'comparison-camera-ratio';
const COMPARISON_EXPORT_KEY = 'comparison-export-settings';

const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';
const DEFAULT_LANGUAGE_PREFERENCE: LanguagePreference = 'system';

export function getLanguagePreference(): LanguagePreference {
  const preference = storage.getString(LANGUAGE_KEY);
  return isLanguagePreference(preference) ? preference : DEFAULT_LANGUAGE_PREFERENCE;
}

export function setLanguagePreference(preference: LanguagePreference): void {
  storage.set(LANGUAGE_KEY, preference);
}

export function getThemePreference(): ThemePreference {
  const raw = storage.getString(DARK_MODE_KEY);
  if (!raw) return DEFAULT_THEME_PREFERENCE;

  try {
    const config: unknown = JSON.parse(raw);
    if (isThemePreferenceConfig(config)) return config.preference;
    if (isLegacyDarkModeConfig(config)) return config.followSystem ? 'system' : config.manualTheme;
  } catch {
    // Fall through to the default preference when persisted data is invalid.
  }

  return DEFAULT_THEME_PREFERENCE;
}

export function setThemePreference(preference: ThemePreference): void {
  storage.set(DARK_MODE_KEY, JSON.stringify({ preference }));
}

export function getMapStyleFollowsTheme(): boolean {
  return storage.getBoolean(MAP_STYLE_FOLLOWS_THEME_KEY) ?? false;
}

export function setMapStyleFollowsTheme(followsTheme: boolean): void {
  storage.set(MAP_STYLE_FOLLOWS_THEME_KEY, followsTheme);
}

export function getCameraRatioPreference(): CameraRatioPreference {
  const value = storage.getString(CAMERA_RATIO_KEY);
  return CAMERA_RATIO_OPTIONS.find((option) => option === value) ?? 'auto';
}

export function setCameraRatioPreference(preference: CameraRatioPreference): void {
  storage.set(CAMERA_RATIO_KEY, preference);
}

export function getComparisonExportSettings(): ComparisonExportSettings {
  try {
    const raw = storage.getString(COMPARISON_EXPORT_KEY);
    return normalizeComparisonExportSettings(raw ? JSON.parse(raw) : undefined);
  } catch {
    return normalizeComparisonExportSettings(undefined);
  }
}

export function setComparisonExportSettings(settings: ComparisonExportSettings): void {
  storage.set(COMPARISON_EXPORT_KEY, JSON.stringify(normalizeComparisonExportSettings(settings)));
}

function isThemePreferenceConfig(value: unknown): value is { preference: ThemePreference } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'preference' in value &&
    (value.preference === 'system' || value.preference === 'light' || value.preference === 'dark')
  );
}

function isLegacyDarkModeConfig(value: unknown): value is LegacyDarkModeConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'followSystem' in value &&
    'manualTheme' in value &&
    typeof value.followSystem === 'boolean' &&
    (value.manualTheme === 'light' || value.manualTheme === 'dark')
  );
}

function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'system' || value === 'zh-CN' || value === 'ja' || value === 'en';
}
