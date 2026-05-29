import { router } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, useTheme } from 'tamagui';

import { BottomTabInset, MaxContentWidth } from '@/tamagui.config';

export default function ProfileScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + 16,
  };

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: 64,
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
        <View bg="$background" style={styles.header}>
          <Text fontSize={32} lineHeight={44} fontWeight="600">我的</Text>
        </View>

        <View bg="$background" style={styles.section}>
          <Text fontSize={14} lineHeight={20} fontWeight="700" color="$color11" style={styles.sectionTitle}>
            设置
          </Text>

          <Pressable onPress={() => router.push('/dark-mode')} style={({ pressed }) => pressed && styles.pressed}>
            <View bg="$color2" style={styles.settingRow}>
              <Text color="$color" fontSize={16} lineHeight={24} fontWeight="500">深色模式</Text>
            </View>
          </Pressable>
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
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 64,
  },
  section: {
    gap: 8,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    paddingLeft: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
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