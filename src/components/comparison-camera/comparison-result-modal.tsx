import Toast from '@modules/toaster';
import {
  COMPARISON_CAMERA_BOTTOM_REGION_HEIGHT,
  COMPARISON_CAMERA_TOP_REGION_HEIGHT,
} from '@/components/comparison-camera/comparison-camera-layout';
import type { ReferenceFit } from '@/components/comparison-camera/comparison-camera-screen';
import type { Bangumi, Point } from '@/services/types';
import { Download, Images, RotateCcw, X } from '@tamagui/lucide-icons-2';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, StatusBar, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Images as NitroImages, loadImage, type Image as NitroImage } from 'react-native-nitro-image';
import type { PhotoFile } from 'react-native-vision-camera';
import { View, XStack } from 'tamagui';

type Props = {
  visible: boolean;
  bangumi: Bangumi;
  point: Point;
  photoFile?: PhotoFile;
  /** @deprecated */
  referenceFit: ReferenceFit;
  referenceUri?: string;
  onClose: () => void;
  onPickReference: () => Promise<void>;
  onRetake: () => void;
};

type ActionButtonProps = {
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

type ComparisonLayout = {
  width: number;
  height: number;
};

const EXPORT_WIDTH = 2160;
const EXPORT_JPEG_QUALITY = 95;

function deleteTemporaryFile(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {}
}

async function renderInto(canvas: NitroImage, image: NitroImage, x: number, y: number, width: number, height: number) {
  // Nitro Image 0.15.1 treats Android's width/height as Rect right/bottom coordinates.
  const androidWidth = Platform.OS === 'android' ? x + width : width;
  const androidHeight = Platform.OS === 'android' ? y + height : height;
  return canvas.renderIntoAsync(image, x, y, androidWidth, androidHeight);
}

async function loadUriImage(uri: string) {
  if (!/^https?:\/\//i.test(uri)) return await loadImage({ filePath: uri });

  let cachePath = await Image.getCachePathAsync(uri);
  if (!cachePath) {
    await Image.prefetch(uri, 'disk');
    cachePath = await Image.getCachePathAsync(uri);
  }
  if (!cachePath) throw new Error(`Remote image is unavailable in the disk cache: ${uri}`);

  return await loadImage({ filePath: cachePath });
}

function normalizeFileUri(filePath: string): string {
  return filePath.startsWith('file://') ? filePath : `file://${filePath}`;
}

async function normalizeCapturedPhotoForPixelAccess(uri: string) {
  if (process.env.EXPO_OS !== 'android') return uri;

  const context = ImageManipulator.manipulate(uri);
  try {
    const image = await context.renderAsync();
    try {
      const result = await image.saveAsync({ compress: 1, format: SaveFormat.JPEG });
      return result.uri;
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}

async function addPanel(
  canvas: NitroImage,
  uri: string,
  width: number,
  height: number,
  y: number,
  clipVerticalOverflow: boolean,
  normalizeExifOrientation = false,
) {
  let normalizedUri: string | undefined;
  let source: NitroImage | undefined;
  let clippedPanel: NitroImage | undefined;

  try {
    if (normalizeExifOrientation) normalizedUri = await normalizeCapturedPhotoForPixelAccess(uri);
    source = await loadUriImage(normalizedUri ?? uri);

    const scale = Math.max(width / source.width, height / source.height);
    const drawWidth = source.width * scale;
    const drawHeight = source.height * scale;
    const drawX = (width - drawWidth) / 2;
    const drawY = (height - drawHeight) / 2;

    if (clipVerticalOverflow && drawHeight > height + 0.5) {
      const panel = await NitroImages.createBlankImageAsync(width, height, true, { r: 0, g: 0, b: 0 });
      try {
        clippedPanel = await renderInto(panel, source, drawX, drawY, drawWidth, drawHeight);
      } finally {
        panel.dispose();
      }
      return await renderInto(canvas, clippedPanel, 0, y, width, height);
    }

    return await renderInto(canvas, source, drawX, y + drawY, drawWidth, drawHeight);
  } finally {
    clippedPanel?.dispose();
    source?.dispose();
    if (normalizedUri && normalizedUri !== uri) deleteTemporaryFile(normalizedUri);
  }
}

function ActionButton({ label, icon, primary = false, disabled = false, onPress }: ActionButtonProps) {
  const size = primary ? 56 : 36;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: disabled ? 0.38 : pressed ? 0.68 : 1 })}
    >
      <View
        width={size}
        height={size}
        items="center"
        justify="center"
        rounded={primary ? 999 : '$9'}
        bg={primary ? '$primary' : '#242426'}
      >
        {icon}
      </View>
    </Pressable>
  );
}

