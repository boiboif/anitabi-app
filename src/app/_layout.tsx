import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppUpdateOverlay } from '@/components/app-update-overlay';
import { useAppUpdates } from '@/hooks/use-app-updates';
import '@/global.css';
import { Sentry, sentryNavigationIntegration } from '@/services/sentry';
import { useMapData } from '@/store/use-map-data';
import { useThemePreference } from '@/store/use-theme-preference';
import tamaguiConfig from '@/tamagui.config';
import { TrueSheetProvider } from '@lodev09/react-native-true-sheet';
import Toast from '@modules/toaster';
import Mapbox from '@rnmapbox/maps';
import Constants from 'expo-constants';
import {
  DarkTheme,
  DefaultTheme,
  ErrorBoundary as ExpoErrorBoundary,
  type ErrorBoundaryProps,
  Stack,
  ThemeProvider,
  useNavigationContainerRef,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Toaster } from 'sonner-native';
import { TamaguiProvider } from 'tamagui';

Toast.config({
  defaultOptions: {
    position: 'center',
  },
});

const MAPBOX_ACCESS_TOKEN = Constants.expoConfig?.extra?.mapboxAccessToken as string | undefined;

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
          <ThemeProvider value={theme === 'dark' ? DarkTheme : DefaultTheme}>
            <TrueSheetProvider>
              <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
              <AnimatedSplashOverlay />
              <AppUpdateOverlay manager={appUpdates} />
              <Stack screenOptions={{ headerShown: false, animation: 'ios_from_right', orientation: 'portrait' }}>
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
                  name="clear-cache"
                  options={{
                    headerShown: true,
                    headerTitleAlign: 'center',
                    title: '清理存储空间',
                  }}
                />
                <Stack.Screen
                  name="comparison-camera"
                  options={{
                    gestureEnabled: false,
                  }}
                />
              </Stack>
              <Toaster enableStacking position="center" duration={1000} />
            </TrueSheetProvider>
          </ThemeProvider>
        </TamaguiProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(RootLayout);
