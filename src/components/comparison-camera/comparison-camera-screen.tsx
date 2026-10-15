import CameraRatioPicker from '@/components/comparison-camera/camera-ratio-picker';
import { ComparisonImagePressable } from '@/components/comparison-camera/comparison-image-pressable';
import {
  COMPARISON_CAMERA_BOTTOM_REGION_HEIGHT,
  COMPARISON_CAMERA_TOP_REGION_HEIGHT,
} from '@/components/comparison-camera/comparison-camera-layout';
import ComparisonResultModal from '@/components/comparison-camera/comparison-result-modal';
import { ThemeSlider } from '@/components/ui/theme-slider';
import {
  fitComparisonPanels,
  fitImageSize,
  getCameraPreviewLayout,
  getSharedSensorRatio,
  type ImageSize,
  isValidImageSize,
  ratiosMatch,
  selectCameraRatio,
  selectPhotoResolution,
} from '@/lib/comparison-camera-geometry';
import { prepareComparisonPhoto, setComparisonPhotoOrientation } from '@/lib/comparison-camera-photo';
import { type CameraZoomState, restoreCameraZoom } from '@/lib/comparison-camera-zoom';
import { readPhotoCaptureTime } from '@/lib/comparison-export';
import { getCameraRatioPreference, setCameraRatioPreference } from '@/lib/storage';
import type { Bangumi, Point } from '@/services/types';
import { Blend, Columns2, Images, Layers2, SwitchCamera, Undo2, X, Zap, ZapOff } from '@tamagui/lucide-icons-2';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useIsFocused, useRouter } from 'expo-router';
import { type ComponentProps, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Linking, Pressable, StatusBar, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  type CameraController,
  type CameraDevice,
  type CameraPhotoOutput,
  type CameraRef,
  CommonResolutions,
  type FlashMode,
  type PhotoFile,
  useCameraDevice,
  useCameraPermission,
  useOrientation,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { ScrollView, Text, View, XStack, YStack } from 'tamagui';

export type CameraAssistMode = 'split' | 'overlay';

type Props = {
  bangumi: Bangumi;
  point: Point;
  initialReferenceUri?: string;
  fullReferenceUri?: string;
};

type IconButtonProps = {
  accessibilityLabel: string;
  backgroundColor?: ComponentProps<typeof View>['bg'];
  children: React.ReactNode;
  disabled?: boolean;
  onPress: () => void;
  size?: number;
  showBackground?: boolean;
};

type ReferenceViewport = {
  height: number;
  width: number;
};

const FLASH_SEQUENCE: FlashMode[] = ['off', 'auto', 'on'];
const ORIENTATION_DEBOUNCE_MS = 500;
const ORIENTATION_ANIMATION_DURATION_MS = 280;
const STARTUP_LOADING_DELAY_MS = 200;
const CAMERA_CONTROL_BACKGROUND = '#1c1c1e';
const CAMERA_CONTROL_FOREGROUND = '#c7c7cc';
const AnimatedImage = Animated.createAnimatedComponent(Image);

function getReferenceImageLayout(orientationRotation: string, viewport?: ReferenceViewport) {
  const isQuarterTurn = orientationRotation === '90deg' || orientationRotation === '270deg';

  if (!isQuarterTurn || !viewport) return StyleSheet.absoluteFill;

  return {
    position: 'absolute' as const,
    width: viewport.height,
    height: viewport.width,
    left: (viewport.width - viewport.height) / 2,
    top: (viewport.height - viewport.width) / 2,
  };
}

function getNearestRotation(currentRotation: number, targetRotation: number) {
  return targetRotation + Math.round((currentRotation - targetRotation) / 360) * 360;
}

function getOrientationRotation(orientation: ReturnType<typeof useOrientation>) {
  return orientation === 'right'
    ? '90deg'
    : orientation === 'left'
      ? '270deg'
      : orientation === 'down'
        ? '180deg'
        : '0deg';
}

function OrientationRotation({ children, rotation }: { children: React.ReactNode; rotation: SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

function RotatingReferenceImage({
  onLoadSize,
  opacity,
  orientationRotation,
  pointerEvents,
  rotation,
  uri,
  viewport,
}: {
  onLoadSize: (size: ImageSize) => void;
  opacity?: number;
  orientationRotation: string;
  pointerEvents?: 'none';
  rotation: SharedValue<number>;
  uri: string;
  viewport?: ReferenceViewport;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <AnimatedImage
      pointerEvents={pointerEvents}
      source={{ uri }}
      contentFit="contain"
      onLoad={({ source }) => onLoadSize({ width: source.width, height: source.height })}
      cachePolicy="disk"
      style={[getReferenceImageLayout(orientationRotation, viewport), { opacity }, animatedStyle]}
      transition={0}
    />
  );
}

function IconButton({
  accessibilityLabel,
  backgroundColor,
  children,
  disabled = false,
  onPress,
  size = 36,
  showBackground = false,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: disabled ? 0.38 : pressed ? 0.68 : 1 })}
    >
      <View
        width={size}
        height={size}
        rounded="$9"
        items="center"
        justify="center"
        bg={backgroundColor ?? (showBackground ? 'rgba(0,0,0,0.5)' : 'transparent')}
      >
        {children}
      </View>
    </Pressable>
  );
}

