import { SettingCell } from '@/components/setting-cell';
import { useAppUpdateManager } from '@/hooks/use-app-update-manager';
import { getBinaryUpdateDisplayVersion, getCurrentAppDisplayVersion } from '@/services/app-update';
import { BottomTabInset, MaxContentWidth } from '@/tamagui.config';
import { Database, Info, Moon } from '@tamagui/lucide-icons-2';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, Platform, ScrollView } from 'react-native';
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
  const appUpdates = useAppUpdateManager();
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

  const openAppUpdate = async () => {
    if (appUpdates.binaryUpdate) {
      appUpdates.showBinaryUpdate();
      return;
    }

    try {
      const update = await appUpdates.checkNow();
      if (!update) Alert.alert('已是最新版本', '当前已安装最新版本。');
    } catch {
      Alert.alert('检查更新失败', '暂时无法获取最新版本信息，请稍后重试。');
    }
  };

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
            onPress={() => router.navigate('/dark-mode')}
          />
        </SettingsSection>

        <SettingsSection title="其他">
          <SettingCell
            icon={Database}
            title="清理存储空间"
            description="清理地图数据、图片缓存和收藏"
            onPress={() => router.navigate('/clear-cache')}
            showDivider
          />
          <SettingCell
            icon={Info}
            title="Anitabi"
            description={
              appUpdates.binaryUpdate
                ? `发现新版本 v${getBinaryUpdateDisplayVersion(appUpdates.binaryUpdate)}`
                : '点击检查更新'
            }
            value={
              appUpdates.isChecking
                ? '检查中...'
                : appUpdates.binaryUpdate
                  ? '可更新'
                  : `v${getCurrentAppDisplayVersion()}`
            }
            disabled={appUpdates.isChecking}
            accessibilityState={{ disabled: appUpdates.isChecking }}
            onPress={() => void openAppUpdate()}
            rightAccessory={false}
          />
        </SettingsSection>
      </View>
    </ScrollView>
  );
}
