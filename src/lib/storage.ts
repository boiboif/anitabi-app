import { createMMKV } from 'react-native-mmkv';

export type ThemePreference = 'system' | 'light' | 'dark';

type LegacyDarkModeConfig = {
  followSystem: boolean;
  manualTheme: 'light' | 'dark';
};

const storage = createMMKV({ id: 'anitabi-settings' });

const DARK_MODE_KEY = 'dark-mode-config';

const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

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