function GridOverlay() {
  return (
    <View pointerEvents="none" position="absolute" t={0} r={0} b={0} l={0}>
      <View position="absolute" t={0} b={0} l="33.333%" width={StyleSheet.hairlineWidth} bg="rgba(255,255,255,0.42)" />
      <View position="absolute" t={0} b={0} l="66.666%" width={StyleSheet.hairlineWidth} bg="rgba(255,255,255,0.42)" />
      <View position="absolute" l={0} r={0} t="33.333%" height={StyleSheet.hairlineWidth} bg="rgba(255,255,255,0.42)" />
      <View position="absolute" l={0} r={0} t="66.666%" height={StyleSheet.hairlineWidth} bg="rgba(255,255,255,0.42)" />
    </View>
  );
}

function deleteTemporaryPhoto(filePath: string) {
  try {
    const file = new File(filePath);
    if (file.exists) file.delete();
  } catch {}
}

function normalizeFileUri(filePath: string) {
  return filePath.startsWith('file://') ? filePath : `file://${filePath}`;
}

export default function ComparisonCameraScreen({ bangumi, point, initialReferenceUri, fullReferenceUri }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const orientation = useOrientation('device');
  const [orientationRotation, setOrientationRotation] = useState(() => getOrientationRotation(orientation));
  const orientationRotationValue = useSharedValue(Number.parseInt(orientationRotation, 10));
  const orientationInitialized = useRef(orientation !== undefined);
  const [orientationReady, setOrientationReady] = useState(orientation !== undefined);
  const { hasPermission, requestPermission } = useCameraPermission();
  const permissionRequested = useRef(false);

  const cameraRef = useRef<CameraRef>(null);
  const [boundController, setBoundController] = useState<CameraController>();
  const [previewRunning, setPreviewRunning] = useState(false);
  const obsoleteController = useRef<CameraController | undefined>(undefined);
  // Camera replaces its imperative handle after its new native controller commits.
  // Keep this callback stable so ordinary renders do not look like a new binding.
  const bindCameraRef = useCallback((ref: CameraRef | null) => {
    cameraRef.current = ref;
    setBoundController(ref?.controller);
    if (ref && !ref.controller) setPreviewRunning(false);
  }, []);
  const [cameraPosition, setCameraPosition] = useState<'back' | 'front'>('back');
  const device = useCameraDevice(cameraPosition);
  const [zoom, setZoom] = useState(1);
  const [retakeZoom, setRetakeZoom] = useState<number>();
  const zoomState = useRef<CameraZoomState>({ value: 1, revision: 0 });
  const cameraActive = useRef(false);
  // The native polling effect needs a stable updater for both retained and displayed zoom.
  const updateZoom = useCallback((value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    zoomState.current.value = value;
    setZoom((current) => (Math.abs(current - value) < 0.005 ? current : value));
  }, []);
  const [ratioPreference, setRatioPreference] = useState(getCameraRatioPreference);
  const [referenceUri, setReferenceUri] = useState(initialReferenceUri);
  // The thumbnail and full-resolution URI both represent the original point image.
  const canRestoreReference = Boolean(
    (initialReferenceUri || fullReferenceUri) &&
    referenceUri &&
    referenceUri !== initialReferenceUri &&
    referenceUri !== fullReferenceUri,
  );
  const [referenceDimensions, setReferenceDimensions] = useState<{ uri: string; size: ImageSize }>();
  const referenceReady = Boolean(referenceUri && referenceDimensions?.uri === referenceUri);
  // Keep the last known ratio while a replacement loads. URI readiness still gates capture,
  // but should not temporarily reset the header and both panes to the default 4:3 layout.
  const referenceRatio = referenceDimensions ? referenceDimensions.size.width / referenceDimensions.size.height : 4 / 3;
  const supportedPhotoSizes = useMemo(() => device?.getSupportedResolutions('photo') ?? [], [device]);
  // The largest advertised photo is the baseline for estimating centered sensor crops.
  const sensorSize = supportedPhotoSizes
    .filter(isValidImageSize)
    .reduce<
      ImageSize | undefined
    >((largest, size) => (largest && largest.width * largest.height >= size.width * size.height ? largest : size), undefined);
  const requestedRatio = selectCameraRatio(ratioPreference, referenceRatio, supportedPhotoSizes);
  // The output hook treats targetResolution identity as a configuration dependency.
  const targetResolution = useMemo(
    () => selectPhotoResolution(supportedPhotoSizes, requestedRatio) ?? CommonResolutions.UHD_4_3,
    [supportedPhotoSizes, requestedRatio],
  );
  const photoOutput = usePhotoOutput({
    targetResolution,
    containerFormat: 'jpeg',
    quality: 1,
    qualityPrioritization: 'balanced',
  });
  const [resolvedOutputs, setResolvedOutputs] = useState<{
    output: CameraPhotoOutput;
    device: CameraDevice;
    photo: ImageSize;
    preview: ImageSize;
  }>();
  const currentOutputs =
    resolvedOutputs?.output === photoOutput && resolvedOutputs.device === device ? resolvedOutputs : undefined;
  const actualNativeRatio = currentOutputs
    ? Math.max(currentOutputs.photo.width, currentOutputs.photo.height) /
      Math.min(currentOutputs.photo.width, currentOutputs.photo.height)
    : Math.max(requestedRatio, 1 / requestedRatio);
  const actualRatio = referenceRatio < 1 ? 1 / actualNativeRatio : actualNativeRatio;
  const captureRatio =
    ratioPreference === 'auto' && !ratiosMatch(actualRatio, requestedRatio) ? actualRatio : requestedRatio;
  const sharedSensorRatio = currentOutputs
    ? getSharedSensorRatio(currentOutputs.photo, currentOutputs.preview, sensorSize ?? currentOutputs.photo)
    : actualNativeRatio;
  const readResolvedOutputs = useCallback(() => {
    const photo = photoOutput.currentResolution;
    const preview = cameraRef.current?.preview?.previewOutput?.currentResolution;
    if (!device || !isValidImageSize(photo) || !isValidImageSize(preview)) return;
    setResolvedOutputs((current) =>
      current?.output === photoOutput &&
      current.device === device &&
      current.photo.width === photo.width &&
      current.photo.height === photo.height &&
      current.preview.width === preview.width &&
      current.preview.height === preview.height
        ? current
        : { output: photoOutput, device, photo, preview },
    );
  }, [device, photoOutput]);
  const [assistMode, setAssistMode] = useState<CameraAssistMode>('split');
  const [overlayOpacity, setOverlayOpacity] = useState(0.4);
  const [photoFile, setPhotoFile] = useState<PhotoFile>();
  const mounted = useRef(true);
  const [resultPhotoUri, setResultPhotoUri] = useState<string>();
  const [resultPhotoDimensions, setResultPhotoDimensions] = useState<{ uri: string; size: ImageSize }>();
  const [resultCapturedAt, setResultCapturedAt] = useState<string>();
  const [resultVisible, setResultVisible] = useState(false);
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [stageViewport, setStageViewport] = useState<ImageSize>({ width: 0, height: 0 });
  const [hasPresentedStage, setHasPresentedStage] = useState(false);
  const [showStartupLoading, setShowStartupLoading] = useState(false);
  // Mount only after the initial pane has a size and the reference ratio is known.
  // Otherwise CameraX first binds the fallback 4:3 output, then immediately rebinds
  // while its preview surface is still starting. Keep later reference replacements
  // mounted: referenceDimensions retains the last known ratio while they load.
  const cameraCanMount =
    orientationReady && isValidImageSize(stageViewport) && (!referenceUri || Boolean(referenceDimensions));
  const firstLayoutReady =
    orientationReady && isValidImageSize(stageViewport) && Boolean(currentOutputs) && (!referenceUri || referenceReady);
  const showStage = hasPresentedStage || firstLayoutReady;
  // Stop the camera behind the result modal to keep its export-settings sheet animation smooth.
  // Retain zoom separately because restarting the native session can reset it to 1x.
  const cameraIsActive = isFocused && !pickerVisible && !resultVisible;

  useLayoutEffect(() => {
    const savedZoom = zoomState.current;
    cameraActive.current = cameraIsActive;
    // Changing the photo output rebinds CameraX even while isActive stays true.
    // Invalidate pending zoom requests before the native configuration effect runs.
    savedZoom.revision += 1;
    setCameraReady(false);
    return () => {
      cameraActive.current = false;
      savedZoom.revision += 1;
    };
  }, [cameraIsActive, device, photoOutput]);

  useLayoutEffect(() => {
    // onConfigured fires before the new controller is committed to CameraRef.
    // Do not send zoom requests to the previous controller during rebinding.
    obsoleteController.current = cameraRef.current?.controller;
  }, [device, photoOutput]);

  useEffect(() => {
    if (showStage) return;
    const timer = setTimeout(() => setShowStartupLoading(true), STARTUP_LOADING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [showStage]);

  useEffect(() => {
    if (hasPresentedStage || !firstLayoutReady) return;
    // Latch the initial presentation after the prepared layout has committed. Later ratio
    // changes and camera reconfigurations keep the already-visible scene in place.
    const frame = requestAnimationFrame(() => setHasPresentedStage(true));
    return () => cancelAnimationFrame(frame);
  }, [firstLayoutReady, hasPresentedStage]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (capturing) return;
    const initialize = !orientationInitialized.current;
    const timer = setTimeout(
      () => {
        const rotation = getOrientationRotation(orientation);
        if (initialize) {
          // The first device snapshot establishes the initial pose without an entrance rotation.
          orientationInitialized.current = true;
          orientationRotationValue.set(Number.parseInt(rotation, 10));
          setOrientationReady(true);
        }
        setOrientationRotation(rotation);
      },
      // Unknown sensor orientation (for example, a phone lying flat) keeps the existing
      // portrait fallback instead of leaving the initial loading state pending forever.
      initialize && orientation !== undefined ? 0 : ORIENTATION_DEBOUNCE_MS,
    );

    return () => clearTimeout(timer);
  }, [orientation, capturing, orientationRotationValue]);

  useEffect(() => {
    const targetRotation = Number.parseInt(orientationRotation, 10);

    orientationRotationValue.set(
      withTiming(getNearestRotation(orientationRotationValue.get(), targetRotation), {
        duration: ORIENTATION_ANIMATION_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [orientationRotation, orientationRotationValue]);

  useEffect(() => {
    // Keep the output ratio fixed while changing which way the scene is upright.
    setComparisonPhotoOrientation(photoOutput, orientationRotation);
  }, [orientationRotation, photoOutput]);

  useEffect(() => {
    if (
      capturing ||
      referenceUri !== initialReferenceUri ||
      !fullReferenceUri ||
      fullReferenceUri === initialReferenceUri
    )
      return;

    let cancelled = false;

    void Image.prefetch(fullReferenceUri, 'memory-disk').then((prefetched) => {
      if (!cancelled && prefetched) {
        setReferenceUri((current) => (current === initialReferenceUri ? fullReferenceUri : current));
        setReferenceDimensions((current) =>
          current && current.uri === initialReferenceUri ? { ...current, uri: fullReferenceUri } : current,
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [capturing, referenceUri, fullReferenceUri, initialReferenceUri]);

  const defaultZoom = useCallback(() => {
    if (!device) return 1;

    return Math.min(device.maxZoom, Math.max(device.minZoom, 1));
  }, [device]);

  const quickZoomValues = useMemo(() => {
    if (!device) return [];

    const values = [...new Set([device.minZoom, 1, 2, 5, ...device.zoomLensSwitchFactors])]
      .sort()
      .filter((value) => value >= device.minZoom && value <= device.maxZoom)
      .sort((a, b) => a - b);

    return values.filter((value, index) => index === 0 || Math.abs(value - values[index - 1]) > 0.01);
  }, [device]);

  useEffect(() => {
    if (hasPermission || permissionRequested.current) return;
    permissionRequested.current = true;
    void requestPermission();
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    if (!cameraIsActive || !cameraReady) return;

    const revision = zoomState.current.revision;
    const timer = setInterval(() => {
      if (!cameraActive.current || revision !== zoomState.current.revision) return;
      if (!currentOutputs) readResolvedOutputs();
      const nativeZoom = cameraRef.current?.controller?.zoom;
      if (nativeZoom == null || !Number.isFinite(nativeZoom)) return;
      updateZoom(nativeZoom);
    }, 50);

    return () => clearInterval(timer);
  }, [cameraIsActive, cameraReady, currentOutputs, readResolvedOutputs, updateZoom]);

  useEffect(() => {
    if (!photoFile) return;

    return () => deleteTemporaryPhoto(photoFile.filePath);
  }, [photoFile]);

  const pickReference = useCallback(async () => {
    if (pickerVisible) return;
    try {
      cameraActive.current = false;
      zoomState.current.revision += 1;
      setRetakeZoom(undefined);
      setCameraReady(false);
      setPickerVisible(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) setReferenceUri(result.assets[0].uri);
    } catch {
      Alert.alert(
        t('couldNotSelectImage', { defaultValue: '无法选择图片' }),
        t('checkPhotoAccessPermissionAndTryAgain', { defaultValue: '请检查照片访问权限后重试。' }),
      );
    } finally {
      setPickerVisible(false);
    }
  }, [t, pickerVisible]);

  const pickResultPhoto = useCallback(async () => {
    try {
      setPickerVisible(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
        exif: true,
      });
      if (!result.canceled && result.assets[0]) {
        setResultPhotoUri(result.assets[0].uri);
        setResultPhotoDimensions(undefined);
        setResultCapturedAt(readPhotoCaptureTime(result.assets[0].exif));
      }
    } catch {
      Alert.alert(
        t('couldNotSelectCameraPhoto', { defaultValue: '无法选择实拍图' }),
        t('checkPhotoAccessPermissionAndTryAgain', { defaultValue: '请检查照片访问权限后重试。' }),
      );
    } finally {
      setPickerVisible(false);
    }
  }, [t, setPickerVisible, setResultPhotoUri, setResultCapturedAt, setResultPhotoDimensions]);

  const takePhoto = async () => {
    if (!referenceUri) {
      await pickReference();
      return;
    }
    if (!device || !cameraReady || !currentOutputs || !referenceReady || capturing) {
      return;
    }

    try {
      // Include a pinch immediately before the shutter, even between polling ticks.
      const nativeZoom = cameraRef.current?.controller?.zoom;
      if (nativeZoom != null) updateZoom(nativeZoom);
      setCapturing(true);
      const capturedAt = new Date().toISOString();
      const capturedPhoto = await photoOutput.capturePhotoToFile(
        { flashMode: device.hasFlash ? flashMode : 'off' },
        {},
      );
      try {
        const prepared = await prepareComparisonPhoto(
          normalizeFileUri(capturedPhoto.filePath),
          captureRatio,
          sharedSensorRatio,
          orientationRotation === '90deg' || orientationRotation === '270deg',
        );
        if (!mounted.current) {
          deleteTemporaryPhoto(prepared.uri);
          return;
        }
        setPhotoFile({ filePath: prepared.uri });
        setResultPhotoUri(prepared.uri);
        setResultPhotoDimensions({ uri: prepared.uri, size: { width: prepared.width, height: prepared.height } });
        setResultCapturedAt(capturedAt);
      } finally {
        deleteTemporaryPhoto(capturedPhoto.filePath);
      }
      setResultVisible(true);
    } catch (error) {
      console.error(error);
      Alert.alert(
        t('captureFailed', { defaultValue: '拍摄失败' }),
        t('theCameraCouldNotCompleteTheShotPleaseTryAgainLater', {
          defaultValue: '相机暂时无法完成拍摄，请稍后重试。',
        }),
      );
    } finally {
      setCapturing(false);
    }
  };

  const cycleFlash = () => {
    const currentIndex = FLASH_SEQUENCE.indexOf(flashMode);
    setFlashMode(FLASH_SEQUENCE[(currentIndex + 1) % FLASH_SEQUENCE.length]);
  };

  const stopPreview = () => {
    zoomState.current.revision += 1;
    setCameraReady(false);
  };

  const switchCamera = () => {
    stopPreview();
    setRetakeZoom(undefined);
    updateZoom(1);
    setCameraPosition((current) => (current === 'back' ? 'front' : 'back'));
    setFlashMode('off');
  };

  const selectQuickZoom = (nextZoom: number) => {
    const controller = cameraRef.current?.controller;
    if (!controller) return;

    const revision = zoomState.current.revision;
    updateZoom(nextZoom);
    void controller.setZoom(nextZoom).catch(() => {
      if (
        cameraActive.current &&
        revision === zoomState.current.revision &&
        cameraRef.current?.controller === controller
      )
        updateZoom(controller.zoom);
    });
  };

  const toggleAssistMode = () => {
    const nextZoom = defaultZoom();
    stopPreview();
    setRetakeZoom(undefined);
    updateZoom(nextZoom);
    // Changing the pane tree remounts Camera; read its native default when preview starts.
    setAssistMode((current) => (current === 'split' ? 'overlay' : 'split'));
  };

  // Stable dependency for handling either preview start or a new controller commit.
  const preparePreview = useCallback(
    async function preparePreview() {
      const controller = cameraRef.current?.controller;
      if (!cameraActive.current || !controller || !controller.isConnected || controller === obsoleteController.current)
        return;
      readResolvedOutputs();
      // Only an explicit retake restores saved zoom. Other starts follow native zoom.
      if (retakeZoom === undefined) {
        updateZoom(controller.zoom);
        setCameraReady(true);
        return;
      }
      setCameraReady(false);
      zoomState.current.value = retakeZoom;
      const isCurrent = () =>
        mounted.current &&
        cameraActive.current &&
        controller.isConnected &&
        controller !== obsoleteController.current &&
        cameraRef.current?.controller === controller;
      const request = restoreCameraZoom(zoomState.current, controller, isCurrent);
      const revision = zoomState.current.revision;
      const requestIsCurrent = () => revision === zoomState.current.revision && isCurrent();
      try {
        const restoredZoom = await request;
        if (restoredZoom == null || !requestIsCurrent()) return;
        updateZoom(restoredZoom);
        setRetakeZoom(undefined);
        setCameraReady(true);
      } catch (error) {
        if (!requestIsCurrent()) return;
        console.warn('Could not restore camera zoom', error);
        // Keep capture disabled and the desired zoom intact; allow an explicit retry.
        Alert.alert(t('couldNotOpenCamera'), t('theCameraCouldNotCompleteTheShotPleaseTryAgainLater'), [
          { text: t('cancel'), style: 'cancel' },
          { text: t('retry'), onPress: () => requestIsCurrent() && void preparePreview() },
        ]);
      }
    },
    [readResolvedOutputs, retakeZoom, t, updateZoom],
  );

  useEffect(() => {
    if (!cameraIsActive || !previewRunning || !boundController) return;
    // A rebind may keep the same streaming surface, so no new preview-start event is required.
    void preparePreview();
  }, [cameraIsActive, previewRunning, boundController, preparePreview]);

  const assistModeLabel =
    assistMode === 'split'
      ? t('switchToOverlayMode', { defaultValue: '切换为叠图模式' })
      : t('switchToSplitMode', { defaultValue: '切换为分图模式' });
  const assistModeControl = (
    <IconButton
      backgroundColor={CAMERA_CONTROL_BACKGROUND}
      disabled={capturing}
      accessibilityLabel={assistModeLabel}
      onPress={toggleAssistMode}
    >
      {assistMode === 'split' ? (
        <OrientationRotation rotation={orientationRotationValue}>
          <Layers2 size={19} color={CAMERA_CONTROL_FOREGROUND} />
        </OrientationRotation>
      ) : (
        <OrientationRotation rotation={orientationRotationValue}>
          <Columns2 size={19} color={CAMERA_CONTROL_FOREGROUND} />
        </OrientationRotation>
      )}
    </IconButton>
  );
  const selectedQuickZoomIndex = quickZoomValues.reduce(
    (selectedIndex, quickZoom, index) => (zoom >= quickZoom ? index : selectedIndex),
    0,
  );
  const quickZoomControl =
    quickZoomValues.length > 1 ? (
      <XStack height={36} items="center" justify="center" gap={6}>
        {quickZoomValues.map((value, index) => {
          const selected = index === selectedQuickZoomIndex;
          const targetLabel = `${Number(value.toFixed(1))}x`;
          const labelValue = selected
            ? Math.abs(zoom - value) < 0.005
              ? String(Number(value.toFixed(1)))
              : zoom.toFixed(1)
            : String(Number(value.toFixed(1)));
          const label = `${labelValue}x`;

          return (
            <OrientationRotation key={value} rotation={orientationRotationValue}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  selected
                    ? t('currentlyLabelZoomSwitchToTarget', {
                        defaultValue: '当前 {{label}} 变焦，切换至 {{target}}',
                        label,
                        target: targetLabel,
                      })
                    : t('switchToTargetZoom', { defaultValue: '切换至 {{target}} 变焦', target: targetLabel })
                }
                accessibilityState={{ selected }}
                disabled={!cameraReady || capturing}
                onPress={() => selectQuickZoom(value)}
                style={({ pressed }) => ({ opacity: !cameraReady || capturing ? 0.38 : pressed ? 0.68 : 1 })}
              >
                <View
                  width={32}
                  height={32}
                  rounded="$9"
                  items="center"
                  justify="center"
                  bg={CAMERA_CONTROL_BACKGROUND}
                >
                  <Text
                    color={selected ? '$primary' : CAMERA_CONTROL_FOREGROUND}
                    fontSize="$caption"
                    fontWeight={selected ? '700' : '500'}
                  >
                    {label}
                  </Text>
                </View>
              </Pressable>
            </OrientationRotation>
          );
        })}
      </XStack>
    ) : null;

  const quarterTurn = orientationRotation === '90deg' || orientationRotation === '270deg';
  const displayedCaptureRatio = quarterTurn ? 1 / captureRatio : captureRatio;
  // Fit the panes in the viewer's upright coordinates, then map back to the locked portrait interface.
  const panels = fitComparisonPanels(
    quarterTurn ? { width: stageViewport.height, height: stageViewport.width } : stageViewport,
    referenceRatio,
    captureRatio,
  );
  const referenceFrame = quarterTurn
    ? { width: panels.referenceHeight, height: panels.width }
    : { width: panels.width, height: panels.referenceHeight };
  const cameraFrame =
    assistMode === 'split'
      ? quarterTurn
        ? { width: panels.photoHeight, height: panels.width }
        : { width: panels.width, height: panels.photoHeight }
      : fitImageSize(stageViewport, displayedCaptureRatio);
  const previewLayout =
    currentOutputs && cameraFrame.width > 0 && cameraFrame.height > 0
      ? getCameraPreviewLayout(cameraFrame, currentOutputs.preview, sharedSensorRatio)
      : StyleSheet.absoluteFill;
  const onReferenceLoad = (size: ImageSize) => {
    if (!referenceUri || !isValidImageSize(size)) return;
    setReferenceDimensions((current) =>
      current?.uri === referenceUri && current.size.width === size.width && current.size.height === size.height
        ? current
        : { uri: referenceUri, size },
    );
  };

  const cameraView =
    device && cameraCanMount ? (
      <>
        <Camera
          ref={bindCameraRef}
          device={device}
          enableNativeTapToFocusGesture
          enableNativeZoomGesture={cameraIsActive && cameraReady && !capturing}
          isActive={cameraIsActive}
          // Opacity changes, clipping and overlays require TextureView. SurfaceView can
          // lose its surface during startup layout changes while Camera2 is configuring it.
          implementationMode="compatible"
          mirrorMode="auto"
          onConfigured={readResolvedOutputs}
          onError={(error) => {
            stopPreview();
            console.error('Comparison camera session failed', error, {
              deviceId: device.id,
              cameraPosition,
              implementationMode: 'compatible',
              targetResolution,
              photoResolution: photoOutput.currentResolution,
              previewResolution: cameraRef.current?.preview?.previewOutput?.currentResolution,
              referenceReady,
              stageViewport,
            });
          }}
          onStarted={() => {
            // A fast restart may also keep the surface marked as streaming.
            if (previewRunning) void preparePreview();
          }}
          onStopped={stopPreview}
          onPreviewStarted={() => {
            setPreviewRunning(true);
          }}
          onPreviewStopped={() => {
            stopPreview();
            setPreviewRunning(false);
          }}
          orientationSource="custom"
          outputs={[photoOutput]}
          constraints={[{ resolutionBias: photoOutput }, { previewStabilizationMode: 'off' }]}
          resizeMode="cover"
          style={previewLayout}
        />
        {/* Cover only the non-1x zoom restoration after returning from the result page. */}
        {cameraIsActive && retakeZoom !== undefined && retakeZoom !== 1 && !cameraReady && (
          <View pointerEvents="none" position="absolute" t={0} r={0} b={0} l={0} bg="#090909" />
        )}
      </>
    ) : (
      <View position="absolute" t={0} r={0} b={0} l={0} items="center" justify="center">
        <ActivityIndicator color="white" />
      </View>
    );

  if (!hasPermission) {
    return (
      <YStack flex={1} bg="black" items="center" justify="center" p={24}>
        <StatusBar hidden />
        <Text color="white" fontSize="$heading" fontWeight="700">
          {t('cameraPermissionRequired', { defaultValue: '需要相机权限' })}
        </Text>
        <Text mt={10} color="#a1a1a6" fontSize="$body" text="center">
          {t('allowCameraAccessToTakePilgrimageComparisonPhotos', {
            defaultValue: '允许访问相机后才能拍摄巡礼对比图。',
          })}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            const granted = await requestPermission();
            if (!granted) await Linking.openSettings();
          }}
          style={({ pressed }) => ({ marginTop: 24, opacity: pressed ? 0.68 : 1 })}
        >
          <View minW={160} height={46} rounded={6} items="center" justify="center" bg="white">
            <Text color="#111111" fontSize="$body" fontWeight="700">
              {t('allowCamera', { defaultValue: '授权相机' })}
            </Text>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ marginTop: 12, padding: 12 }}>
          <Text color="#a1a1a6" fontSize="$body">
            {t('back', { defaultValue: '返回' })}
          </Text>
        </Pressable>
      </YStack>
    );
  }

  const restoreReference = () => setReferenceUri(initialReferenceUri ?? fullReferenceUri);
  const restoreReferenceControl = canRestoreReference ? (
    <View
      position="absolute"
      t={orientationRotation === '0deg' || orientationRotation === '90deg' ? 8 : undefined}
      r={orientationRotation === '90deg' || orientationRotation === '180deg' ? 8 : undefined}
      b={orientationRotation === '180deg' || orientationRotation === '270deg' ? 8 : undefined}
      l={orientationRotation === '0deg' || orientationRotation === '270deg' ? 8 : undefined}
    >
      <IconButton
        size={28}
        showBackground
        accessibilityLabel={t('restoreOriginalReferenceImage')}
        onPress={restoreReference}
        disabled={capturing || pickerVisible}
      >
        <OrientationRotation rotation={orientationRotationValue}>
          <Undo2 size={18} color="white" />
        </OrientationRotation>
      </IconButton>
    </View>
  ) : null;

  const referencePane = (
    <View width={referenceFrame.width} height={referenceFrame.height} overflow="hidden" bg="#090909">
      <ComparisonImagePressable
        accessibilityRole="button"
        accessibilityLabel={t('chooseReferenceImage', { defaultValue: '选择参考图' })}
        onPress={pickReference}
        disabled={capturing || pickerVisible}
        style={{ flex: 1, minHeight: 0, minWidth: 0 }}
      >
        <View flex={1} overflow="hidden" bg="#090909">
          {referenceUri ? (
            <RotatingReferenceImage
              uri={referenceUri}
              onLoadSize={onReferenceLoad}
              orientationRotation={orientationRotation}
              rotation={orientationRotationValue}
              viewport={referenceFrame}
            />
          ) : (
            <View position="absolute" t={0} r={0} b={0} l={0} items="center" justify="center" bg="#161616">
              <OrientationRotation rotation={orientationRotationValue}>
                <Images size={22} color="#ffffff" />
              </OrientationRotation>
            </View>
          )}
        </View>
      </ComparisonImagePressable>
      {restoreReferenceControl}
    </View>
  );

  const stage =
    assistMode === 'split' ? (
      <YStack
        flexDirection={quarterTurn ? (orientationRotation === '90deg' ? 'row-reverse' : 'row') : 'column'}
        gap={2}
        opacity={showStage ? 1 : 0}
        pointerEvents={showStage ? 'auto' : 'none'}
      >
        {referencePane}
        <View width={cameraFrame.width} height={cameraFrame.height} overflow="hidden" bg="#090909">
          {cameraView}
          <GridOverlay />
        </View>
      </YStack>
    ) : (
      <View
        width={cameraFrame.width}
        height={cameraFrame.height}
        overflow="hidden"
        bg="#090909"
        opacity={showStage ? 1 : 0}
        pointerEvents={showStage ? 'auto' : 'none'}
      >
        {cameraView}
        <GridOverlay />
        {referenceUri ? (
          <>
            <RotatingReferenceImage
              pointerEvents="none"
              uri={referenceUri}
              onLoadSize={onReferenceLoad}
              opacity={overlayOpacity}
              orientationRotation={orientationRotation}
              rotation={orientationRotationValue}
              viewport={cameraFrame}
            />
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chooseReferenceImage', { defaultValue: '选择参考图' })}
            onPress={pickReference}
            disabled={capturing || pickerVisible}
            style={{ position: 'absolute', alignSelf: 'center', top: '40%' }}
          >
            <View width={44} height={44} rounded="$9" items="center" justify="center" bg="rgba(0,0,0,0.58)">
              <OrientationRotation rotation={orientationRotationValue}>
                <Images size={20} color="#ffffff" />
              </OrientationRotation>
            </View>
          </Pressable>
        )}
        {restoreReferenceControl}
      </View>
    );

  const controlPanel = (
    <YStack
      shrink={0}
      minH={COMPARISON_CAMERA_BOTTOM_REGION_HEIGHT + insets.bottom}
      gap={8}
      px={12}
      pt={12}
      pb={Math.max(insets.bottom, 24)}
      bg="black"
      items="stretch"
      justify="center"
    >
      <View height={44} shrink={0} justify="center">
        {assistMode === 'overlay' ? (
          <XStack width="100%" height={44} gap={8} items="center">
            <View width={36} height={44} shrink={0} items="center" justify="center">
              <OrientationRotation rotation={orientationRotationValue}>
                <Blend size={16} color="#c7c7cc" />
              </OrientationRotation>
            </View>
            <ThemeSlider
              aria-label={t('overlayOpacity', { defaultValue: '叠图透明度' })}
              min={0}
              max={1}
              step={0.01}
              value={[overlayOpacity]}
              onValueChange={(values) => setOverlayOpacity(values[0] ?? 0.5)}
              flex={0.96}
              trackColor="#3a3a3c"
              activeColor="#ffffff"
            />
          </XStack>
        ) : null}
      </View>
      <View flexDirection="row" items="center" justify="space-around" gap={28} width="100%">
        <IconButton
          showBackground
          accessibilityLabel={t('chooseReferenceImageFromPhotos', { defaultValue: '从相册选择参考图' })}
          onPress={pickReference}
          disabled={capturing || pickerVisible}
        >
          <OrientationRotation rotation={orientationRotationValue}>
            <Images size={18} color="white" />
          </OrientationRotation>
        </IconButton>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('takePhoto', { defaultValue: '拍照' })}
          disabled={!device || !cameraReady || !currentOutputs || !referenceReady || capturing}
          onPress={takePhoto}
          style={({ pressed }) => ({
            opacity: !device || !cameraReady || !currentOutputs || !referenceReady || capturing ? 0.38 : 1,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          })}
        >
          <View
            width={64}
            height={64}
            rounded={999}
            borderWidth={3}
            borderColor="white"
            items="center"
            justify="center"
          >
            {capturing ? (
              <ActivityIndicator color="#111111" />
            ) : (
              <View width={50} height={50} rounded="$9" bg="white" />
            )}
          </View>
        </Pressable>
        <IconButton
          showBackground
          accessibilityLabel={t('switchCamera', { defaultValue: '切换前后摄像头' })}
          onPress={switchCamera}
          disabled={capturing}
        >
          <OrientationRotation rotation={orientationRotationValue}>
            <SwitchCamera size={19} color="white" />
          </OrientationRotation>
        </IconButton>
      </View>
    </YStack>
  );

  const flashLabel =
    flashMode === 'off'
      ? t('flashOff', { defaultValue: '关闭闪光灯' })
      : flashMode === 'auto'
        ? t('flashAuto', { defaultValue: '自动闪光灯' })
        : t('flashOn', { defaultValue: '开启闪光灯' });

  return (
    <View flex={1} bg="black">
      <StatusBar hidden />
      <XStack
        z={2}
        items="center"
        justify="space-between"
        px={12}
        pt={insets.top}
        height={insets.top + COMPARISON_CAMERA_TOP_REGION_HEIGHT}
        bg="black"
      >
        <IconButton
          disabled={capturing}
          accessibilityLabel={t('closeCamera', { defaultValue: '关闭相机' })}
          onPress={() => router.back()}
        >
          <OrientationRotation rotation={orientationRotationValue}>
            <X size={20} color="white" />
          </OrientationRotation>
        </IconButton>
        <CameraRatioPicker
          value={ratioPreference}
          actualRatio={captureRatio}
          disabled={capturing}
          rotation={orientationRotationValue}
          landscape={quarterTurn}
          dismissOnOutside
          onChange={(value) => {
            if (retakeZoom !== undefined) stopPreview();
            setRetakeZoom(undefined);
            setRatioPreference(value);
            setCameraRatioPreference(value);
          }}
        />
        <IconButton accessibilityLabel={flashLabel} disabled={!device?.hasFlash || capturing} onPress={cycleFlash}>
          {flashMode === 'off' ? (
            <OrientationRotation rotation={orientationRotationValue}>
              <ZapOff size={19} color="white" />
            </OrientationRotation>
          ) : (
            <OrientationRotation rotation={orientationRotationValue}>
              <Zap size={19} color="white" />
            </OrientationRotation>
          )}
          {flashMode !== 'off' ? (
            <Text position="absolute" r={3} b={2} color="white" fontSize="$caption" fontWeight="800">
              {flashMode === 'auto' ? 'A' : 'ON'}
            </Text>
          ) : null}
        </IconButton>
      </XStack>
      <View flex={1} minH={0} flexDirection="column">
        <View
          flex={1}
          minH={0}
          items="center"
          justify="center"
          overflow="hidden"
          onLayout={({ nativeEvent: { layout } }) => setStageViewport({ width: layout.width, height: layout.height })}
        >
          {stage}
          {!showStage && showStartupLoading ? (
            <View position="absolute" t={0} r={0} b={0} l={0} pointerEvents="none" items="center" justify="center">
              <ActivityIndicator color="white" />
            </View>
          ) : null}
        </View>
        {/* Reserve a fixed-height row between the preview and shutter panel. Only icons and labels rotate. */}
        <XStack height={48} shrink={0} px={12} py={12} gap={16} items="center" bg="black">
          <View width={36} height={36} shrink={0} pointerEvents="none" />
          <View flex={1} minW={0} height={36}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ grow: 1, items: 'center', justify: 'center' }}
            >
              {quickZoomControl}
            </ScrollView>
          </View>
          <View width={36} height={36} shrink={0}>
            {assistModeControl}
          </View>
        </XStack>
        {controlPanel}
      </View>
      <ComparisonResultModal
        visible={resultVisible}
        bangumi={bangumi}
        point={point}
        photoUri={resultPhotoUri}
        photoDimensions={resultPhotoDimensions}
        capturedAt={resultCapturedAt}
        referenceUri={referenceUri}
        referenceDimensions={referenceDimensions}
        onClose={() => router.back()}
        onPickPhoto={pickResultPhoto}
        onPickReference={pickReference}
        onRestoreReference={canRestoreReference ? restoreReference : undefined}
        onRetake={() => {
          setRetakeZoom(zoomState.current.value);
          setCameraReady(false);
          setResultVisible(false);
          setPhotoFile(undefined);
          setResultPhotoUri(undefined);
          setResultPhotoDimensions(undefined);
          setResultCapturedAt(undefined);
        }}
      />
    </View>
  );
}
