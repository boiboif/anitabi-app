import { SettingCell } from '@/components/setting-cell';
import { BottomTabInset, MaxContentWidth } from '@/tamagui.config';
import { Database, Info, Moon } from '@tamagui/lucide-icons-2';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, useTheme } from 'tamagui';

type SettingsSectionProps = {
  title: string;
  children: ReactNode;
};

function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <View gap="$2.5">
      <Text fontSize={13} lineHeight={18} fontWeight="600" color="$color11" px="$1">
        {title}
      </Text>
      <View bg="$color2" rounded="$2" overflow="hidden" style={{ borderCurve: 'continuous' }}>
        {children}
      </View>
    </View>
  );
}

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
      paddingTop: 40,
      paddingBottom: 24,
    },
    ios: {
      paddingTop: 28,
      paddingBottom: insets.bottom,
    },
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background?.val }}
      contentInset={insets}
      contentContainerStyle={{ flexDirection: 'row', justifyContent: 'center', ...contentPlatformStyle }}
    >
      <View bg="$background" width="100%" maxW={MaxContentWidth} flex={1} px="$5" gap="$5">
        <Text fontSize={22} lineHeight={30} fontWeight="700" color="$color12" px="$1" mb="$1">
          我的
        </Text>

        <SettingsSection title="应用与外观">
          <SettingCell
            icon={Moon}
            title="深色模式"
            description="设置应用显示外观"
            onPress={() => router.push('/dark-mode')}
          />
        </SettingsSection>

        <SettingsSection title="其他">
          <SettingCell
            icon={Database}
            title="清理存储空间"
            description="清理地图数据、图片缓存和收藏"
            onPress={() => router.push('/clear-cache')}
            showDivider
          />
          <SettingCell icon={Info} title="Anitabi" description="动漫巡礼地图" value={Constants.expoConfig?.version} />
        </SettingsSection>
      </View>
    </ScrollView>
  );
}
