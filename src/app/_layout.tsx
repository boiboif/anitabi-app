import '@/global.css';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { TamaguiProvider } from 'tamagui';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { getDarkModeConfig, setDarkModeConfig } from '@/lib/storage';
import { ThemeOverrideContext } from '@/lib/theme-context';
import tamaguiConfig from '@/tamagui.config';

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
    <ThemeOverrideContext.Provider value={{ theme, setTheme }}>
      <ThemeProvider value={theme === 'dark' ? DarkTheme : DefaultTheme}>
        <TamaguiProvider config={tamaguiConfig} defaultTheme={theme}>
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
        </TamaguiProvider>
      </ThemeProvider>
    </ThemeOverrideContext.Provider>
  );
}
