import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppUpdateOverlay } from '@/components/app-update-overlay';
import PlanPickerProvider from '@/components/plan-picker-provider';
import '@/global.css';
import { AppUpdateManagerContext } from '@/hooks/use-app-update-manager';
import { useAppUpdates } from '@/hooks/use-app-updates';
import { Sentry, sentryNavigationIntegration } from '@/services/sentry';
import { useMapData } from '@/store/use-map-data';
import { useThemePreference } from '@/store/use-theme-preference';
import tamaguiConfig, { LightPageBackground } from '@/tamagui.config';
import { Toast } from '@boiboif/react-native-toast';
import { TrueSheetProvider } from '@lodev09/react-native-true-sheet';
import Mapbox from '@rnmapbox/maps';
import Constants from 'expo-constants';
import {
  DarkTheme,
  DefaultTheme,
  ErrorBoundary as ExpoErrorBoundary,
  Stack,
  ThemeProvider,
  useNavigationContainerRef,
  type ErrorBoundaryProps,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider } from 'tamagui';

Toast.config({
  defaultOptions: {
    position: 'center',
  },
});

const MAPBOX_ACCESS_TOKEN = Constants.expoConfig?.extra?.mapboxAccessToken as string | undefined;
const LightNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: LightPageBackground,
    card: LightPageBackground,
  },
};

if (MAPBOX_ACCESS_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
} else {
  console.warn('Missing EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN in .env');
}

function resolveTheme(
  colorScheme: ReturnType<typeof useColorScheme>,
  preference: 'system' | 'light' | 'dark',
): 'light' | 'dark' {
  return preference === 'system' ? (colorScheme === 'dark' ? 'dark' : 'light') : preference;
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return <ExpoErrorBoundary error={error} retry={retry} />;
}

function RootLayout() {
  const colorScheme = useColorScheme();
  const preference = useThemePreference((state) => state.preference);
  const theme = resolveTheme(colorScheme, preference);
  const initializeMapData = useMapData((state) => state.initialize);
  const navigationContainerRef = useNavigationContainerRef();
  const appUpdates = useAppUpdates();

  useEffect(() => {
    sentryNavigationIntegration.registerNavigationContainer(navigationContainerRef);
  }, [navigationContainerRef]);

  useEffect(() => {
    void initializeMapData();
  }, [initializeMapData]);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <TamaguiProvider config={tamaguiConfig} defaultTheme={theme}>
          <ThemeProvider value={theme === 'dark' ? DarkTheme : LightNavigationTheme}>
            <TrueSheetProvider>
              <PlanPickerProvider>
                <AppUpdateManagerContext.Provider value={appUpdates}>
                  <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
                  <AnimatedSplashOverlay />
                  <AppUpdateOverlay manager={appUpdates} />
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      animation: 'ios_from_right',
                      orientation: 'portrait',
                    }}
                  >
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen
                      name="dark-mode"
                      options={{
                        headerShown: true,
                        headerTitleAlign: 'center',
                        title: '深色模式',
                      }}
                    />
                    <Stack.Screen
                      name="about"
                      options={{
                        headerShown: true,
                        headerTitleAlign: 'center',
                        title: '关于',
                      }}
                    />
                    <Stack.Screen
                      name="open-source-licenses"
                      options={{
                        headerShown: true,
                        headerTitleAlign: 'center',
                        title: '许可',
                      }}
                    />
                    <Stack.Screen
                      name="open-source-license"
                      options={{
                        headerShown: true,
                        headerTitleAlign: 'center',
                        title: '许可证详情',
                      }}
                    />
                    <Stack.Screen
                      name="comparison-camera"
                      options={{
                        gestureEnabled: false,
                      }}
                    />
                  </Stack>
                </AppUpdateManagerContext.Provider>
              </PlanPickerProvider>
            </TrueSheetProvider>
          </ThemeProvider>
        </TamaguiProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(RootLayout);
