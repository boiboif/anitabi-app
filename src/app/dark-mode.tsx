import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack, styled, useTheme, useThemeName } from 'tamagui';
import { useTranslation } from 'react-i18next';

import { ThemeSwitch } from '@/components/theme-switch';

import { useMapStylePreference } from '@/store/use-map-style-preference';
import { useThemePreference } from '@/store/use-theme-preference';
import { BottomTabInset, MaxContentWidth } from '@/tamagui.config';

const SettingTitle = styled(Text, {
  fontFamily: '$body',
  color: '$color',
  fontSize: '$body',
  lineHeight: 24,
  fontWeight: '500',
});

export default function DarkModeScreen() {
  const { t } = useTranslation();
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();
  const themeName = useThemeName();
  const preference = useThemePreference((state) => state.preference);
  const setPreference = useThemePreference((state) => state.setPreference);
  const mapStyleFollowsTheme = useMapStylePreference((state) => state.followsTheme);
  const setMapStyleFollowsTheme = useMapStylePreference((state) => state.setFollowsTheme);

  const followSystem = preference === 'system';
  const currentTheme = themeName === 'dark' ? 'dark' : 'light';
  const isDark = currentTheme === 'dark';
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + 16,
  };

  const handleFollowSystemChange = (value: boolean) => {
    setPreference(value ? 'system' : currentTheme);
  };

  const toggleDarkMode = (value: boolean) => {
    setPreference(value ? 'dark' : 'light');
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background?.val }}
      contentInset={insets}
      contentContainerStyle={{ flexDirection: 'row', justifyContent: 'center' }}
    >
      <View bg="$background" width="100%" maxW={MaxContentWidth} flex={1}>
        <YStack bg="$background" gap="$1" px="$3" pt="$3">
          <XStack px="$3" py="$2.5" rounded="$2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <SettingTitle>
              {t('followSystem', { defaultValue: '跟随系统' })}
            </SettingTitle>
            <ThemeSwitch checked={followSystem} onCheckedChange={handleFollowSystemChange} />
          </XStack>

          {!followSystem && (
            <XStack px="$3" py="$2.5" rounded="$2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <SettingTitle>
                {t('darkMode', { defaultValue: '深色模式' })}
              </SettingTitle>
              <ThemeSwitch checked={isDark} onCheckedChange={toggleDarkMode} />
            </XStack>
          )}

          <XStack px="$3" py="$2.5" rounded="$2" items="center" justify="space-between" gap="$3">
            <YStack flex={1} gap="$0.5">
              <SettingTitle>
                {t('mapStyleFollowsDarkMode', { defaultValue: '地图跟随深色模式' })}
              </SettingTitle>
              <Text color="$color10" fontSize="$caption" lineHeight={18}>
                {t('useStreetMapInLightModeAndDarkMapInDarkMode', {
                  defaultValue: '浅色模式使用街道地图，深色模式使用深色地图',
                })}
              </Text>
            </YStack>
            <ThemeSwitch checked={mapStyleFollowsTheme} onCheckedChange={setMapStyleFollowsTheme} />
          </XStack>
        </YStack>
      </View>
    </ScrollView>
  );
}
