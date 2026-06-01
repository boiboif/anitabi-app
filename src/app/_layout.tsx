import { AnimatedSplashOverlay } from '@/components/animated-icon';
import '@/global.css';
import { getDarkModeConfig, setDarkModeConfig } from '@/lib/storage';
import { ThemeOverrideContext } from '@/lib/theme-context';
import tamaguiConfig from '@/tamagui.config';
import Mapbox from '@rnmapbox/maps';
import Constants from 'expo-constants';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Toaster } from 'sonner-native';
import { TamaguiProvider } from 'tamagui';

const MAPBOX_ACCESS_TOKEN = Constants.expoConfig?.extra?.mapboxAccessToken as string | undefined;

if (MAPBOX_ACCESS_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
} else {
  console.warn('Missing EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN in .env');
}

function resolveTheme(
  colorScheme: ReturnType<typeof useColorScheme>,
  config: ReturnType<typeof getDarkModeConfig>,
): 'light' | 'dark' {
  return config.followSystem ? (colorScheme === 'dark' ? 'dark' : 'light') : config.manualTheme;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const config = getDarkModeConfig();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => resolveTheme(colorScheme, config));

  // Sync with system when followSystem is enabled
  useEffect(() => {
    const cfg = getDarkModeConfig();
    if (cfg.followSystem && colorScheme) {
      const next = colorScheme === 'dark' ? 'dark' : 'light';
      setTheme(next);
      setDarkModeConfig({ followSystem: true, manualTheme: next });
    }
  }, [colorScheme]);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeOverrideContext.Provider value={{ theme, setTheme }}>
          <TamaguiProvider config={tamaguiConfig} defaultTheme={theme}>
            <ThemeProvider value={theme === 'dark' ? DarkTheme : DefaultTheme}>
              <AnimatedSplashOverlay />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="dark-mode"
                  options={{
                    presentation: 'modal',
                    animation: 'ios_from_right',
                    headerShown: true,
                    headerTitleAlign: 'center',
                    title: '深色模式',
                  }}
                />
              </Stack>
              <Toaster enableStacking position="center" duration={1000} />
            </ThemeProvider>
          </TamaguiProvider>
        </ThemeOverrideContext.Provider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
