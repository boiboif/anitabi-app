import { StrictButton as Button } from '@/components/strict-button';
import { X } from '@tamagui/lucide-icons-2';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { Gallery, type GalleryRefType, fitContainer } from 'react-native-zoom-toolkit';
import { Spinner, Text, XStack, YStack } from 'tamagui';

export type PreviewImage = {
  id: string;
  uri: string;
  thumbnailUri?: string;
  width: number;
  height: number;
};

/** Window coordinates of the source image's container, rendered with contentFit="contain". */
export type ImagePreviewBounds = { x: number; y: number; width: number; height: number };

export type ImagePreviewProps = {
  visible: boolean;
  images: PreviewImage[];
  initialIndex?: number;
  getSourceBounds?: (index: number) => ImagePreviewBounds | null;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
  onLongPress?: (image: PreviewImage, index: number) => void;
};

const TRANSITION_DURATION = 240;

function PreviewPage({
  image,
  viewport,
  retry,
  onStatus,
}: {
  image: PreviewImage;
  viewport: { width: number; height: number };
  retry: number;
  onStatus: (status: 'loading' | 'loaded' | 'error') => void;
}) {
  const size = fitContainer(image.width / image.height, viewport);
  return (
    <Image
      key={`${image.id}:${retry}`}
      source={{ uri: image.uri }}
      placeholder={image.thumbnailUri ? { uri: image.thumbnailUri } : undefined}
      placeholderContentFit="contain"
      contentFit="contain"
      cachePolicy="memory-disk"
      transition={120}
      accessibilityLabel={image.id}
      onLoadStart={() => onStatus('loading')}
      onLoad={() => onStatus('loaded')}
      onError={() => onStatus('error')}
      style={size}
    />
  );
}

