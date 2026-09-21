import { SettingCell } from '@/components/setting-cell';
import { SettingsSection } from '@/components/settings-section';
import { translateMessage, type TranslationMessage } from '@/i18n/messages';
import type { LanguagePreference } from '@/lib/storage';
import { useLanguagePreference } from '@/store/use-language-preference';
import { BottomTabInset, MaxContentWidth } from '@/tamagui.config';
import { Check } from '@tamagui/lucide-icons-2';
import { ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, useTheme } from 'tamagui';

const LANGUAGE_OPTIONS: { preference: LanguagePreference; label: TranslationMessage }[] = [
  { preference: 'system', label: { key: 'followSystem', defaultValue: '跟随系统' } },
  { preference: 'zh-CN', label: { key: 'simplifiedChinese', defaultValue: '简体中文' } },
  { preference: 'ja', label: { key: 'japanese', defaultValue: '日语' } },
  { preference: 'en', label: { key: 'english', defaultValue: '英语' } },
];

export default function LanguageScreen() {
  const { t } = useTranslation();
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();
  const preference = useLanguagePreference((state) => state.preference);
  const setPreference = useLanguagePreference((state) => state.setPreference);
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + 16,
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background?.val }}
      contentInset={insets}
      contentContainerStyle={{ flexDirection: 'row', justifyContent: 'center' }}
    >
      <View bg="$background" width="100%" maxW={MaxContentWidth} flex={1} px="$3" pt="$3">
        <SettingsSection title={t('language', { defaultValue: '语言' })} hideTitleWhenSingle>
          {LANGUAGE_OPTIONS.map((option, index) => (
            <SettingCell
              key={option.preference}
              title={translateMessage(t, option.label)}
              rightAccessory={preference === option.preference ? <Check size={20} color="$primary" /> : null}
              showDivider={index < LANGUAGE_OPTIONS.length - 1}
              accessibilityRole="radio"
              accessibilityState={{ checked: preference === option.preference }}
              onPress={() => setPreference(option.preference)}
            />
          ))}
        </SettingsSection>
      </View>
    </ScrollView>
  );
}
