import { version } from 'expo/package.json';
import { Image } from 'expo-image';
import { Platform, StyleSheet, useColorScheme } from 'react-native';

import { Text, View } from 'tamagui';

export function WebBadge() {
  const colorScheme = useColorScheme();

  return (
    <View bg="$background" style={styles.container}>
      <Text fontFamily={Platform.select({ios:'ui-monospace',android:'monospace',default:'monospace'})} fontWeight={(Platform.select({android:700})??500)} fontSize={12} color="$color11" style={styles.versionText}>
        v{version}
      </Text>
      <Image
        source={
          colorScheme === 'dark'
            ? require('@/assets/images/expo-badge-white.png')
            : require('@/assets/images/expo-badge.png')
        }
        style={styles.badgeImage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  versionText: {
    textAlign: 'center',
  },
  badgeImage: {
    width: 123,
    aspectRatio: 123 / 24,
  },
});