export default function ComparisonResultModal({
  visible,
  photoFile,
  referenceFit,
  referenceUri,
  onPickReference,
  onRetake,
}: Props) {
  const insets = useSafeAreaInsets();
  const photoUri = photoFile ? normalizeFileUri(photoFile.filePath) : undefined;
  const [loadedReferenceUri, setLoadedReferenceUri] = useState<string>();
  const [loadedPhotoUri, setLoadedPhotoUri] = useState<string>();
  const [comparisonLayout, setComparisonLayout] = useState<ComparisonLayout>();
  const [saving, setSaving] = useState(false);

  const referenceLoaded = Boolean(referenceUri && loadedReferenceUri === referenceUri);
  const photoLoaded = Boolean(photoUri && loadedPhotoUri === photoUri);
  const readyToSave = referenceLoaded && photoLoaded && comparisonLayout && !saving;

  const saveComparison = async () => {
    if (!readyToSave || !referenceUri || !photoUri || !comparisonLayout) return;

    let canvas: NitroImage | undefined;
    let outputUri: string | undefined;

    try {
      setSaving(true);
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert('无法保存图片', '请允许应用向系统相册添加照片。');
        return;
      }

      const exportHeight = Math.max(2, Math.round((EXPORT_WIDTH * comparisonLayout.height) / comparisonLayout.width));
      const panelHeight = Math.floor(exportHeight / 2);
      const canvasHeight = panelHeight * 2;

      canvas = await NitroImages.createBlankImageAsync(EXPORT_WIDTH, canvasHeight, true, { r: 0, g: 0, b: 0 });

      // Draw the bottom panel first so any vertical cover overflow is replaced by the top panel.
      const withPhoto = await addPanel(canvas, photoUri, EXPORT_WIDTH, panelHeight, panelHeight, false, true);
      canvas.dispose();
      canvas = withPhoto;

      const withReference = await addPanel(canvas, referenceUri, EXPORT_WIDTH, panelHeight, 0, true);
      canvas.dispose();
      canvas = withReference;

      const dividerHeight = Math.max(2, Math.round((2 * EXPORT_WIDTH) / comparisonLayout.width));
      const divider = await NitroImages.createBlankImageAsync(EXPORT_WIDTH, dividerHeight, false, { r: 1, g: 1, b: 1 });
      try {
        const withDivider = await renderInto(
          canvas,
          divider,
          0,
          panelHeight - Math.floor(dividerHeight / 2),
          EXPORT_WIDTH,
          dividerHeight,
        );
        canvas.dispose();
        canvas = withDivider;
      } finally {
        divider.dispose();
      }

      const outputPath = await canvas.saveToTemporaryFileAsync('jpg', EXPORT_JPEG_QUALITY);
      outputUri = `file://${outputPath}`;
      await MediaLibrary.Asset.create(outputUri);
      Toast.show('对比图已保存到相册');
    } catch (error) {
      console.error('[comparison-camera] Failed to export comparison image', error);
      Alert.alert('保存失败', '生成或保存对比图时出现问题，请稍后重试。');
    } finally {
      canvas?.dispose();
      if (outputUri) deleteTemporaryFile(outputUri);
      setSaving(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onRetake}
      presentationStyle="fullScreen"
      statusBarTranslucent
      supportedOrientations={['portrait', 'portrait-upside-down']}
      visible={visible}
    >
      <StatusBar hidden />
      <View flex={1} bg="black">
        <XStack z={2} items="center" px={12} pt={insets.top} height={insets.top + COMPARISON_CAMERA_TOP_REGION_HEIGHT}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭拍摄结果"
            hitSlop={8}
            onPress={onRetake}
            style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
          >
            <View width={36} height={36} rounded="$9" items="center" justify="center">
              <X size={20} color="white" />
            </View>
          </Pressable>
        </XStack>

        <View flex={1} minH={0} overflow="hidden" bg="black">
          <View flex={1} minH={0} overflow="hidden" rounded={4} bg="black" boxShadow="0 2px 8px rgba(0,0,0,0.38)">
            <View
              flex={1}
              bg="black"
              onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                if (width <= 0 || height <= 0) return;
                setComparisonLayout((current) =>
                  current?.width === width && current.height === height ? current : { width, height },
                );
              }}
            >
              <View flex={1} minH={0} overflow="hidden" bg="black">
                {referenceUri ? (
                  <Image
                    source={{ uri: referenceUri }}
                    cachePolicy="disk"
                    contentFit="cover"
                    onLoad={() => {
                      setLoadedReferenceUri(referenceUri);
                    }}
                    style={StyleSheet.absoluteFill}
                    transition={0}
                  />
                ) : null}
              </View>
              <View pointerEvents="none" position="absolute" z={2} t="50%" l={0} r={0} height={2} mt={-1} bg="white" />
              <View flex={1} minH={0} overflow="hidden" bg="black">
                {photoUri ? (
                  <Image
                    source={{ uri: photoUri }}
                    contentFit="cover"
                    onLoad={() => {
                      setLoadedPhotoUri(photoUri);
                    }}
                    style={StyleSheet.absoluteFill}
                    transition={0}
                  />
                ) : null}
              </View>
            </View>
            {!referenceLoaded || !photoLoaded ? (
              <View
                pointerEvents="none"
                position="absolute"
                t={0}
                r={0}
                b={0}
                l={0}
                items="center"
                justify="center"
                bg="rgba(0,0,0,0.48)"
              >
                <ActivityIndicator color="white" />
              </View>
            ) : null}
          </View>
        </View>

        <XStack
          shrink={0}
          height={COMPARISON_CAMERA_BOTTOM_REGION_HEIGHT + insets.bottom}
          px={12}
          pt={12}
          pb={Math.max(insets.bottom, 24)}
          items="center"
          justify="space-around"
          gap={28}
          bg="black"
        >
          <ActionButton label="更换参考图" icon={<Images size={17} color="white" />} onPress={onPickReference} />
          <ActionButton label="重拍" icon={<RotateCcw size={17} color="white" />} onPress={onRetake} />
          <ActionButton
            label={saving ? '保存中' : '保存'}
            icon={saving ? <ActivityIndicator color="white" /> : <Download size={21} color="white" />}
            primary
            disabled={!readyToSave}
            onPress={saveComparison}
          />
        </XStack>
      </View>
    </Modal>
  );
}
