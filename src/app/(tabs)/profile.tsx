import { SettingCell } from '@/components/setting-cell';
import { SettingsSection } from '@/components/settings-section';
import { clearAppCache } from '@/lib/app-cache';
import { getCurrentAppDisplayVersion } from '@/services/app-update';
import { BottomTabInset, MaxContentWidth } from '@/tamagui.config';
import { CalendarDays, HardDrive, Info, Moon } from '@tamagui/lucide-icons-2';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, useTheme } from 'tamagui';

export default function ProfileScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();
  const [isClearingCache, setIsClearingCache] = useState(false);
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

  const clearCache = async () => {
    setIsClearingCache(true);
    try {
      await clearAppCache();
      Alert.alert('清除完成', '地图数据和图片缓存已清除。');
    } catch {
      Alert.alert('清除失败', '部分缓存未能清除，请稍后重试。');
    } finally {
      setIsClearingCache(false);
    }
  };

  const confirmClearCache = () => {
    if (isClearingCache) return;
    Alert.alert('清除缓存', '将清除地图数据和图片缓存，不会删除收藏与巡礼计划。', [
      { text: '取消', style: 'cancel' },
      { text: '清除', style: 'destructive', onPress: () => void clearCache() },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background?.val }}
      contentInset={insets}
      contentContainerStyle={{ flexDirection: 'row', justifyContent: 'center', ...contentPlatformStyle }}
    >
      <View bg="$background" width="100%" maxW={MaxContentWidth} flex={1} px="$4" gap="$5">
        <Text fontSize="$heading" lineHeight={30} fontWeight="700" color="$color12" px="$1" mb="$1">
          我的
        </Text>

        <SettingsSection title="巡礼">
          <SettingCell
            icon={CalendarDays}
            title="巡礼计划"
            description="安排点位顺序，记录巡礼进度"
            onPress={() => router.navigate('/plans')}
          />
        </SettingsSection>

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
            icon={HardDrive}
            title="清除缓存"
            description="清除地图数据和图片缓存"
            value={isClearingCache ? '清除中...' : undefined}
            disabled={isClearingCache}
            accessibilityState={{ disabled: isClearingCache }}
            onPress={confirmClearCache}
            showDivider
          />
          <SettingCell
            icon={Info}
            title="关于"
            value={`v${getCurrentAppDisplayVersion()}`}
            onPress={() => router.navigate('/about')}
          />
        </SettingsSection>
      </View>
    </ScrollView>
  );
}
