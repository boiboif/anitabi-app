import { createMMKV } from 'react-native-mmkv';

export type DarkModeConfig = {
  followSystem: boolean;
  manualTheme: 'light' | 'dark';
};

const storage = createMMKV({ id: 'anitabi-settings' });

const DARK_MODE_KEY = 'dark-mode-config';

const DEFAULT_CONFIG: DarkModeConfig = {
  followSystem: true,
  manualTheme: 'light',
};

export function getDarkModeConfig(): DarkModeConfig {
  const raw = storage.getString(DARK_MODE_KEY);
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function setDarkModeConfig(config: DarkModeConfig): void {
  storage.set(DARK_MODE_KEY, JSON.stringify(config));
}