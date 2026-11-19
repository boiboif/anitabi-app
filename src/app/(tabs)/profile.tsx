import { useAppTabBarInset } from '@/components/app-tab-bar-inset';
import { SettingCell } from '@/components/ui/settings/setting-cell';
import { SettingsSection } from '@/components/ui/settings/settings-section';
import { clearAppCache } from '@/lib/app-cache';
import { getCurrentAppDisplayVersion } from '@/services/app-update';
import { BottomTabInset, MaxContentWidth, TopLevelPageTopPadding } from '@/tamagui.config';
import { BookImage, DatabaseBackup, HardDrive, Info, Languages, Palette, Settings2 } from '@tamagui/lucide-icons-2';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View } from 'tamagui';

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const safeAreaInsets = useSafeAreaInsets();
  const paddingTop = Platform.select({
    android: safeAreaInsets.top + TopLevelPageTopPadding,
    default: Math.max(safeAreaInsets.top, TopLevelPageTopPadding),
  });
  const tabBarInset = useAppTabBarInset();
  const paddingBottom = (tabBarInset ?? safeAreaInsets.bottom + BottomTabInset) + 32;
  const [isClearingCache, setIsClearingCache] = useState(false);

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
    <View flex={1} bg="$pageBackground" pt={paddingTop} pl={safeAreaInsets.left} pr={safeAreaInsets.right}>
      <View width="100%" maxW={MaxContentWidth} self="center" px="$pageHorizontalInset" minH={36} mb="$3">
        <Text accessibilityRole="header" fontSize="$heading" lineHeight={30} fontWeight="700" color="$color12" px="$1">
          {t('me', { defaultValue: '我的' })}
        </Text>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ alignItems: 'center', paddingBottom }}
      >
        <View width="100%" maxW={MaxContentWidth} px="$pageHorizontalInset" gap="$5">
          <SettingsSection title={t('pilgrimage', { defaultValue: '巡礼' })}>
            {/* <SettingCell
            icon={CalendarDays}
            title={t('pilgrimagePlans', { defaultValue: '巡礼计划' })}
            description={t('arrangeLocationsAndTrackYourProgress', { defaultValue: '安排点位顺序，记录巡礼进度' })}
            onPress={() => router.navigate('/plan' as never)}
            showDivider
          /> */}
            <SettingCell
              compact
              icon={BookImage}
              title={t('pilgrimageRecords')}
              onPress={() => router.navigate('/pilgrimage-records' as never)}
              showDivider
            />
            <SettingCell
              compact
              icon={Settings2}
              title={t('pilgrimageSettings')}
              onPress={() => router.navigate('/pilgrimage-settings' as never)}
            />
          </SettingsSection>

          <SettingsSection title={t('appAndAppearance', { defaultValue: '应用与外观' })}>
            <SettingCell
              compact
              icon={Palette}
              title={t('appearanceSettings')}
              onPress={() => router.navigate('/appearance' as never)}
              showDivider
            />
            <SettingCell
              compact
              icon={Languages}
              title={t('language', { defaultValue: '语言' })}
              value={languageLabel}
              onPress={() => router.navigate('/language')}
            />
          </SettingsSection>

          <SettingsSection title={t('dataAndStorage')}>
            <SettingCell
              compact
              icon={DatabaseBackup}
              title={t('backupAndRestore')}
              onPress={() => router.navigate('/data-backup' as never)}
              showDivider
            />
            <SettingCell
              compact
              icon={HardDrive}
              title={t('clearCache', { defaultValue: '清除缓存' })}
              value={isClearingCache ? t('clearing', { defaultValue: '清除中...' }) : undefined}
              disabled={isClearingCache}
              accessibilityState={{ disabled: isClearingCache }}
              onPress={confirmClearCache}
            />
          </SettingsSection>

          <SettingsSection title={t('other', { defaultValue: '其他' })}>
            <SettingCell
              compact
              icon={Info}
              title={t('about', { defaultValue: '关于' })}
              value={`v${getCurrentAppDisplayVersion()}`}
              onPress={() => router.navigate('/about')}
            />
          </SettingsSection>
        </View>
      </ScrollView>
    </View>
  );
}
