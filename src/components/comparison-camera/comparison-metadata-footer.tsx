import type { ComparisonMetadata } from '@/lib/comparison-export';
import { MapPin } from '@tamagui/lucide-icons-2';
import { Text, XStack, YStack } from 'tamagui';

export default function ComparisonMetadataFooter({ metadata, width }: { metadata: ComparisonMetadata; width: number }) {
  const scale = width / 360;
  const pointName = metadata.rows.find((row) => row.field === 'location')?.value;
  const workAndScene = metadata.rows
    .filter((row) => row.field === 'work' || row.field === 'scene')
    .map((row) => row.value)
    .join(' · ');
  const coordinates = metadata.rows.find((row) => row.field === 'coordinates')?.value;
  const capturedAt = metadata.rows.find((row) => row.field === 'capturedAt')?.value;
  return (
    <YStack width={width} bg="white" px={6 * scale} py={5 * scale} gap={1 * scale}>
      {pointName || metadata.name ? (
        <XStack items="baseline" justify={pointName ? 'space-between' : 'flex-end'} gap={8 * scale}>
          {pointName ? (
            <Text
              flex={1}
              minW={0}
              allowFontScaling={false}
              fontSize={12 * scale}
              lineHeight={16 * scale}
              fontWeight="600"
              color="#27272a"
            >
              {pointName}
            </Text>
          ) : null}
          {metadata.name ? (
            <Text
              shrink={1}
              maxW={pointName ? '40%' : '100%'}
              allowFontScaling={false}
              fontSize={10 * scale}
              lineHeight={13 * scale}
              color="#71717a"
              text="right"
            >
              @{metadata.name}
            </Text>
          ) : null}
        </XStack>
      ) : null}
      {workAndScene ? (
        <Text allowFontScaling={false} fontSize={8 * scale} lineHeight={12 * scale} color="#71717a">
          {workAndScene}
        </Text>
      ) : null}
      {coordinates || capturedAt ? (
        <XStack items="flex-end" justify={coordinates ? 'space-between' : 'flex-end'} gap={8 * scale}>
          {coordinates ? (
            <XStack minW={0} shrink={1} items="center" gap={3 * scale}>
              <YStack shrink={0}>
                <MapPin size={10 * scale} color="#8a8a94" />
              </YStack>
              <Text
                minW={0}
                shrink={1}
                allowFontScaling={false}
                fontSize={7 * scale}
                lineHeight={11 * scale}
                color="#8a8a94"
              >
                {coordinates}
              </Text>
            </XStack>
          ) : null}
          {capturedAt ? (
            <Text
              minW={0}
              shrink={1}
              allowFontScaling={false}
              fontSize={7 * scale}
              lineHeight={12 * scale}
              color="#8a8a94"
              text="right"
            >
              {capturedAt}
            </Text>
          ) : null}
        </XStack>
      ) : null}
    </YStack>
  );
}
