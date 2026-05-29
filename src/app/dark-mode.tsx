import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, useTheme } from 'tamagui';

import { ThemeSwitch } from '@/components/theme-switch';

import type { DarkModeConfig } from '@/lib/storage';
import { getDarkModeConfig, setDarkModeConfig } from '@/lib/storage';
import { useThemeOverride } from '@/lib/theme-context';
import { BottomTabInset, MaxContentWidth } from '@/tamagui.config';

export default function DarkModeScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();
  const { theme: currentTheme, setTheme } = useThemeOverride();
  const systemColorScheme = useColorScheme();

  const [followSystem, setFollowSystem] = useState(() => getDarkModeConfig().followSystem);
  const isDark = currentTheme === 'dark';
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + 16,
  };

  // Sync when followSystem or system color scheme changes
  useEffect(() => {
    if (followSystem && systemColorScheme) {
      setTheme(systemColorScheme === 'dark' ? 'dark' : 'light');
    }
  }, [followSystem, systemColorScheme, setTheme]);

  const handleFollowSystemChange = (value: boolean) => {
    setFollowSystem(value);
    if (value && systemColorScheme) {
      const next = systemColorScheme === 'dark' ? 'dark' : 'light';
      setTheme(next);
      setDarkModeConfig({ followSystem: true, manualTheme: next });
    } else {
      setDarkModeConfig({ followSystem: false, manualTheme: currentTheme });
    }
  };

  const toggleDarkMode = (value: boolean) => {
    const next = value ? 'dark' : 'light';
    setTheme(next);
    setDarkModeConfig({ followSystem: false, manualTheme: next });
  };

  // Keep persisted config in sync
  useEffect(() => {
    const config: DarkModeConfig = getDarkModeConfig();
    if (!followSystem && config.manualTheme !== currentTheme) {
      setDarkModeConfig({ followSystem: false, manualTheme: currentTheme });
    }
  }, [isDark, followSystem, currentTheme]);

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: 0,
      paddingBottom: 24,
    },
  });

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background?.val }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
    >
      <View bg="$background" style={styles.container}>
        <View bg="$background" style={styles.section}>
          <View bg="$color2" style={styles.settingRow}>
            <Text color="$color" fontSize={16} lineHeight={24} fontWeight="500">
              跟随系统
            </Text>
            <ThemeSwitch checked={followSystem} onCheckedChange={handleFollowSystemChange} />
          </View>

          {!followSystem && (
            <View bg="$color2" style={styles.settingRow}>
              <Text color="$color" fontSize={16} lineHeight={24} fontWeight="500">
                深色模式
              </Text>
              <ThemeSwitch checked={isDark} onCheckedChange={toggleDarkMode} />
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
  },
  backText: {
    alignSelf: 'flex-start',
  },
  section: {
    gap: 8,
    paddingHorizontal: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
