import { SettingCell } from '@/components/ui/settings/setting-cell';
import { SettingsSection } from '@/components/ui/settings/settings-section';
import { useAppUpdateManager } from '@/hooks/use-app-update-manager';
import { translateMessage, type TranslationMessage } from '@/i18n/messages';
import {
  areAppUpdatesEnabled,
  getBinaryUpdateDisplayVersion,
  getCurrentAppDisplayVersion,
  getCurrentAppVersionInfo,
} from '@/services/app-update';
import { MaxContentWidth } from '@/tamagui.config';
import { CircleUserRound, Github, Globe2, Palette, RefreshCw, Scale } from '@tamagui/lucide-icons-2';
import * as Linking from 'expo-linking';
import { router, Stack } from 'expo-router';
import { HeaderTitle } from 'expo-router/react-navigation';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, useTheme } from 'tamagui';

const externalLinks: {
  title: TranslationMessage;
  description?: TranslationMessage;
  value: string | TranslationMessage;
  url: string;
  appUrl?: string;
  icon: typeof Github;
}[] = [
  {
    title: { key: 'projectHomepage', defaultValue: '项目主页' },
    value: 'GitHub',
    url: 'https://github.com/boiboif/anitabi-app',
    icon: Github,
  },
  {
    title: { key: 'authorHomepage', defaultValue: '作者主页' },
    value: { key: 'bilibili', defaultValue: '哔哩哔哩' },
    url: 'https://space.bilibili.com/1519338',
    appUrl: 'bilibili://space/1519338',
    icon: CircleUserRound,
  },
  {
    title: { key: 'dataSource', defaultValue: '数据来源' },
    value: 'anitabi.cn',
    url: 'https://anitabi.cn',
    icon: Globe2,
  },
  {
    title: { key: 'colorComparisonGenerator', defaultValue: '调色对比生成器' },
    description: {
      key: 'applyTheToneAndColorsOfAnAnimeFrameToARealWorldPhoto',
      defaultValue: '提取动画截图的影调与配色，套用到实景照片',
    },
    value: '',
    url: 'https://compose.anitabi.cn/',
    icon: Palette,
  },
];

