import { SettingCell } from '@/components/setting-cell';
import { SettingsSection } from '@/components/settings-section';
import { useAppUpdateManager } from '@/hooks/use-app-update-manager';
import {
  areAppUpdatesEnabled,
  getBinaryUpdateDisplayVersion,
  getCurrentAppDisplayVersion,
} from '@/services/app-update';
import { MaxContentWidth } from '@/tamagui.config';
import { CircleUserRound, Github, Globe2, Palette, RefreshCw, Scale } from '@tamagui/lucide-icons-2';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Alert, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, useTheme } from 'tamagui';

const externalLinks = [
  {
    title: '项目主页',
    description: undefined,
    value: 'GitHub',
    url: 'https://github.com/boiboif/anitabi-app',
    icon: Github,
  },
  {
    title: '作者主页',
    description: undefined,
    value: '哔哩哔哩',
    url: 'https://space.bilibili.com/1519338',
    appUrl: 'bilibili://space/1519338',
    icon: CircleUserRound,
  },
  {
    title: '数据来源',
    description: undefined,
    value: 'anitabi.cn',
    url: 'https://anitabi.cn',
    icon: Globe2,
  },
  {
    title: '调色对比生成器',
    description: '提取动画截图的影调与配色，套用到实景照片',
    value: '',
    url: 'https://compose.anitabi.cn/',
    icon: Palette,
  },
];

export default function AboutScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();
  const appUpdates = useAppUpdateManager();

  const contentPlatformStyle = Platform.select({
    android: {
      paddingLeft: safeAreaInsets.left,
      paddingRight: safeAreaInsets.right,
      paddingBottom: safeAreaInsets.bottom + 24,
    },
    ios: {
      paddingBottom: safeAreaInsets.bottom + 24,
    },
    web: {
      paddingBottom: 24,
    },
  });

  const openExternalLink = async (url: string, appUrl?: string) => {
    const targetUrl = Platform.OS === 'web' ? url : (appUrl ?? url);

    try {
      await Linking.openURL(targetUrl);
    } catch {
      if (targetUrl !== url) {
        try {
          await Linking.openURL(url);
          return;
        } catch {
          // Show the common error below when both the app link and web fallback fail.
        }
      }

      Alert.alert('无法打开链接', '请稍后重试。');
    }
  };

  const openAppUpdate = async () => {
    if (!areAppUpdatesEnabled()) {
      Alert.alert('开发版本', '当前构建未启用应用更新。');
      return;
    }

    if (appUpdates.binaryUpdate) {
      appUpdates.showBinaryUpdate();
      return;
    }

    try {
      const foundUpdate = await appUpdates.checkNow();
      if (!foundUpdate) {
        Alert.alert('已是最新版本', '当前已安装最新版本。');
      }
    } catch {
      Alert.alert('检查更新失败', '暂时无法获取最新版本信息，请稍后重试。');
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: theme.background?.val }}
      contentContainerStyle={{
        flexDirection: 'row',
        justifyContent: 'center',
        paddingTop: 16,
        ...contentPlatformStyle,
      }}
    >
      <View bg="$background" width="100%" maxW={MaxContentWidth} flex={1} px="$4" gap="$5">
        <SettingsSection title="开源" hideTitleWhenSingle>
          <SettingCell
            icon={Scale}
            title="开源许可证"
            description="查看 Anitabi 与第三方依赖的许可证"
            onPress={() => router.navigate('/open-source-licenses')}
          />
        </SettingsSection>

        <SettingsSection title="外部链接" hideTitleWhenSingle>
          {externalLinks.map((link, index) => (
            <SettingCell
              key={link.title}
              icon={link.icon}
              title={link.title}
              description={link.description}
              value={link.value}
              accessibilityRole="link"
              onPress={() => void openExternalLink(link.url, link.appUrl)}
              showDivider={index < externalLinks.length - 1}
            />
          ))}
        </SettingsSection>

        <SettingsSection title="应用更新" hideTitleWhenSingle>
          <SettingCell
            icon={RefreshCw}
            title="检查更新"
            description={
              appUpdates.binaryUpdate
                ? `发现新版本 v${getBinaryUpdateDisplayVersion(appUpdates.binaryUpdate)}`
                : '检查并获取最新版本'
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
          />
        </SettingsSection>
      </View>
    </ScrollView>
  );
}
