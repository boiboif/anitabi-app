import * as Device from 'expo-device';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, View } from 'tamagui';

import { AnimatedIcon } from '@/components/animated-icon';
import { HintRow } from '@/components/hint-row';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth } from '@/tamagui.config';

const codeProps = {
  fontFamily: Platform.select({ ios: 'ui-monospace', android: 'monospace', default: 'monospace' }),
  fontWeight: Platform.select({ android: 700 }) ?? 500,
  fontSize: 12,
} as any;

function getDevMenuHint() {
  if (Platform.OS === 'web') {
    return (
      <Text fontSize={14} lineHeight={20} fontWeight="500">
        use browser devtools
      </Text>
    );
  }
  if (Device.isDevice) {
    return (
      <Text fontSize={14} lineHeight={20} fontWeight="500">
        shake device or press <Text {...codeProps}>m</Text> in terminal
      </Text>
    );
  }
  const shortcut = Platform.OS === 'android' ? 'cmd+m (or ctrl+m)' : 'cmd+d';
  return (
    <Text fontSize={14} lineHeight={20} fontWeight="500">
      press <Text {...codeProps}>{shortcut}</Text>
    </Text>
  );
}

export default function HomeScreen() {
  return (
    <View bg="$background" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View bg="$background" style={styles.heroSection}>
          <AnimatedIcon />
          <Text fontSize={48} fontWeight="600" lineHeight={52} style={styles.title}>
            Welcome to&nbsp;Expo
          </Text>
        </View>

        <View>
          <Text {...codeProps} style={styles.code} color="$primary">
            get started
          </Text>
        </View>

        <View bg="$color3" style={styles.stepContainer}>
          <HintRow title="Try editing" hint={<Text {...codeProps}>src/app/index.tsx</Text>} />
          <HintRow title="Dev tools" hint={getDevMenuHint()} />
          <HintRow title="Fresh start" hint={<Text {...codeProps}>npm run reset-project</Text>} />
        </View>

        {Platform.OS === 'web' && <WebBadge />}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 16,
    paddingBottom: BottomTabInset + 16,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: 24,
    gap: 24,
  },
  title: {
    textAlign: 'center',
  },
  code: {
    textTransform: 'uppercase',
  },
  stepContainer: {
    gap: 16,
    alignSelf: 'stretch',
    paddingHorizontal: 16,
    paddingVertical: 24,
    borderRadius: 24,
  },
});
