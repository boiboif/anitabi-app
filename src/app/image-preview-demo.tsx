import ImagePreview, { type ImagePreviewBounds, type PreviewImage } from '@/components/image-preview/image-preview';
import { StrictButton as Button } from '@/components/ui/strict-button';
import { Image } from 'expo-image';
import { Redirect, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, type View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, YStack } from 'tamagui';

// Stable sample IDs cover landscape, portrait and tall images without using business data.
const EXAMPLES: PreviewImage[] = [
  {
    id: 'landscape',
    uri: 'https://picsum.photos/id/1018/1600/1000',
    thumbnailUri: 'https://picsum.photos/id/1018/320/200',
    width: 1600,
    height: 1000,
  },
  {
    id: 'portrait',
    uri: 'https://picsum.photos/id/1025/1000/1400',
    thumbnailUri: 'https://picsum.photos/id/1025/200/280',
    width: 1000,
    height: 1400,
  },
  {
    id: 'tall',
    uri: 'https://picsum.photos/id/1035/900/1800',
    thumbnailUri: 'https://picsum.photos/id/1035/150/300',
    width: 900,
    height: 1800,
  },
];

export default function ImagePreviewDemo() {
  const { t } = useTranslation();
  const thumbnails = useRef<Record<string, View | null>>({});
  const bounds = useRef<Record<string, ImagePreviewBounds>>({});
  const [session, setSession] = useState<{ images: PreviewImage[]; initialIndex: number; transition: boolean } | null>(
    null,
  );

  const open = (initialIndex: number) => {
    for (const image of EXAMPLES) {
      thumbnails.current[image.id]?.measureInWindow((x, y, width, height) => {
        bounds.current[image.id] = { x, y, width, height };
        if (image.id === EXAMPLES[initialIndex].id) {
          setSession({ images: EXAMPLES, initialIndex, transition: true });
        }
      });
    }
  };

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('imagePreviewDemo') }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}
      >
        <Text color="$color11" fontSize="$footnote" lineHeight={20}>
          {t('imagePreviewDemoInstructions')}
        </Text>
        {EXAMPLES.map((image, index) => (
          <YStack key={image.id} gap="$2">
            <Text color="$color12" fontSize="$body">
              {t('imagePreviewPage', { current: index + 1, total: EXAMPLES.length })}
            </Text>
            <Pressable
              ref={(view) => {
                thumbnails.current[image.id] = view;
              }}
              collapsable={false}
              accessibilityRole="button"
              accessibilityLabel={t('openImagePreview', { index: index + 1 })}
              onPress={() => open(index)}
            >
              <YStack height={180} bg="$color3" rounded="$3" overflow="hidden">
                <Image
                  source={{ uri: image.thumbnailUri }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  style={{ width: '100%', height: '100%' }}
                />
              </YStack>
            </Pressable>
          </YStack>
        ))}
        <Button bg="$color3" onPress={() => setSession({ images: [EXAMPLES[0]], initialIndex: 0, transition: false })}>
          {t('imagePreviewDemoSingle')}
        </Button>
        <Button
          bg="$color3"
          onPress={() =>
            setSession({
              images: [{ ...EXAMPLES[0], id: 'error', uri: 'https://image-preview.invalid/missing.jpg' }],
              initialIndex: 0,
              transition: false,
            })
          }
        >
          {t('imagePreviewDemoError')}
        </Button>
      </ScrollView>
      {session ? (
        <ImagePreview
          visible
          images={session.images}
          initialIndex={session.initialIndex}
          getSourceBounds={session.transition ? (index) => bounds.current[session.images[index].id] ?? null : undefined}
          onClose={() => setSession(null)}
        />
      ) : null}
    </>
  );
}
