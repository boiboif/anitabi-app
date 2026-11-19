import { StrictButton as Button } from '@/components/ui/strict-button';
import type { FetchProgress } from '@/services/types';
import { useTranslation } from 'react-i18next';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { Text, View, YStack } from 'tamagui';

type Props = {
  progress: FetchProgress;
  insets: EdgeInsets;
  onRetry?: () => void;
};

function getProgressValue(p: FetchProgress): number {
  switch (p.phase) {
    case 'checking':
      return 5;
    case 'downloading': {
      const total = p.total ?? 0;
      const batch = p.batch ?? 0;
      const fraction =
        Number.isFinite(total) && total > 0 && Number.isFinite(batch) ? Math.max(0, Math.min(batch / total, 1)) : 0;
      return Math.round(5 + fraction * 85);
    }
    case 'assembling':
      return 95;
    case 'done':
      return 100;
    case 'error':
      return 0;
  }
}

export default function LoadingBadge({ progress, insets, onRetry }: Props) {
  const { t } = useTranslation();
  const top = insets.top + 60;
  const isError = progress.phase === 'error';

  if (progress.phase === 'done') return null;
  const progressValue = getProgressValue(progress);

  return (
    <View
      position="absolute"
      t={top}
      l="13px"
      r="13px"
      z={20}
      items="flex-start"
      pointerEvents="box-none"
      style={{ elevation: 4 }}
    >
      <YStack
        bg={isError ? 'red-2' : 'background'}
        borderWidth={1}
        borderColor={isError ? 'red-7' : 'primary'}
        gap="0-5"
        px="2-5"
        py="1"
        rounded={7}
        w={isError ? undefined : 220}
        minW={120}
        maxW="85%"
        boxShadow="0 0 10px rgba(0, 0, 0, 0.1)"
      >
        <Text fontSize="caption" color={isError ? 'red-10' : 'color'} fontWeight={isError ? '600' : '400'}>
          {progress.message}
        </Text>
        {isError ? (
          onRetry && (
            <Button size="sm" px="7px" bg="red-3" rounded={5} self="flex-start" onPress={onRetry}>
              <Text fontSize="caption" color="red-10" fontWeight="600">
                {t('retry', { defaultValue: '重试' })}
              </Text>
            </Button>
          )
        ) : (
          <View
            w="100%"
            h={5}
            bg="pink-3"
            rounded={3}
            overflow="hidden"
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={progress.message || t('loadingWorkList', { defaultValue: '加载番剧列表…' })}
            accessibilityValue={{ min: 0, max: 100, now: progressValue }}
            pointerEvents="none"
          >
            {/* A definite parent width lets native layout resolve the fill without measuring or translating it. */}
            <View w={`${progressValue}%`} h="100%" bg="primary" rounded={3} />
          </View>
        )}
      </YStack>
    </View>
  );
}
