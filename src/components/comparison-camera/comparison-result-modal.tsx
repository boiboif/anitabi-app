import {
  COMPARISON_CAMERA_BOTTOM_REGION_HEIGHT,
  COMPARISON_CAMERA_TOP_REGION_HEIGHT,
} from '@/components/comparison-camera/comparison-camera-layout';
import { fitImageSize, isValidImageSize, type ImageSize } from '@/lib/comparison-camera-geometry';
import {
  buildComparisonMetadata,
  COMPARISON_EXPORT_WIDTH,
  getComparisonExportLayout,
  hexToImageColor,
  normalizeComparisonExportSettings,
  resolveComparisonBorderColor,
  type ComparisonExportSettings,
} from '@/lib/comparison-export';
import { formatDuration } from '@/lib/formatDuration';
import { getBangumiTitle, getPointTitle } from '@/lib/localized-data';
import { getComparisonExportSettings, setComparisonExportSettings } from '@/lib/storage';
import type { Bangumi, Point } from '@/services/types';
import { Toast } from '@boiboif/react-native-toast';
import { Download, Images, RotateCcw, Settings2, X } from '@tamagui/lucide-icons-2';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Modal,
  View as NativeView,
  PixelRatio,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { loadImage, Images as NitroImages, type Image as NitroImage } from 'react-native-nitro-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { useTheme, View, XStack, YStack } from 'tamagui';
import ComparisonExportSheet, { type ComparisonExportSheetHandle } from './comparison-export-sheet';
import ComparisonMetadataFooter from './comparison-metadata-footer';

type Props = {
  visible: boolean;
  bangumi: Bangumi;
  point: Point;
  photoUri?: string;
  photoDimensions?: { uri: string; size: ImageSize };
  capturedAt?: string;
  referenceUri?: string;
  referenceDimensions?: { uri: string; size: ImageSize };
  onClose: () => void;
  onPickPhoto: () => Promise<void>;
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

const EXPORT_JPEG_QUALITY = 95;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

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
  let filePath = uri;
  if (/^https?:\/\//i.test(uri)) {
    let cachePath = await Image.getCachePathAsync(uri);
    if (!cachePath) {
      await Image.prefetch(uri, 'disk');
      cachePath = await Image.getCachePathAsync(uri);
    }
    if (!cachePath) throw new Error(`Remote image is unavailable in the disk cache: ${uri}`);
    filePath = cachePath;
  }
  const normalizedUri = await normalizeImageForPixelAccess(
    /^\w+:\/\//.test(filePath) ? filePath : `file://${filePath}`,
  );
  try {
    return { image: await loadImage({ filePath: normalizedUri }), normalizedUri };
  } catch (error) {
    deleteTemporaryFile(normalizedUri);
    throw error;
  }
}

