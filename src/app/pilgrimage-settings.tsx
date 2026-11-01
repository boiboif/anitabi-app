import { SettingCell } from '@/components/ui/settings/setting-cell';
import { SettingsSection } from '@/components/ui/settings/settings-section';
import { getAvailableNavigationMaps } from '@/lib/pilgrimage-navigation';
import { usePilgrimagePreferences } from '@/store/use-pilgrimage-preferences';
import { MaxContentWidth } from '@/tamagui.config';
import { Check } from '@tamagui/lucide-icons-2';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, YStack, useTheme } from 'tamagui';

export default function PilgrimageSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigationMap = usePilgrimagePreferences((state) => state.navigationMap);
  const setNavigationMap = usePilgrimagePreferences((state) => state.setNavigationMap);
  const maps = getAvailableNavigationMaps(Platform.OS);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: theme.pageBackground?.val }}
      contentContainerStyle={{ alignItems: 'center', paddingBottom: insets.bottom + 24 }}
    >
      <YStack width="100%" maxW={MaxContentWidth} px="$pageHorizontalInset" pt="$4" gap="$5">
        <YStack gap="$2">
          <SettingsSection title={t('navigationMap')}>
            {maps.map((map, index) => (
              <SettingCell
                key={map}
                title={t(map)}
                rightAccessory={navigationMap === map ? <Check size={20} color="$primary" /> : <YStack width={20} />}
                showDivider={index < maps.length - 1}
                accessibilityRole="radio"
                accessibilityState={{ checked: navigationMap === map }}
                onPress={() => setNavigationMap(map)}
              />
            ))}
          </SettingsSection>
          <Text fontSize="$footnote" lineHeight={18} color="$color11" px="$1">
            {t('navigationMapDescription')}
          </Text>
        </YStack>
      </YStack>
    </ScrollView>
  );
}
