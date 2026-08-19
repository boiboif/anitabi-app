import type { AppUpdateManager } from '@/hooks/use-app-updates';
import { getBinaryUpdateDisplayVersion, getCurrentAppDisplayVersion, isMandatoryUpdate } from '@/services/app-update';
import { Modal, ScrollView } from 'react-native';
import { Button, Progress, Text, View, XStack, YStack } from 'tamagui';

type Props = {
  manager: AppUpdateManager;
};

export function AppUpdateOverlay({ manager }: Props) {
  const {
    binaryUpdate,
    isBinaryUpdateVisible,
    hotUpdateReady,
    isDownloadingBinary,
    isBinaryDownloaded,
    binaryProgress,
  } = manager;
  const visibleBinaryUpdate = isBinaryUpdateVisible ? binaryUpdate : null;
  const binaryMandatory = visibleBinaryUpdate ? isMandatoryUpdate(visibleBinaryUpdate) : false;
  const visible = Boolean(visibleBinaryUpdate || hotUpdateReady);

  if (!visible) return null;

  const isBinary = Boolean(visibleBinaryUpdate);
  const title = isBinary ? '检测到更新' : '更新已准备完成';
  const description = isBinary
    ? (visibleBinaryUpdate?.releaseNotes ?? '下载最新安装包，获取完整功能和修复。')
    : '更新内容已在后台下载完成，重启应用后立即生效。';
  const currentVersion = getCurrentAppDisplayVersion();
  const newVersion = visibleBinaryUpdate ? getBinaryUpdateDisplayVersion(visibleBinaryUpdate) : null;
  const progress = binaryProgress?.percent ?? 0;

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
            <Text fontSize={18} fontWeight="700" color="$color12">
              {title}
            </Text>
            {isBinary ? (
              <YStack gap="$1">
                <Text fontSize={13} color="$color11">
                  新版本：v{newVersion}
                </Text>
                <Text fontSize={13} color="$color11">
                  当前版本：v{currentVersion}
                </Text>
              </YStack>
            ) : null}
          </YStack>

          <YStack gap="$2">
            {isBinary ? (
              <Text fontSize={13} fontWeight="600" color="$color12">
                更新信息
              </Text>
            ) : null}
            <ScrollView style={{ maxHeight: 180 }}>
              <Text fontSize={13} lineHeight={20} color="$color11">
                {description}
              </Text>
            </ScrollView>
          </YStack>

          {isDownloadingBinary && !isBinaryDownloaded ? (
            <YStack gap="$2">
              <XStack justify="space-between">
                <Text fontSize={12} color="$color11">
                  正在下载安装包
                </Text>
                <Text fontSize={12} color="$color12">
                  {progress}%
                </Text>
              </XStack>
              <Progress value={progress} bg="$color4" size="$3">
                <Progress.Indicator bg="$primary" />
              </Progress>
            </YStack>
          ) : null}

          <XStack gap="$3" justify="flex-end">
            {!binaryMandatory ? (
              <Button
                chromeless
                onPress={isBinary ? manager.dismissBinaryUpdate : manager.dismissHotUpdate}
                accessibilityRole="button"
              >
                稍后
              </Button>
            ) : null}
            <Button
              disabled={isDownloadingBinary}
              onPress={isBinary ? () => void manager.installBinaryUpdate() : () => void manager.reloadForHotUpdate()}
            >
              {isDownloadingBinary
                ? isBinaryDownloaded
                  ? '正在打开…'
                  : '下载中…'
                : isBinary
                  ? isBinaryDownloaded
                    ? '立即安装'
                    : '立即更新'
                  : '重启更新'}
            </Button>
          </XStack>
        </YStack>
      </View>
    </Modal>
  );
}
