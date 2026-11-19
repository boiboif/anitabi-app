import { Check } from '@/components/icons';
import { SettingCell } from '@/components/ui/settings/setting-cell';
import { SettingsSection } from '@/components/ui/settings/settings-section';
import { ThemeSwitch } from '@/components/ui/theme-switch';
import { useMapStylePreference } from '@/store/use-map-style-preference';
import { useThemePreference } from '@/store/use-theme-preference';
import { MaxContentWidth } from '@/tamagui.config';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, useTheme } from 'tamagui';

const THEME_OPTIONS = [
  { preference: 'system', label: 'followSystem' },
  { preference: 'light', label: 'light' },
  { preference: 'dark', label: 'dark' },
] as const;

export default function DarkModeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const preference = useThemePreference((state) => state.preference);
  const setPreference = useThemePreference((state) => state.setPreference);
  const mapStyleFollowsTheme = useMapStylePreference((state) => state.followsTheme);
  const setMapStyleFollowsTheme = useMapStylePreference((state) => state.setFollowsTheme);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: theme.pageBackground?.val }}
      contentContainerStyle={{ alignItems: 'center', paddingBottom: insets.bottom + 24 }}
    >
      <YStack w="100%" maxW={MaxContentWidth} px="pageHorizontalInset" pt="18px" gap="6">
        <SettingsSection>
          {THEME_OPTIONS.map((option, index) => (
            <SettingCell
              key={option.preference}
              title={t(option.label)}
              rightAccessory={preference === option.preference && <Check size={20} color="primary" />}
              showDivider={index < THEME_OPTIONS.length - 1}
              accessibilityRole="radio"
              accessibilityState={{ checked: preference === option.preference }}
              onPress={() => setPreference(option.preference)}
            />
          ))}
        </SettingsSection>
        <SettingsSection>
          <SettingCell
            title={t('mapStyleFollowsDarkMode')}
            description={t('useStreetMapInLightModeAndDarkMapInDarkMode')}
            rightAccessory={
              <ThemeSwitch
                accessibilityLabel={t('mapStyleFollowsDarkMode')}
                checked={mapStyleFollowsTheme}
                onCheckedChange={setMapStyleFollowsTheme}
              />
            }
          />
        </SettingsSection>
      </YStack>
    </ScrollView>
  );
}
