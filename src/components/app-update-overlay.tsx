import type { AppUpdateManager } from '@/hooks/use-app-updates';
import { isMandatoryUpdate } from '@/services/app-update';
import { Modal, ScrollView } from 'react-native';
import { Button, Progress, Text, View, XStack, YStack } from 'tamagui';

type Props = {
  manager: AppUpdateManager;
};

export function AppUpdateOverlay({ manager }: Props) {
  const { binaryUpdate, isBinaryUpdateVisible, hotUpdateReady, isDownloadingBinary, binaryProgress } = manager;
  const visibleBinaryUpdate = isBinaryUpdateVisible ? binaryUpdate : null;
  const binaryMandatory = visibleBinaryUpdate ? isMandatoryUpdate(visibleBinaryUpdate) : false;
  const visible = Boolean(visibleBinaryUpdate || hotUpdateReady);

  if (!visible) return null;

  const isBinary = Boolean(visibleBinaryUpdate);
  const title = isBinary ? visibleBinaryUpdate?.title ?? '发现新版本' : '热更新已准备完成';
  const description = isBinary
    ? visibleBinaryUpdate?.releaseNotes ?? '下载最新安装包，获取完整功能和修复。'
    : '更新内容已在后台下载完成，重启应用后立即生效。';
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
              <Text fontSize={12} color="$color10">
                v{visibleBinaryUpdate?.version} · {binaryMandatory ? '必须更新' : '可选更新'}
              </Text>
            ) : null}
          </YStack>

          <ScrollView style={{ maxHeight: 180 }}>
            <Text fontSize={13} lineHeight={20} color="$color11">
              {description}
            </Text>
          </ScrollView>

          {isDownloadingBinary ? (
            <YStack gap="$2">
              <XStack justify="space-between">
                <Text fontSize={12} color="$color11">正在下载安装包</Text>
                <Text fontSize={12} color="$color12">{progress}%</Text>
              </XStack>
              <Progress value={progress} background="$color4" size="$3">
                <Progress.Indicator background="$primary" />
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
              {isDownloadingBinary ? '下载中…' : isBinary ? '立即更新' : '重启更新'}
            </Button>
          </XStack>
        </YStack>
      </View>
    </Modal>
  );
}
