import type { FetchProgress } from '@/services/types';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { Progress, Text, View, YStack } from 'tamagui';

type Props = {
  progress: FetchProgress;
  insets: EdgeInsets;
};

function getProgressValue(p: FetchProgress): number {
  switch (p.phase) {
    case 'checking':
      return 5;
    case 'downloading':
      return Math.round(((p.batch ?? 0) / 7) * 100);
    case 'assembling':
      return 92;
    case 'done':
      return 100;
    case 'error':
      return 0;
  }
}

export default function LoadingBadge({ progress, insets }: Props) {
  if (progress.phase === 'error') {
    return (
      <View
        style={{
          position: 'absolute',
          top: insets.top + 80,
          left: 16,
          zIndex: 20,
          elevation: 4,
        }}
      >
        <YStack
          bg="$red2"
          borderWidth={1}
          borderColor="$red7"
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.12,
            shadowRadius: 4,
          }}
        >
          <Text fontSize={10} color="$red10" fontWeight="600">
            {progress.message}
          </Text>
        </YStack>
      </View>
    );
  }

  if (progress.phase === 'done') return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: insets.top + 80,
        left: 16,
        zIndex: 20,
        elevation: 4,
      }}
    >
      <YStack
        bg="$background"
        borderWidth={1}
        borderColor="$primary"
        gap={4}
        style={{
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 10,
          minWidth: 120,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.12,
          shadowRadius: 4,
        }}
      >
        <Text fontSize={10} color="$color" fontWeight="400">
          {progress.message}
        </Text>
        <Progress value={getProgressValue(progress)} background="$pink3" size="$3" style={{ borderRadius: 4 }}>
          <Progress.Indicator background="$primary" style={{ borderRadius: 4 }} />
        </Progress>
      </YStack>
    </View>
  );
}
