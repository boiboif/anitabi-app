import { getLanguagePreference, type AppLanguage, type LanguagePreference } from '@/lib/storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './translations/en';
import ja from './translations/ja';
import zh from './translations/zh';

export const appLanguages: AppLanguage[] = ['zh-CN', 'ja', 'en'];

export function resolveLanguageTag(languageTag?: string | null): AppLanguage {
  const normalized = languageTag?.toLowerCase() ?? '';
  if (normalized.startsWith('ja')) return 'ja';
  if (normalized.startsWith('en')) return 'en';
  return 'zh-CN';
}

export function resolveLanguagePreference(
  preference: LanguagePreference,
  systemLanguageTag = getLocales()[0]?.languageTag,
): AppLanguage {
  return preference === 'system' ? resolveLanguageTag(systemLanguageTag) : preference;
}

export function getCurrentLanguage(): AppLanguage {
  return resolveLanguageTag(i18n.resolvedLanguage ?? i18n.language);
}

// i18next's documented plugin API is exposed on the default instance.
// eslint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({
  lng: resolveLanguagePreference(getLanguagePreference()),
  fallbackLng: 'zh-CN',
  supportedLngs: appLanguages,
  resources: {
    'zh-CN': { translation: zh },
    ja: { translation: ja },
    en: { translation: en },
  },
  keySeparator: false,
  nsSeparator: false,
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

export default i18n;
