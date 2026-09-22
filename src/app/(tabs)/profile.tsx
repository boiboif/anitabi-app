import { SettingCell } from '@/components/setting-cell';
import { SettingsSection } from '@/components/settings-section';
import { clearAppCache } from '@/lib/app-cache';
import { getCurrentAppDisplayVersion } from '@/services/app-update';
import { BottomTabInset, MaxContentWidth, TopLevelPageTopPadding } from '@/tamagui.config';
import { CalendarDays, HardDrive, Info, Languages, Moon } from '@tamagui/lucide-icons-2';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, useTheme } from 'tamagui';

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();
  const [isClearingCache, setIsClearingCache] = useState(false);
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + 16,
  };

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top + TopLevelPageTopPadding,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: TopLevelPageTopPadding,
      paddingBottom: 24,
    },
    ios: {
      paddingTop: TopLevelPageTopPadding,
      paddingBottom: insets.bottom,
    },
  });

  const clearCache = async () => {
    setIsClearingCache(true);
    try {
      await clearAppCache();
      Alert.alert(
        t('cacheCleared', { defaultValue: '清除完成' }),
        t('mapDataAndImageCacheHaveBeenCleared', { defaultValue: '地图数据和图片缓存已清除。' }),
      );
    } catch {
      Alert.alert(
        t('couldNotClearCache', { defaultValue: '清除失败' }),
        t('someCachedDataCouldNotBeClearedPleaseTryAgainLater', { defaultValue: '部分缓存未能清除，请稍后重试。' }),
      );
    } finally {
      setIsClearingCache(false);
    }
  };

  const confirmClearCache = () => {
    if (isClearingCache) return;
    Alert.alert(
      t('clearCache', { defaultValue: '清除缓存' }),
      t('thisClearsMapDataAndImagesWithoutDeletingFavoritesOrPilgrimagePlans', {
        defaultValue: '将清除地图数据和图片缓存，不会删除收藏与巡礼计划。',
      }),
      [
        { text: t('cancel', { defaultValue: '取消' }), style: 'cancel' },
        { text: t('clear', { defaultValue: '清除' }), style: 'destructive', onPress: () => void clearCache() },
      ],
    );
  };

  const languageLabel = i18n.resolvedLanguage?.startsWith('ja')
    ? t('japanese', { defaultValue: '日语' })
    : i18n.resolvedLanguage?.startsWith('en')
      ? t('english', { defaultValue: '英语' })
      : t('simplifiedChinese', { defaultValue: '简体中文' });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background?.val }}
      contentInset={insets}
      contentContainerStyle={{ flexDirection: 'row', justifyContent: 'center', ...contentPlatformStyle }}
    >
      <View bg="$background" width="100%" maxW={MaxContentWidth} flex={1} px="$4" gap="$5">
        <Text fontSize="$heading" lineHeight={30} fontWeight="700" color="$color12" px="$1" mb="$1">
          {t('me', { defaultValue: '我的' })}
        </Text>

        <SettingsSection title={t('pilgrimage', { defaultValue: '巡礼' })}>
          <SettingCell
            icon={CalendarDays}
            title={t('pilgrimagePlans', { defaultValue: '巡礼计划' })}
            description={t('arrangeLocationsAndTrackYourProgress', { defaultValue: '安排点位顺序，记录巡礼进度' })}
            onPress={() => router.navigate('/plan' as never)}
          />
        </SettingsSection>

        <SettingsSection title={t('appAndAppearance', { defaultValue: '应用与外观' })}>
          <SettingCell
            icon={Moon}
            title={t('darkMode', { defaultValue: '深色模式' })}
            description={t('setTheAppAppearance', { defaultValue: '设置应用显示外观' })}
            onPress={() => router.navigate('/dark-mode')}
            showDivider
          />
          <SettingCell
            icon={Languages}
            title={t('language', { defaultValue: '语言' })}
            description={t('setTheAppDisplayLanguage', { defaultValue: '设置应用显示语言' })}
            value={languageLabel}
            onPress={() => router.navigate('/language')}
          />
        </SettingsSection>

        <SettingsSection title={t('other', { defaultValue: '其他' })}>
          <SettingCell
            icon={HardDrive}
            title={t('clearCache', { defaultValue: '清除缓存' })}
            description={t('clearMapDataAndImageCache', { defaultValue: '清除地图数据和图片缓存' })}
            value={isClearingCache ? t('clearing', { defaultValue: '清除中...' }) : undefined}
            disabled={isClearingCache}
            accessibilityState={{ disabled: isClearingCache }}
            onPress={confirmClearCache}
            showDivider
          />
          <SettingCell
            icon={Info}
            title={t('about', { defaultValue: '关于' })}
            value={`v${getCurrentAppDisplayVersion()}`}
            onPress={() => router.navigate('/about')}
          />
        </SettingsSection>
      </View>
    </ScrollView>
  );
}
