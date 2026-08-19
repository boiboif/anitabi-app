import {
  COMPARISON_CAMERA_BOTTOM_REGION_HEIGHT,
  COMPARISON_CAMERA_TOP_REGION_HEIGHT,
} from '@/components/comparison-camera/comparison-camera-layout';
import ComparisonResultModal, { type PhotoFileTransform } from '@/components/comparison-camera/comparison-result-modal';
import type { Bangumi, Point } from '@/services/types';
import {
  Blend,
  Columns2,
  Images,
  Layers2,
  Maximize2,
  Minimize2,
  SwitchCamera,
  X,
  Zap,
  ZapOff,
} from '@tamagui/lucide-icons-2';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StatusBar, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  LinearTransition,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  type CameraRef,
  CommonResolutions,
  type FlashMode,
  useCameraDevice,
  useCameraPermission,
  useOrientation,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { Slider, Text, View, XStack, YStack } from 'tamagui';

export type CameraAssistMode = 'split' | 'overlay';
export type ReferenceFit = 'cover' | 'contain';

type Props = {
  bangumi: Bangumi;
  point: Point;
  initialReferenceUri?: string;
  fullReferenceUri?: string;
};

type IconButtonProps = {
  accessibilityLabel: string;
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

function OrientationRotation({ children, rotation }: { children: React.ReactNode; rotation: SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

function RotatingReferenceImage({
  contentFit,
  opacity,
  orientationRotation,
  pointerEvents,
  rotation,
  uri,
  viewport,
}: {
  contentFit: ReferenceFit;
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
      contentFit={contentFit}
      cachePolicy="disk"
      layout={LinearTransition.duration(ORIENTATION_ANIMATION_DURATION_MS).easing(Easing.out(Easing.cubic))}
      style={[getReferenceImageLayout(orientationRotation, viewport), { opacity }, animatedStyle]}
      transition={0}
    />
  );
}

function IconButton({
  accessibilityLabel,
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
        bg={showBackground ? 'rgba(0,0,0,0.5)' : 'transparent'}
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

function normalizeFileUri(filePath: string): string {
  return filePath.startsWith('file://') ? filePath : `file://${filePath}`;
}

export default function ComparisonCameraScreen({ bangumi, point, initialReferenceUri, fullReferenceUri }: Props) {
  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const orientation = useOrientation('device');
  const [orientationRotation, setOrientationRotation] = useState('0deg');
  const orientationRotationValue = useSharedValue(0);
  const { hasPermission, requestPermission } = useCameraPermission();
  const permissionRequested = useRef(false);
  const cameraRef = useRef<CameraRef>(null);
  const [cameraPosition, setCameraPosition] = useState<'back' | 'front'>('back');
  const device = useCameraDevice(cameraPosition);
  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.HIGHEST_4_3,
    containerFormat: 'jpeg',
    quality: 1,
    qualityPrioritization: 'speed',
  });
  const [assistMode, setAssistMode] = useState<CameraAssistMode>('split');
  const [referenceFit, setReferenceFit] = useState<ReferenceFit>('cover');
  const [overlayOpacity, setOverlayOpacity] = useState(0.4);
  const [referenceUri, setReferenceUri] = useState(initialReferenceUri);
  const [photoUri, setPhotoUri] = useState<string>();
  const [photoTransform, setPhotoTransform] = useState<PhotoFileTransform>();
  const [resultVisible, setResultVisible] = useState(false);
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [referenceViewport, setReferenceViewport] = useState<ReferenceViewport>();
  const [overlayViewport, setOverlayViewport] = useState<ReferenceViewport>();

  useEffect(() => {
    const timer = setTimeout(() => {
      setOrientationRotation(orientation === 'right' ? '90deg' : orientation === 'left' ? '270deg' : '0deg');
    }, ORIENTATION_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [orientation]);

  useEffect(() => {
    const targetRotation = orientationRotation === '90deg' ? 90 : orientationRotation === '270deg' ? 270 : 0;

    orientationRotationValue.value = withTiming(getNearestRotation(orientationRotationValue.value, targetRotation), {
      duration: ORIENTATION_ANIMATION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [orientationRotation, orientationRotationValue]);

  useEffect(() => {
    if (!fullReferenceUri || fullReferenceUri === initialReferenceUri) return;

    let cancelled = false;

    void Image.prefetch(fullReferenceUri, 'memory-disk').then((prefetched) => {
      if (!cancelled && prefetched) {
        setReferenceUri((current) => (current === initialReferenceUri ? fullReferenceUri : current));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fullReferenceUri, initialReferenceUri]);

  const initialZoom = useCallback(() => {
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

  const pickReference = useCallback(async () => {
    try {
      setPickerVisible(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) setReferenceUri(result.assets[0].uri);
    } catch {
      Alert.alert('无法选择图片', '请检查照片访问权限后重试。');
    } finally {
      setPickerVisible(false);
    }
  }, []);

  const takePhoto = async () => {
    if (!referenceUri) {
      await pickReference();
      return;
    }
    if (!device || !cameraReady || capturing) return;

    try {
      setCapturing(true);
      const photo = await photoOutput.capturePhotoToFile(
        { flashMode: device.hasFlash ? flashMode : 'off' },
        {},
      );
      setPhotoTransform(undefined);
      setPhotoUri(normalizeFileUri(photo.filePath));
      setResultVisible(true);
    } catch (error) {
      console.error(error);
      Alert.alert('拍摄失败', '相机暂时无法完成拍摄，请稍后重试。');
    } finally {
      console.log('finally');
      setCapturing(false);
    }
  };

  const cycleFlash = () => {
    const currentIndex = FLASH_SEQUENCE.indexOf(flashMode);
    setFlashMode(FLASH_SEQUENCE[(currentIndex + 1) % FLASH_SEQUENCE.length]);
  };

  const switchCamera = () => {
    setCameraReady(false);
    setCameraPosition((current) => (current === 'back' ? 'front' : 'back'));
    setFlashMode('off');
  };

  const selectQuickZoom = (nextZoom: number) => {
    const controller = cameraRef.current?.controller;
    if (!controller) return;

    setZoom(nextZoom);
    void controller.setZoom(nextZoom).catch(() => setZoom(controller.zoom));
  };

  const referenceFitLabel = referenceFit === 'cover' ? '参考图裁切显示' : '参考图完整显示';
  const referenceFitControl = (
    <IconButton
      showBackground
      accessibilityLabel={referenceFitLabel}
      size={34}
      onPress={() => setReferenceFit((current) => (current === 'cover' ? 'contain' : 'cover'))}
    >
      {referenceFit === 'contain' ? (
        <OrientationRotation rotation={orientationRotationValue}>
          <Maximize2 size={17} color="white" />
        </OrientationRotation>
      ) : (
        <OrientationRotation rotation={orientationRotationValue}>
          <Minimize2 size={17} color="white" />
        </OrientationRotation>
      )}
    </IconButton>
  );
  const assistModeLabel = assistMode === 'split' ? '切换为叠图模式' : '切换为分图模式';
  const assistModeControl = (
    <IconButton
      showBackground
      accessibilityLabel={assistModeLabel}
      onPress={() => setAssistMode((current) => (current === 'split' ? 'overlay' : 'split'))}
    >
      {assistMode === 'split' ? (
        <OrientationRotation rotation={orientationRotationValue}>
          <Layers2 size={19} color="white" />
        </OrientationRotation>
      ) : (
        <OrientationRotation rotation={orientationRotationValue}>
          <Columns2 size={19} color="white" />
        </OrientationRotation>
      )}
    </IconButton>
  );
  const quickZoomControl =
    quickZoomValues.length > 1 ? (
      <XStack position="absolute" b={8} l={0} r={0} items="center" justify="center" gap={6}>
        {quickZoomValues.map((value) => {
          const selected = Math.abs(zoom - value) < 0.01;
          const label = `${Number(value.toFixed(1))}x`;

          return (
            <OrientationRotation key={value} rotation={orientationRotationValue}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`切换至 ${label} 变焦`}
                accessibilityState={{ selected }}
                disabled={!cameraReady}
                onPress={() => selectQuickZoom(value)}
                style={({ pressed }) => ({ opacity: !cameraReady ? 0.38 : pressed ? 0.68 : 1 })}
              >
                <View
                  width={32}
                  height={32}
                  rounded="$9"
                  items="center"
                  justify="center"
                  bg={selected ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)'}
                >
                  <Text color={selected ? '$primary' : 'white'} fontSize={11} fontWeight="700">
                    {label}
                  </Text>
                </View>
              </Pressable>
            </OrientationRotation>
          );
        })}
      </XStack>
    ) : null;

  const cameraIsActive = isFocused && !resultVisible && !pickerVisible;
  const cameraView = device ? (
    <Camera
      ref={cameraRef}
      device={device}
      enableNativeTapToFocusGesture
      enableNativeZoomGesture
      isActive={cameraIsActive}
      getInitialZoom={initialZoom}
      mirrorMode="auto"
      onPreviewStarted={() => {
        setZoom(initialZoom());
        setCameraReady(true);
      }}
      onPreviewStopped={() => setCameraReady(false)}
      orientationSource="device"
      outputs={[photoOutput]}
      resizeMode="cover"
      style={StyleSheet.absoluteFill}
    />
  ) : (
    <View position="absolute" t={0} r={0} b={0} l={0} items="center" justify="center">
      <ActivityIndicator color="white" />
    </View>
  );

  if (!hasPermission) {
    return (
      <YStack flex={1} bg="black" items="center" justify="center" p={24}>
        <StatusBar hidden />
        <Text color="white" fontSize={20} fontWeight="700">
          需要相机权限
        </Text>
        <Text mt={10} color="#a1a1a6" fontSize={14} text="center">
          允许访问相机后才能拍摄巡礼对比图。
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
            <Text color="#111111" fontSize={14} fontWeight="700">
              授权相机
            </Text>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ marginTop: 12, padding: 12 }}>
          <Text color="#a1a1a6" fontSize={14}>
            返回
          </Text>
        </Pressable>
      </YStack>
    );
  }

  const referencePane = (
    <View flex={1} minH={0} minW={0}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="选择参考图"
        onPress={pickReference}
        style={{ flex: 1, minHeight: 0, minWidth: 0 }}
      >
        <View
          flex={1}
          minH={0}
          minW={0}
          overflow="hidden"
          bg="#090909"
          onLayout={({ nativeEvent: { layout } }) => setReferenceViewport(layout)}
        >
          {referenceUri ? (
            <RotatingReferenceImage
              uri={referenceUri}
              contentFit={referenceFit}
              orientationRotation={orientationRotation}
              rotation={orientationRotationValue}
              viewport={referenceViewport}
            />
          ) : (
            <View position="absolute" t={0} r={0} b={0} l={0} items="center" justify="center" bg="#161616">
              <OrientationRotation rotation={orientationRotationValue}>
                <Images size={22} color="#ffffff" />
              </OrientationRotation>
            </View>
          )}
        </View>
      </Pressable>
      <View position="absolute" t={8} r={8}>
        {referenceFitControl}
      </View>
    </View>
  );

  const stage =
    assistMode === 'split' ? (
      <View flex={1} minH={0} overflow="hidden" bg="#090909" flexDirection="column">
        {referencePane}
        <View flex={1} minH={0} minW={0} overflow="hidden" bg="#090909">
          {cameraView}
          <GridOverlay />
          {quickZoomControl}
          <View position="absolute" b={8} l={8}>
            {assistModeControl}
          </View>
        </View>
      </View>
    ) : (
      <View
        flex={1}
        minH={0}
        overflow="hidden"
        bg="#090909"
        onLayout={({ nativeEvent: { layout } }) => setOverlayViewport(layout)}
      >
        {cameraView}
        <GridOverlay />
        {referenceUri ? (
          <>
            <RotatingReferenceImage
              pointerEvents="none"
              uri={referenceUri}
              contentFit={referenceFit}
              opacity={overlayOpacity}
              orientationRotation={orientationRotation}
              rotation={orientationRotationValue}
              viewport={overlayViewport}
            />
            <View position="absolute" t={8} r={8}>
              {referenceFitControl}
            </View>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="选择参考图"
            onPress={pickReference}
            style={{ position: 'absolute', alignSelf: 'center', top: '40%' }}
          >
            <View width={44} height={44} rounded="$9" items="center" justify="center" bg="rgba(0,0,0,0.58)">
              <OrientationRotation rotation={orientationRotationValue}>
                <Images size={20} color="#ffffff" />
              </OrientationRotation>
            </View>
          </Pressable>
        )}
        {quickZoomControl}
        <View position="absolute" b={8} l={8}>
          {assistModeControl}
        </View>
      </View>
    );

  const controlPanel = (
    <YStack
      shrink={0}
      height={COMPARISON_CAMERA_BOTTOM_REGION_HEIGHT + insets.bottom}
      gap={8}
      px={12}
      pt={12}
      pb={Math.max(insets.bottom, 24)}
      bg="black"
      items="stretch"
      justify="center"
    >
      <View height={20} justify="center">
        {assistMode === 'overlay' ? (
          <XStack width={150} height={30} gap={5} rounded="$9" items="center">
            <OrientationRotation rotation={orientationRotationValue}>
              <Blend size={14} color="#c7c7cc" />
            </OrientationRotation>
            <Slider
              aria-label="叠图透明度"
              min={0}
              max={1}
              step={0.05}
              value={[overlayOpacity]}
              onValueChange={(values) => setOverlayOpacity(values[0] ?? 0.5)}
              flex={1}
              size="$2"
            >
              <Slider.Track backgroundColor="#3a3a3c">
                <Slider.TrackActive backgroundColor="#ffffff" />
              </Slider.Track>
              <Slider.Thumb circular size={12} index={0} background="#ffffff" />
            </Slider>
          </XStack>
        ) : null}
      </View>
      <View flexDirection="row" items="center" justify="space-around" gap={28} width="100%">
        <IconButton showBackground accessibilityLabel="从相册选择参考图" onPress={pickReference}>
          <OrientationRotation rotation={orientationRotationValue}>
            <Images size={18} color="white" />
          </OrientationRotation>
        </IconButton>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="拍照"
          disabled={!device || !cameraReady || capturing}
          onPress={takePhoto}
          style={({ pressed }) => ({
            opacity: !device || !cameraReady || capturing ? 0.38 : 1,
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
        <IconButton showBackground accessibilityLabel="切换前后摄像头" onPress={switchCamera}>
          <OrientationRotation rotation={orientationRotationValue}>
            <SwitchCamera size={19} color="white" />
          </OrientationRotation>
        </IconButton>
      </View>
    </YStack>
  );

  const flashLabel = flashMode === 'off' ? '关闭闪光灯' : flashMode === 'auto' ? '自动闪光灯' : '开启闪光灯';

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
        <IconButton accessibilityLabel="关闭相机" onPress={() => router.back()}>
          <OrientationRotation rotation={orientationRotationValue}>
            <X size={20} color="white" />
          </OrientationRotation>
        </IconButton>
        <View flex={1} />
        <IconButton accessibilityLabel={flashLabel} disabled={!device?.hasFlash} onPress={cycleFlash}>
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
            <Text position="absolute" r={3} b={2} color="white" fontSize={8} fontWeight="800">
              {flashMode === 'auto' ? 'A' : 'ON'}
            </Text>
          ) : null}
        </IconButton>
      </XStack>
      <View flex={1} minH={0} flexDirection="column">
        {stage}
        {controlPanel}
      </View>
      <ComparisonResultModal
        visible={resultVisible}
        bangumi={bangumi}
        point={point}
        photoUri={photoUri}
        photoTransform={photoTransform}
        referenceFit={referenceFit}
        referenceUri={referenceUri}
        onClose={() => router.back()}
        onPickReference={pickReference}
        onRetake={() => setResultVisible(false)}
      />
    </View>
  );
}