function PreviewSession({
  images,
  initialIndex = 0,
  getSourceBounds,
  onClose,
  onIndexChange,
  onLongPress,
}: Omit<ImagePreviewProps, 'visible'>) {
  const { t } = useTranslation();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const startIndex = Math.max(0, Math.min(Math.trunc(initialIndex) || 0, images.length - 1));
  const [index, setIndex] = useState(startIndex);
  const [viewport, setViewport] = useState({ width: window.width, height: window.height });
  const [statuses, setStatuses] = useState<Record<string, 'loading' | 'loaded' | 'error'>>({});
  const [retries, setRetries] = useState<Record<string, number>>({});
  const [closing, setClosing] = useState(false);
  const [closingImage, setClosingImage] = useState<PreviewImage | null>(null);
  const galleryRef = useRef<GalleryRefType>(null);
  const startedRef = useRef(false);
  const closingRef = useRef(false);
  const progress = useSharedValue(0);
  const pull = useSharedValue(0);
  const closeRequested = useSharedValue(false);
  const sourceTransform = useSharedValue({ x: 0, y: 0, scale: 1 });
  const useSourceTransition = useSharedValue(false);
  const closingTransform = useSharedValue({ x: 0, y: 0, scale: 1 });
  const closingToSource = useSharedValue(false);
  const isClosing = useSharedValue(false);

  const updateSourceTransform = (nextIndex: number, size: typeof viewport) => {
    const source = getSourceBounds?.(nextIndex);
    const image = images[nextIndex];
    if (
      !source ||
      !image ||
      ![source.x, source.y, source.width, source.height].every(Number.isFinite) ||
      source.width <= 0 ||
      source.height <= 0 ||
      source.x + source.width <= 0 ||
      source.y + source.height <= 0 ||
      source.x >= size.width ||
      source.y >= size.height
    ) {
      useSourceTransition.set(false);
      return;
    }
    const displayed = fitContainer(image.width / image.height, size);
    const thumbnail = fitContainer(image.width / image.height, source);
    sourceTransform.set({
      x: source.x + source.width / 2 - size.width / 2,
      y: source.y + source.height / 2 - size.height / 2,
      scale: thumbnail.width / displayed.width,
    });
    useSourceTransition.set(true);
  };

  const close = (releasedPull?: number) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    isClosing.set(true);
    closeRequested.set(true);
    // Freeze a separate image for closing so the gallery's automatic pan rebound
    // cannot pull it back to the center while the dismissal animation runs.
    const state = galleryRef.current?.getState();
    updateSourceTransform(index, viewport);
    closingToSource.set(useSourceTransition.get());
    closingTransform.set({
      x: state?.translateX ?? 0,
      y: releasedPull ?? state?.translateY ?? 0,
      scale: state?.scale ?? 1,
    });
    setClosingImage(images[index]);
    if (useSourceTransition.get()) {
      closingTransform.set(withTiming(sourceTransform.get(), { duration: TRANSITION_DURATION }));
    }
    progress.set(
      withTiming(0, { duration: TRANSITION_DURATION }, (finished) => {
        if (finished) scheduleOnRN(onClose);
      }),
    );
  };

  const backgroundStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#000',
    opacity: progress.get() * Math.max(0.25, 1 - Math.max(0, pull.get()) / viewport.height),
  }));
  const galleryStyle = useAnimatedStyle(() => {
    const amount = useSourceTransition.get() ? 1 - progress.get() : 0;
    return {
      flex: 1,
      opacity: isClosing.get() ? 0 : useSourceTransition.get() ? 1 : progress.get(),
      transform: [
        { translateX: sourceTransform.get().x * amount },
        { translateY: sourceTransform.get().y * amount },
        { scale: 1 + (sourceTransform.get().scale - 1) * amount },
      ],
    };
  });
  const closingImageStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: closingToSource.get() ? 1 : progress.get(),
    transform: [
      { translateX: closingTransform.get().x },
      { translateY: closingTransform.get().y },
      { scale: closingTransform.get().scale },
    ],
  }));
  const chromeStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: insets.top + 8,
    left: 16,
    right: 16,
    opacity: progress.get() * Math.max(0, 1 - Math.max(0, pull.get()) / 100),
  }));
  const activeImage = images[index];
  const status = statuses[activeImage.id] ?? 'loading';

  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => close()}
    >
      <StatusBar style="light" />
      <GestureHandlerRootView
        style={{ flex: 1 }}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width <= 0 || height <= 0) return;
          setViewport((previous) =>
            previous.width === width && previous.height === height ? previous : { width, height },
          );
          if (startedRef.current) return;
          startedRef.current = true;
          updateSourceTransform(startIndex, { width, height });
          progress.set(withTiming(1, { duration: TRANSITION_DURATION }));
        }}
      >
        <Animated.View pointerEvents="none" style={backgroundStyle} />
        <Animated.View pointerEvents={closing ? 'none' : 'auto'} style={galleryStyle}>
          <Gallery
            ref={galleryRef}
            data={images}
            initialIndex={startIndex}
            keyExtractor={(image) => image.id}
            windowSize={3}
            gap={24}
            maxScale={6}
            tapOnEdgeToItem={false}
            onTap={() => close()}
            onIndexChange={(nextIndex) => {
              setIndex(nextIndex);
              onIndexChange?.(nextIndex);
            }}
            onLongPress={(_, nextIndex) => onLongPress?.(images[nextIndex], nextIndex)}
            onVerticalPull={({ translateY, released, velocityY }) => {
              'worklet';
              if (closeRequested.get()) return;
              pull.set(translateY);
              if (!released) return;
              if (translateY > Math.min(140, viewport.height * 0.18) || (translateY > 40 && velocityY > 900)) {
                closeRequested.set(true);
                scheduleOnRN(close, translateY);
              }
            }}
            renderItem={(image) => (
              <PreviewPage
                image={image}
                viewport={viewport}
                retry={retries[image.id] ?? 0}
                onStatus={(nextStatus) =>
                  setStatuses((previous) =>
                    previous[image.id] === nextStatus ? previous : { ...previous, [image.id]: nextStatus },
                  )
                }
              />
            )}
          />
        </Animated.View>
        {closingImage ? (
          <Animated.View pointerEvents="none" style={closingImageStyle}>
            <Image
              source={{
                uri:
                  statuses[closingImage.id] === 'loaded'
                    ? closingImage.uri
                    : (closingImage.thumbnailUri ?? closingImage.uri),
              }}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={0}
              style={fitContainer(closingImage.width / closingImage.height, viewport)}
            />
          </Animated.View>
        ) : null}
        <Animated.View pointerEvents={closing ? 'none' : 'box-none'} style={chromeStyle}>
          <XStack items="center" justify="space-between" gap="$3">
            <Button
              circular
              width={44}
              height={44}
              bg="rgba(40,40,40,0.7)"
              p="$0"
              accessibilityLabel={t('closeImagePreview')}
              onPress={() => close()}
            >
              <X size={22} color="white" />
            </Button>
            {images.length > 1 ? (
              <Text
                color="white"
                fontSize="$footnote"
                accessibilityLabel={t('imagePreviewPage', { current: index + 1, total: images.length })}
              >
                {index + 1} / {images.length}
              </Text>
            ) : null}
          </XStack>
        </Animated.View>
        {!closing && status === 'loading' ? (
          <YStack position="absolute" b={insets.bottom + 28} l={0} r={0} items="center" pointerEvents="none">
            <Spinner color="white" />
          </YStack>
        ) : !closing && status === 'error' ? (
          <YStack position="absolute" b={insets.bottom + 28} l={20} r={20} items="center" gap="$2">
            <Text color="white" fontSize="$footnote">
              {t('imagePreviewLoadFailed')}
            </Text>
            <Button
              bg="$color3"
              onPress={() => {
                setStatuses((previous) => ({ ...previous, [activeImage.id]: 'loading' }));
                setRetries((previous) => ({ ...previous, [activeImage.id]: (previous[activeImage.id] ?? 0) + 1 }));
              }}
            >
              {t('retry')}
            </Button>
          </YStack>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Unmount each session so reopening resets both gallery zoom and initial index. */
export default function ImagePreview(props: ImagePreviewProps) {
  if (!props.visible || props.images.length === 0) return null;
  return <PreviewSession {...props} />;
}
