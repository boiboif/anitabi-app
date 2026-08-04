import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack, useTheme, useThemeName } from 'tamagui';

import { ThemeSwitch } from '@/components/theme-switch';

import { useThemePreference } from '@/store/use-theme-preference';
import { BottomTabInset, MaxContentWidth } from '@/tamagui.config';

export default function DarkModeScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();
  const themeName = useThemeName();
  const preference = useThemePreference((state) => state.preference);
  const setPreference = useThemePreference((state) => state.setPreference);

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
          <XStack
            bg="$color2"
            px="$3"
            py="$2.5"
            rounded="$2"
            style={{ justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text color="$color" fontSize={16} lineHeight={24} fontWeight="500">
              跟随系统
            </Text>
            <ThemeSwitch checked={followSystem} onCheckedChange={handleFollowSystemChange} />
          </XStack>

          {!followSystem && (
            <XStack
              bg="$color2"
              px="$3"
              py="$2.5"
              rounded="$2"
              style={{ justifyContent: 'space-between', alignItems: 'center' }}
            >
              <Text color="$color" fontSize={16} lineHeight={24} fontWeight="500">
                深色模式
              </Text>
              <ThemeSwitch checked={isDark} onCheckedChange={toggleDarkMode} />
            </XStack>
          )}
        </YStack>
      </View>
    </ScrollView>
  );
}
