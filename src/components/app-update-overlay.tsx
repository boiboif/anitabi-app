import { StrictButton as Button } from '@/components/strict-button';
import type { AppUpdateManager } from '@/hooks/use-app-updates';
import { getBinaryUpdateDisplayVersion, getCurrentAppDisplayVersion, isMandatoryUpdate } from '@/services/app-update';
import { Modal, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Progress, Text, View, XStack, YStack } from 'tamagui';

type Props = {
  manager: AppUpdateManager;
};

export function AppUpdateOverlay({ manager }: Props) {
  const { t } = useTranslation();
  const {
    binaryUpdate,
    isBinaryUpdateVisible,
    hotUpdateReady,
    isDownloadingBinary,
    isBinaryDownloaded,
    binaryProgress,
    binaryDownloadError,
  } = manager;
  const visibleBinaryUpdate = isBinaryUpdateVisible ? binaryUpdate : null;
  const binaryMandatory = visibleBinaryUpdate ? isMandatoryUpdate(visibleBinaryUpdate) : false;
  const visible = Boolean(visibleBinaryUpdate || hotUpdateReady);

  if (!visible) return null;

  const isBinary = Boolean(visibleBinaryUpdate);
  const title = isBinary
    ? t('updateDetected', { defaultValue: '检测到更新' })
    : t('updateReady', { defaultValue: '更新已准备完成' });
  const description = isBinary
    ? (visibleBinaryUpdate?.releaseNotes ??
      t('downloadTheLatestInstallerForAllFeaturesAndFixes', { defaultValue: '下载最新安装包，获取完整功能和修复。' }))
    : t('theUpdateHasDownloadedInTheBackgroundAndWillApplyAfterRestarting', {
        defaultValue: '更新内容已在后台下载完成，重启应用后立即生效。',
      });
  const currentVersion = getCurrentAppDisplayVersion();
  const newVersion = visibleBinaryUpdate ? getBinaryUpdateDisplayVersion(visibleBinaryUpdate) : '';
  const progress = binaryProgress?.percent ?? 0;
  const hasPartialDownload = (binaryProgress?.bytesWritten ?? 0) > 0;
  const showBinaryProgress = isBinary && !isBinaryDownloaded && (isDownloadingBinary || binaryProgress !== null);

  return (
    <Modal
      animationType="fade"
      transparent
      visible
      onRequestClose={binaryMandatory ? undefined : isBinary ? manager.dismissBinaryUpdate : manager.dismissHotUpdate}
    >
      <View flex={1} bg="rgba(0,0,0,0.42)" items="center" justify="center" px="$5">
        <YStack width="100%" bg="$background" style={{ maxWidth: 420, borderRadius: 24 }} p="$5" gap="$4">
          <YStack gap="$1">
            <Text fontSize="$title" fontWeight="700" color="$color12">
              {title}
            </Text>
            {isBinary ? (
              <YStack gap="$1">
                <Text fontSize="$footnote" color="$color11">
                  {t('newVersionVVersion', { defaultValue: '新版本：v{{version}}', version: newVersion })}
                </Text>
                <Text fontSize="$footnote" color="$color11">
                  {t('currentVersionVVersion', { defaultValue: '当前版本：v{{version}}', version: currentVersion })}
                </Text>
              </YStack>
            ) : null}
          </YStack>

          <YStack gap="$2">
            {isBinary ? (
              <Text fontSize="$footnote" fontWeight="600" color="$color12">
                {t('releaseNotes', { defaultValue: '更新信息' })}
              </Text>
            ) : null}
            <ScrollView style={{ maxHeight: 180 }}>
              <Text fontSize="$footnote" lineHeight={20} color="$color11">
                {description}
              </Text>
            </ScrollView>
          </YStack>

          {showBinaryProgress ? (
            <YStack gap="$2">
              <XStack justify="space-between">
                <Text fontSize="$footnote" color="$color11">
                  {isDownloadingBinary
                    ? t('downloadingInstaller', { defaultValue: '正在下载安装包' })
                    : hasPartialDownload
                      ? t('downloadPaused', { defaultValue: '下载已暂停' })
                      : t('waitingToDownload', { defaultValue: '等待下载' })}
                </Text>
                <Text fontSize="$footnote" color="$color12">
                  {progress}%
                </Text>
              </XStack>
              <Progress value={progress} bg="$color4" size="$3">
                <Progress.Indicator bg="$primary" />
              </Progress>
            </YStack>
          ) : null}

          {isBinary && binaryDownloadError ? (
            <Text fontSize="$footnote" color="$red10">
              {binaryDownloadError}
            </Text>
          ) : null}

          <XStack justify="space-between" flexWrap="wrap">
            {isBinary && isDownloadingBinary ? (
              <Button
                chromeless
                onPress={manager.cancelBinaryUpdate}
                accessibilityRole="button"
                accessibilityLabel={t('cancelInstallerDownload', { defaultValue: '取消下载安装包' })}
              >
                {t('cancel', { defaultValue: '取消' })}
              </Button>
            ) : !binaryMandatory ? (
              <Button
                chromeless
                onPress={isBinary ? manager.dismissBinaryUpdate : manager.dismissHotUpdate}
                accessibilityRole="button"
              >
                {t('later', { defaultValue: '稍后' })}
              </Button>
            ) : null}
            <XStack>
              {isBinary && !isBinaryDownloaded && !isDownloadingBinary ? (
                <Button
                  chromeless
                  onPress={() => void manager.downloadBinaryUpdateInBrowser()}
                  accessibilityRole="button"
                  accessibilityLabel={t('downloadInstallerInBrowser', { defaultValue: '使用浏览器下载安装包' })}
                >
                  {t('browserDownload', { defaultValue: '浏览器下载' })}
                </Button>
              ) : null}
              <Button
                chromeless
                color="$primary"
                disabled={isDownloadingBinary}
                accessibilityState={{ disabled: isDownloadingBinary }}
                opacity={isDownloadingBinary ? 0.5 : 1}
                onPress={isBinary ? () => void manager.installBinaryUpdate() : () => void manager.reloadForHotUpdate()}
              >
                {isDownloadingBinary
                  ? isBinaryDownloaded
                    ? t('opening', { defaultValue: '正在打开…' })
                    : t('downloading', { defaultValue: '下载中…' })
                  : isBinary
                    ? isBinaryDownloaded
                      ? t('installNow', { defaultValue: '立即安装' })
                      : hasPartialDownload
                        ? t('resumeDownload', { defaultValue: '继续下载' })
                        : t('updateNow', { defaultValue: '立即更新' })
                    : t('restartToUpdate', { defaultValue: '重启更新' })}
              </Button>
            </XStack>
          </XStack>
        </YStack>
      </View>
    </Modal>
  );
}