export default function AboutScreen() {
  const { t } = useTranslation();
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();
  const appUpdates = useAppUpdateManager();
  const titlePresses = useRef({ count: 0, lastPressedAt: 0 });
  const versionInfo = getCurrentAppVersionInfo();
  const versionSource = {
    embedded: t('versionSourceEmbedded', { defaultValue: '整包内置' }),
    'hot-update': t('versionSourceHotUpdate', { defaultValue: '热更新' }),
    emergency: t('versionSourceEmergency', { defaultValue: '紧急回退至整包' }),
    development: t('versionSourceDevelopment', { defaultValue: '本地开发' }),
  }[versionInfo.source];
  const nativeVersion = versionInfo.nativeVersion ?? t('unknown', { defaultValue: '未知' });
  const versionDetails = [
    t('currentVersionSource', { defaultValue: '运行来源：{{source}}', source: versionSource }),
    versionInfo.nativeBuild
      ? t('installedPackageVersionAndBuild', {
          defaultValue: '安装包：{{version}}（构建 {{build}}）',
          version: nativeVersion,
          build: versionInfo.nativeBuild,
        })
      : t('installedPackageVersion', { defaultValue: '安装包：{{version}}', version: nativeVersion }),
    versionInfo.updateId ? t('currentOtaUpdateId', { defaultValue: 'OTA ID：{{id}}', id: versionInfo.updateId }) : null,
  ]
    .filter(Boolean)
    .join('\n');

  const handleAboutTitlePress = () => {
    const now = Date.now();
    const count = now - titlePresses.current.lastPressedAt > 1000 ? 1 : titlePresses.current.count + 1;
    titlePresses.current = { count, lastPressedAt: now };
    if (count < 5) return;

    titlePresses.current = { count: 0, lastPressedAt: 0 };
    Alert.alert(
      t('about', { defaultValue: '关于' }),
      [
        t('currentVersionVVersion', { defaultValue: '当前版本：v{{version}}', version: versionInfo.displayVersion }),
        versionDetails,
      ].join('\n'),
    );
  };

  const contentPlatformStyle = Platform.select({
    android: {
      paddingLeft: safeAreaInsets.left,
      paddingRight: safeAreaInsets.right,
      paddingBottom: safeAreaInsets.bottom + 24,
    },
    ios: {
      paddingBottom: safeAreaInsets.bottom + 24,
    },
  });

  const openExternalLink = async (url: string, appUrl?: string) => {
    const targetUrl = appUrl ?? url;

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

      Alert.alert(
        t('couldNotOpenLink', { defaultValue: '无法打开链接' }),
        t('pleaseTryAgainLaterWithPeriod', { defaultValue: '请稍后重试。' }),
      );
    }
  };

  const openAppUpdate = async () => {
    if (!areAppUpdatesEnabled()) {
      Alert.alert(
        t('developmentBuild', { defaultValue: '开发版本' }),
        t('appUpdatesAreDisabledInThisBuild', { defaultValue: '当前构建未启用应用更新。' }),
      );
      return;
    }

    if (appUpdates.binaryUpdate) {
      appUpdates.showBinaryUpdate();
      return;
    }

    try {
      const foundUpdate = await appUpdates.checkNow();
      if (!foundUpdate) {
        Alert.alert(
          t('upToDate', { defaultValue: '已是最新版本' }),
          t('theLatestVersionIsAlreadyInstalled', { defaultValue: '当前已安装最新版本。' }),
        );
      }
    } catch {
      Alert.alert(
        t('couldNotCheckForUpdates', { defaultValue: '检查更新失败' }),
        t('versionInformationIsTemporarilyUnavailablePleaseTryAgainLater', {
          defaultValue: '暂时无法获取最新版本信息，请稍后重试。',
        }),
      );
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: (props) => <HeaderTitle {...props} onPress={handleAboutTitlePress} />,
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: theme.pageBackground?.val }}
        contentContainerStyle={{
          flexDirection: 'row',
          justifyContent: 'center',
          paddingTop: 16,
          ...contentPlatformStyle,
        }}
      >
        <View bg="$pageBackground" width="100%" maxW={MaxContentWidth} flex={1} px="$pageHorizontalInset" gap="$5">
          <SettingsSection title={t('openSource', { defaultValue: '开源' })} hideTitleWhenSingle>
            <SettingCell
              icon={Scale}
              title={t('openSourceLicenses', { defaultValue: '开源许可证' })}
              description={t('viewLicensesForAnitabiAndThirdPartyDependencies', {
                defaultValue: '查看 Anitabi 与第三方依赖的许可证',
              })}
              onPress={() => router.navigate('/open-source-licenses')}
            />
          </SettingsSection>

          <SettingsSection title={t('externalLinks', { defaultValue: '外部链接' })} hideTitleWhenSingle>
            {externalLinks.map((link, index) => (
              <SettingCell
                key={link.title.key}
                icon={link.icon}
                title={translateMessage(t, link.title)}
                description={link.description ? translateMessage(t, link.description) : undefined}
                value={typeof link.value === 'string' ? link.value : translateMessage(t, link.value)}
                accessibilityRole="link"
                onPress={() => void openExternalLink(link.url, link.appUrl)}
                showDivider={index < externalLinks.length - 1}
              />
            ))}
          </SettingsSection>

          <SettingsSection title={t('appUpdates', { defaultValue: '应用更新' })} hideTitleWhenSingle>
            <SettingCell
              icon={RefreshCw}
              title={t('checkForUpdates', { defaultValue: '检查更新' })}
              description={
                appUpdates.binaryUpdate
                  ? t('newVersionVVersionAvailable', {
                      defaultValue: '发现新版本 v{{version}}',
                      version: getBinaryUpdateDisplayVersion(appUpdates.binaryUpdate),
                    })
                  : t('checkForTheLatestVersion', { defaultValue: '检查并获取最新版本' })
              }
              value={
                appUpdates.isChecking
                  ? t('checking', { defaultValue: '检查中...' })
                  : appUpdates.binaryUpdate
                    ? t('updateAvailable', { defaultValue: '可更新' })
                    : `v${getCurrentAppDisplayVersion()}`
              }
              disabled={appUpdates.isChecking}
              accessibilityState={{ disabled: appUpdates.isChecking }}
              onPress={() => void openAppUpdate()}
            />
          </SettingsSection>
        </View>
      </ScrollView>
    </>
  );
}