async function normalizeImageForPixelAccess(uri: string) {
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

async function addPanel(canvas: NitroImage, uri: string, width: number, height: number, x: number, y: number) {
  let normalizedUri: string | undefined;
  let source: NitroImage | undefined;

  try {
    const loaded = await loadUriImage(uri);
    normalizedUri = loaded.normalizedUri;
    source = loaded.image;

    const scale = Math.min(width / source.width, height / source.height);
    const drawWidth = source.width * scale;
    const drawHeight = source.height * scale;
    const drawX = (width - drawWidth) / 2;
    const drawY = (height - drawHeight) / 2;

    return await renderInto(canvas, source, x + drawX, y + drawY, drawWidth, drawHeight);
  } finally {
    source?.dispose();
    if (normalizedUri && normalizedUri !== uri) deleteTemporaryFile(normalizedUri);
  }
}

function ActionButton({ label, icon, primary = false, disabled = false, onPress }: ActionButtonProps) {
  const size = primary ? 52 : 36;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: disabled ? 0.38 : pressed ? 0.68 : 1 })}
      hitSlop={12}
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
  bangumi,
  point,
  photoUri,
  photoDimensions,
  capturedAt,
  referenceUri,
  referenceDimensions,
  onPickPhoto,
  onPickReference,
  onRetake,
}: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [loadedReference, setLoadedReference] = useState<{ uri: string; size: ImageSize }>();
  const [loadedPhoto, setLoadedPhoto] = useState<{ uri: string; size: ImageSize }>();
  const [comparisonLayout, setComparisonLayout] = useState<ComparisonLayout>();
  const [saving, setSaving] = useState(false);
  const savingGate = useRef(false);
  const sheetRef = useRef<ComparisonExportSheetHandle>(null);
  const footerRef = useRef<NativeView>(null);
  const [exportSettings, updateExportSettings] = useState(getComparisonExportSettings);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [previousVisible, setPreviousVisible] = useState(visible);
  const [hasPresentedPreview, setHasPresentedPreview] = useState(false);
  const [loadingShownFor, setLoadingShownFor] = useState<string>();
  const [footerMeasurement, setFooterMeasurement] = useState<{ key: string; height: number }>();
  const footerMeasurementRef = useRef<{ key: string; height: number }>(undefined);
  // Reset each result session before its children render, so no stale loaded state is presented.
  if (previousVisible !== visible) {
    setPreviousVisible(visible);
    setHasPresentedPreview(false);
    setLoadedReference(undefined);
    setLoadedPhoto(undefined);
    setComparisonLayout(undefined);
    setLoadingShownFor(undefined);
  }
  const settings = exportSettings;
  const pixelRatio = PixelRatio.get();
  const unrecorded = t('comparisonExportNotRecorded', { defaultValue: '未记录' });
  const date = capturedAt ? new Date(capturedAt) : undefined;
  const episode = typeof point.ep === 'number' ? (point.ep > 0 ? `EP${point.ep}` : '') : point.ep;
  const sceneTime =
    typeof point.s === 'number' && Number.isFinite(point.s) && point.s >= 0 ? formatDuration(point.s) : '';
  const metadataValues = {
    capturedAt:
      date && Number.isFinite(date.getTime())
        ? date.toLocaleString(i18n.resolvedLanguage ?? i18n.language)
        : unrecorded,
    location: getPointTitle(point, i18n.language) || unrecorded,
    work: getBangumiTitle(bangumi, i18n.language) || unrecorded,
    scene: [episode, sceneTime].filter(Boolean).join(' · ') || unrecorded,
    coordinates:
      point.geo?.length === 2 && point.geo.every(Number.isFinite)
        ? `${point.geo[0].toFixed(5)}, ${point.geo[1].toFixed(5)}`
        : unrecorded,
  };
  const metadata = buildComparisonMetadata(settings, metadataValues);
  const hasMetadata = Boolean(metadata.name || metadata.rows.length);
  const footerWidth = (COMPARISON_EXPORT_WIDTH - settings.borderWidth * 2) / pixelRatio;
  // Use a small layout copy for preview; mount the full-resolution text only while exporting.
  const metadataRenderWidth = saving ? footerWidth : 360;
  const footerKey = JSON.stringify([metadata, metadataRenderWidth, i18n.language]);
  const previewFooterKey = JSON.stringify([metadata, 360, i18n.language]);
  const footerReady = !hasMetadata || footerMeasurement?.key === previewFooterKey;
  const footerHeight = hasMetadata && footerReady && footerMeasurement ? footerMeasurement.height : 0;

  const referenceLoaded = Boolean(referenceUri && loadedReference?.uri === referenceUri);
  const photoLoaded = Boolean(photoUri && loadedPhoto?.uri === photoUri);
  const referenceSize =
    referenceDimensions && referenceDimensions.uri === referenceUri && isValidImageSize(referenceDimensions.size)
      ? referenceDimensions.size
      : loadedReference?.size;
  const photoSize =
    photoDimensions && photoDimensions.uri === photoUri && isValidImageSize(photoDimensions.size)
      ? photoDimensions.size
      : loadedPhoto?.size;
  const referenceRatio = referenceSize ? referenceSize.width / referenceSize.height : 4 / 3;
  const photoRatio = photoSize ? photoSize.width / photoSize.height : 4 / 3;
  const exportLayout = getComparisonExportLayout(referenceRatio, photoRatio, settings.borderWidth, footerHeight);
  const preview = fitImageSize(comparisonLayout ?? { width: 0, height: 0 }, exportLayout.width / exportLayout.height);
  const previewScale = preview.width / COMPARISON_EXPORT_WIDTH;
  const contentWidth = exportLayout.contentWidth * previewScale;
  const previewBorder = settings.borderWidth * previewScale;
  const borderColor = resolveComparisonBorderColor(settings.borderColor, theme.primary.val);
  const readyToPresent = referenceLoaded && photoLoaded && footerReady && isValidImageSize(comparisonLayout);
  const readyToSave = hasPresentedPreview && readyToPresent && !saving;
  const loading = visible && (!hasPresentedPreview || !referenceLoaded || !photoLoaded);
  const loadingKey = JSON.stringify([referenceUri, photoUri]);
  const showLoading = loading && loadingShownFor === loadingKey;

  useEffect(() => {
    if (!visible || hasPresentedPreview || !readyToPresent) return;
    // Let the final image ratios and metadata height commit before revealing the first frame.
    const frame = requestAnimationFrame(() => setHasPresentedPreview(true));
    return () => cancelAnimationFrame(frame);
  }, [visible, readyToPresent, hasPresentedPreview]);

  useEffect(() => {
    if (!loading) return;
    const timeout = setTimeout(() => setLoadingShownFor(loadingKey), 200);
    return () => clearTimeout(timeout);
  }, [loading, loadingKey]);

  const closeResult = async () => {
    if (savingGate.current) return;
    if (configurationOpen) await sheetRef.current?.dismiss();
    onRetake();
  };

  const openConfiguration = async () => {
    if (savingGate.current || configurationOpen) return;
    setConfigurationOpen(true);
    try {
      await sheetRef.current?.present(exportSettings);
    } catch (error) {
      setConfigurationOpen(false);
      console.error('[comparison-camera] Failed to open export settings', error);
    }
  };

  const applyConfiguration = (value: ComparisonExportSettings) => {
    const nextSettings = normalizeComparisonExportSettings({ ...value, name: value.name.trim() });
    setComparisonExportSettings(nextSettings);
    updateExportSettings(nextSettings);
    return nextSettings;
  };

  const saveComparison = async (nextSettings = exportSettings, fromSheet = false) => {
    if (!referenceLoaded || !photoLoaded || !referenceUri || !photoUri || (savingGate.current && !fromSheet)) return;
    savingGate.current = true;

    let canvas: NitroImage | undefined;
    let outputUri: string | undefined;
    let footerUri: string | undefined;
    let footerImage: NitroImage | undefined;

    try {
      setSaving(true);
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert(
          t('couldNotSaveImage', { defaultValue: '无法保存图片' }),
          t('allowTheAppToAddPhotosToYourLibrary', { defaultValue: '请允许应用向系统相册添加照片。' }),
        );
        return;
      }

      const exportMetadata = buildComparisonMetadata(nextSettings, metadataValues);
      const needsFooter = Boolean(exportMetadata.name || exportMetadata.rows.length);
      let measuredFooterHeight = 0;
      if (needsFooter) {
        const expectedKey = JSON.stringify([
          exportMetadata,
          (COMPARISON_EXPORT_WIDTH - nextSettings.borderWidth * 2) / pixelRatio,
          i18n.language,
        ]);
        // Wait for the exact settings/text to commit and lay out before taking the footer snapshot.
        for (let frame = 0; frame < 60 && footerMeasurementRef.current?.key !== expectedKey; frame++) await nextFrame();
        if (footerMeasurementRef.current?.key !== expectedKey || !footerRef.current)
          throw new Error('Export metadata has not finished laying out');
        measuredFooterHeight = footerMeasurementRef.current.height;
        await nextFrame();
        footerUri = await captureRef(footerRef, {
          format: 'png',
          result: 'tmpfile',
          // The view is already sized in dp to produce the desired physical pixels.
          // Explicit capture sizes are interpreted differently by the iOS renderInContext path.
          useRenderInContext: true,
        });
        footerImage = await loadImage({ filePath: footerUri });
      }
      const layout = getComparisonExportLayout(
        referenceRatio,
        photoRatio,
        nextSettings.borderWidth,
        measuredFooterHeight,
      );
      const color = resolveComparisonBorderColor(nextSettings.borderColor, theme.primary.val);
      canvas = await NitroImages.createBlankImageAsync(layout.width, layout.height, true, hexToImageColor(color));

      const withPhoto = await addPanel(
        canvas,
        photoUri,
        layout.contentWidth,
        layout.photoHeight,
        nextSettings.borderWidth,
        layout.photoY,
      );
      canvas.dispose();
      canvas = withPhoto;

      const withReference = await addPanel(
        canvas,
        referenceUri,
        layout.contentWidth,
        layout.referenceHeight,
        nextSettings.borderWidth,
        nextSettings.borderWidth,
      );
      canvas.dispose();
      canvas = withReference;

      if (footerImage) {
        const withFooter = await renderInto(
          canvas,
          footerImage,
          nextSettings.borderWidth,
          layout.footerY,
          layout.contentWidth,
          measuredFooterHeight,
        );
        canvas.dispose();
        canvas = withFooter;
      }

      const outputPath = await canvas.saveToTemporaryFileAsync('jpg', EXPORT_JPEG_QUALITY);
      outputUri = `file://${outputPath}`;
      await MediaLibrary.Asset.create(outputUri);
      Toast.show(t('comparisonImageSavedToPhotos', { defaultValue: '对比图已保存到相册' }));
    } catch (error) {
      console.error('[comparison-camera] Failed to export comparison image', error);
      Alert.alert(
        t('saveFailed', { defaultValue: '保存失败' }),
        t('thereWasAProblemCreatingOrSavingTheImagePleaseTryAgainLater', {
          defaultValue: '生成或保存对比图时出现问题，请稍后重试。',
        }),
      );
    } finally {
      canvas?.dispose();
      footerImage?.dispose();
      if (footerUri) releaseCapture(footerUri);
      if (outputUri) deleteTemporaryFile(outputUri);
      setSaving(false);
      savingGate.current = false;
    }
  };

  const exportFromConfiguration = async (value: ComparisonExportSettings) => {
    if (!referenceLoaded || !photoLoaded || savingGate.current) return;
    savingGate.current = true;
    setSaving(true);
    try {
      const nextSettings = applyConfiguration(value);
      await sheetRef.current?.dismiss();
      await saveComparison(nextSettings, true);
    } catch (error) {
      savingGate.current = false;
      setSaving(false);
      console.error('[comparison-camera] Failed to apply export settings', error);
      Alert.alert(t('saveFailed'), t('thereWasAProblemCreatingOrSavingTheImagePleaseTryAgainLater'));
    }
  };

  return (
    <Modal
      animationType="slide"
      hardwareAccelerated
      onRequestClose={() => {
        if (configurationOpen) {
          if (!savingGate.current) void sheetRef.current?.dismiss();
        } else {
          void closeResult();
        }
      }}
      presentationStyle="fullScreen"
      statusBarTranslucent
      supportedOrientations={['portrait', 'portrait-upside-down']}
      visible={visible}
    >
      <StatusBar hidden />
      <View flex={1} bg="black">
        <XStack
          z={2}
          items="center"
          justify="space-between"
          px={12}
          pt={insets.top}
          height={insets.top + COMPARISON_CAMERA_TOP_REGION_HEIGHT}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('closeCaptureResult', { defaultValue: '关闭拍摄结果' })}
            hitSlop={8}
            disabled={saving}
            onPress={() => {
              void closeResult();
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
          >
            <View width={36} height={36} rounded="$9" items="center" justify="center">
              <X size={20} color="white" />
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('comparisonExportConfiguration')}
            hitSlop={8}
            disabled={saving}
            onPress={() => {
              void openConfiguration();
            }}
            style={({ pressed }) => ({ opacity: saving ? 0.38 : pressed ? 0.68 : 1 })}
          >
            <View width={36} height={36} rounded="$9" items="center" justify="center">
              <Settings2 size={20} color="white" />
            </View>
          </Pressable>
        </XStack>

        <View flex={1} minH={0} overflow="hidden" bg="black">
          <View flex={1} minH={0} overflow="hidden" bg="black">
            <View
              flex={1}
              bg="black"
              items="center"
              justify="center"
              onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                if (width <= 0 || height <= 0) return;
                setComparisonLayout((current) =>
                  current?.width === width && current.height === height ? current : { width, height },
                );
              }}
            >
              <YStack
                width={preview.width}
                p={previewBorder}
                gap={previewBorder}
                bg={borderColor}
                opacity={hasPresentedPreview ? 1 : 0}
                pointerEvents={hasPresentedPreview ? 'auto' : 'none'}
              >
                <View
                  width={contentWidth}
                  height={exportLayout.referenceHeight * previewScale}
                  overflow="hidden"
                  bg="black"
                >
                  {referenceUri ? (
                    <Image
                      source={{ uri: referenceUri }}
                      cachePolicy="disk"
                      contentFit="contain"
                      recyclingKey={referenceUri}
                      onLoad={({ source }) => {
                        const size = { width: source.width, height: source.height };
                        if (isValidImageSize(size))
                          setLoadedReference((current) =>
                            current?.uri === referenceUri &&
                            current.size.width === size.width &&
                            current.size.height === size.height
                              ? current
                              : { uri: referenceUri, size },
                          );
                      }}
                      style={StyleSheet.absoluteFill}
                      transition={0}
                    />
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('replaceCameraPhotoFromLibrary', { defaultValue: '从相册更换实拍图' })}
                  onPress={onPickPhoto}
                  disabled={saving}
                  style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
                >
                  <View
                    width={contentWidth}
                    height={exportLayout.photoHeight * previewScale}
                    overflow="hidden"
                    bg="black"
                  >
                    {photoUri ? (
                      <Image
                        source={{ uri: photoUri }}
                        contentFit="contain"
                        recyclingKey={photoUri}
                        onLoad={({ source }) => {
                          const size = { width: source.width, height: source.height };
                          if (isValidImageSize(size))
                            setLoadedPhoto((current) =>
                              current?.uri === photoUri &&
                              current.size.width === size.width &&
                              current.size.height === size.height
                                ? current
                                : { uri: photoUri, size },
                            );
                        }}
                        style={StyleSheet.absoluteFill}
                        transition={0}
                      />
                    ) : null}
                  </View>
                </Pressable>
                {hasMetadata && contentWidth > 0 ? (
                  <ComparisonMetadataFooter metadata={metadata} width={contentWidth} />
                ) : null}
              </YStack>
            </View>
            {showLoading && loading ? (
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
          <ActionButton
            label={t('replaceReferenceImage', { defaultValue: '更换参考图' })}
            icon={<Images size={17} color="white" />}
            onPress={onPickReference}
            disabled={saving}
          />
          <ActionButton
            label={t('retake', { defaultValue: '重拍' })}
            icon={<RotateCcw size={17} color="white" />}
            onPress={() => {
              void closeResult();
            }}
            disabled={saving}
          />
          <ActionButton
            label={saving ? t('saving', { defaultValue: '保存中' }) : t('save', { defaultValue: '保存' })}
            icon={saving ? <ActivityIndicator color="white" /> : <Download size={21} color="white" />}
            primary
            disabled={!readyToSave}
            onPress={() => {
              void saveComparison();
            }}
          />
        </XStack>
        {visible && hasMetadata ? (
          <NativeView
            key={footerKey}
            ref={footerRef}
            collapsable={false}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ position: 'absolute', left: -metadataRenderWidth - 100, top: 0, width: metadataRenderWidth }}
            onLayout={(event) => {
              const measurement = {
                key: footerKey,
                height: Math.ceil(
                  (event.nativeEvent.layout.height * (COMPARISON_EXPORT_WIDTH - settings.borderWidth * 2)) /
                    metadataRenderWidth,
                ),
              };
              footerMeasurementRef.current = measurement;
              // A snapshot width change must not resize an already measured preview.
              // Newly selected metadata still needs its first height, even when exporting straight from the sheet.
              if (!saving || footerMeasurement?.key !== previewFooterKey) {
                const previewMeasurement = { key: previewFooterKey, height: measurement.height };
                setFooterMeasurement((current) =>
                  current?.key === previewMeasurement.key && current.height === previewMeasurement.height
                    ? current
                    : previewMeasurement,
                );
              }
            }}
          >
            <ComparisonMetadataFooter metadata={metadata} width={metadataRenderWidth} />
          </NativeView>
        ) : null}
        <ComparisonExportSheet
          sheetRef={sheetRef}
          onExport={(nextSettings) => {
            void exportFromConfiguration(nextSettings);
          }}
          onDismiss={(nextSettings) => {
            applyConfiguration(nextSettings);
            setConfigurationOpen(false);
          }}
          ready={hasPresentedPreview && readyToPresent}
          saving={saving}
        />
      </View>
    </Modal>
  );
}
