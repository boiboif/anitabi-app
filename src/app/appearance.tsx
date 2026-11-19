import { Check, Moon } from '@/components/icons';
import { SettingCell } from '@/components/ui/settings/setting-cell';
import { SettingsSection } from '@/components/ui/settings/settings-section';
import { useTabBarStyle } from '@/store/use-tab-bar-style';
import { MaxContentWidth } from '@/tamagui.config';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, useTheme } from 'tamagui';

const TAB_BAR_OPTIONS = [
  { style: 'native', label: 'nativeNavigationBar' },
  { style: 'custom', label: 'customNavigationBar' },
] as const;

export default function AppearanceScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const style = useTabBarStyle((state) => state.style);
  const setStyle = useTabBarStyle((state) => state.setStyle);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: theme.pageBackground?.val }}
      contentContainerStyle={{ alignItems: 'center', paddingBottom: insets.bottom + 24 }}
    >
      <YStack w="100%" maxW={MaxContentWidth} px="pageHorizontalInset" pt="18px" gap="6">
        <SettingsSection>
          <SettingCell icon={Moon} title={t('darkMode')} onPress={() => router.navigate('/dark-mode')} />
        </SettingsSection>
        <SettingsSection title={t('navigationBarStyle')}>
          {TAB_BAR_OPTIONS.map((option, index) => (
            <SettingCell
              key={option.style}
              title={t(option.label)}
              rightAccessory={style === option.style && <Check size={20} color="primary" />}
              showDivider={index < TAB_BAR_OPTIONS.length - 1}
              accessibilityRole="radio"
              accessibilityState={{ checked: style === option.style }}
              onPress={() => setStyle(option.style)}
            />
          ))}
        </SettingsSection>
      </YStack>
    </ScrollView>
  );
}
