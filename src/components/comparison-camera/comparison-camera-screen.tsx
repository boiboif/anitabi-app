import ComparisonResultModal from '@/components/comparison-camera/comparison-result-modal';
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
import { ActivityIndicator, Alert, Linking, Pressable, StatusBar, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  type CameraRef,
  CommonResolutions,
  type FlashMode,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { Slider, Text, View, XStack, YStack } from 'tamagui';

export type CameraAssistMode = 'split' | 'overlay';
export type ReferenceFit = 'cover' | 'contain';

type Props = {
  bangumi: Bangumi;
  point: Point;
  initialReferenceUri?: string;
};

type IconButtonProps = {
  accessibilityLabel: string;
  children: React.ReactNode;
  disabled?: boolean;
  onPress: () => void;
  size?: number;
  showBackground?: boolean;
};

const FLASH_SEQUENCE: FlashMode[] = ['off', 'auto', 'on'];

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
        bg={showBackground ? '#242426' : 'transparent'}
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

export default function ComparisonCameraScreen({ bangumi, point, initialReferenceUri }: Props) {
  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const { hasPermission, requestPermission } = useCameraPermission();
  const permissionRequested = useRef(false);
  const cameraRef = useRef<CameraRef>(null);
  const [cameraPosition, setCameraPosition] = useState<'back' | 'front'>('back');
  const device = useCameraDevice(cameraPosition);
  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.UHD_16_9,
    containerFormat: 'jpeg',
    quality: 1,
    qualityPrioritization: 'quality',
  });
  const [assistMode, setAssistMode] = useState<CameraAssistMode>('split');
  const [referenceFit, setReferenceFit] = useState<ReferenceFit>('cover');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [referenceUri, setReferenceUri] = useState(initialReferenceUri);
  const [photoUri, setPhotoUri] = useState<string>();
  const [resultVisible, setResultVisible] = useState(false);
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [zoom, setZoom] = useState(1);

  const quickZoomValues = useMemo(() => {
    if (!device) return [];

    const values = [device.minZoom, 1, ...device.zoomLensSwitchFactors]
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
      console.log('capturePhotoToFile');
      const photo = await photoOutput.capturePhotoToFile({ flashMode: device.hasFlash ? flashMode : 'off' }, {});
      console.log('photo', photo);
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
      {referenceFit === 'contain' ? <Maximize2 size={17} color="white" /> : <Minimize2 size={17} color="white" />}
    </IconButton>
  );
  const assistModeLabel = assistMode === 'split' ? '切换为叠图模式' : '切换为分图模式';
  const assistModeControl = (
    <IconButton
      showBackground
      accessibilityLabel={assistModeLabel}
      onPress={() => setAssistMode((current) => (current === 'split' ? 'overlay' : 'split'))}
    >
      {assistMode === 'split' ? <Layers2 size={19} color="white" /> : <Columns2 size={19} color="white" />}
    </IconButton>
  );
  const quickZoomControl =
    !isLandscape && quickZoomValues.length > 1 ? (
      <XStack position="absolute" b={8} l={0} r={0} items="center" justify="center" gap={6}>
        {quickZoomValues.map((value) => {
          const selected = Math.abs(zoom - value) < 0.01;
          const label = `${Number(value.toFixed(1))}x`;

          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`切换至 ${label} 变焦`}
              accessibilityState={{ selected }}
              disabled={!cameraReady}
              onPress={() => selectQuickZoom(value)}
              style={({ pressed }) => ({ opacity: !cameraReady ? 0.38 : pressed ? 0.68 : 1 })}
            >
              <View width={36} height={36} rounded="$9" items="center" justify="center" bg={selected ? 'white' : '#242426'}>
                <Text color={selected ? '#111111' : 'white'} fontSize={11} fontWeight="700">
                  {label}
                </Text>
              </View>
            </Pressable>
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
      mirrorMode="auto"
      onPreviewStarted={() => {
        const nextZoom = Math.min(device.maxZoom, Math.max(device.minZoom, 1));
        setZoom(nextZoom);
        void cameraRef.current?.controller?.setZoom(nextZoom);
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
        <View flex={1} minH={0} minW={0} overflow="hidden" bg="#090909">
          {referenceUri ? (
            <Image
              source={{ uri: referenceUri }}
              contentFit={referenceFit}
              cachePolicy="disk"
              style={StyleSheet.absoluteFill}
              transition={0}
            />
          ) : (
            <View position="absolute" t={0} r={0} b={0} l={0} items="center" justify="center" bg="#161616">
              <Images size={22} color="#ffffff" />
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
      <View flex={1} minH={0} overflow="hidden" bg="#090909" flexDirection={isLandscape ? 'row' : 'column'}>
        {referencePane}
        <View flex={1} minH={0} minW={0} overflow="hidden" bg="#090909">
          {cameraView}
          <GridOverlay />
          {quickZoomControl}
          <View position="absolute" b={8} l={isLandscape ? undefined : 8} r={isLandscape ? 8 : undefined}>
            {assistModeControl}
          </View>
        </View>
      </View>
    ) : (
      <View flex={1} minH={0} overflow="hidden" bg="#090909">
        {cameraView}
        <GridOverlay />
        {referenceUri ? (
          <>
            <Image
              pointerEvents="none"
              source={{ uri: referenceUri }}
              contentFit={referenceFit}
              cachePolicy="disk"
              style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}
              transition={0}
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
              <Images size={20} color="#ffffff" />
            </View>
          </Pressable>
        )}
        {quickZoomControl}
        <View position="absolute" b={8} l={isLandscape ? undefined : 8} r={isLandscape ? 8 : undefined}>
          {assistModeControl}
        </View>
      </View>
    );

  const controlPanel = (
    <YStack
      shrink={0}
      gap={8}
      px={isLandscape ? 8 : 12}
      pt={isLandscape ? 8 : 16}
      pb={isLandscape ? 8 : 24}
      bg="black"
      width={isLandscape ? 92 : undefined}
      items={isLandscape ? 'center' : 'stretch'}
      justify={isLandscape ? 'center' : undefined}
    >
      <View height={20} justify="center">
        {assistMode === 'overlay' ? (
          <XStack width={isLandscape ? 76 : 104} height={30} gap={5} rounded="$9" items="center">
            <Blend size={14} color="#c7c7cc" />
            <Slider
              aria-label="叠图透明度"
              min={0.1}
              max={0.9}
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
      <View
        flexDirection={isLandscape ? 'column' : 'row'}
        items="center"
        justify="space-around"
        gap={isLandscape ? 8 : 28}
        width="100%"
      >
        <IconButton showBackground accessibilityLabel="从相册选择参考图" onPress={pickReference}>
          <Images size={18} color="white" />
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
          <SwitchCamera size={19} color="white" />
        </IconButton>
      </View>
    </YStack>
  );

  const flashLabel = flashMode === 'off' ? '关闭闪光灯' : flashMode === 'auto' ? '自动闪光灯' : '开启闪光灯';

  return (
    <View flex={1} bg="black">
      <StatusBar hidden />
      <XStack z={2} items="center" justify="space-between" px={12} pt={insets.top} height={insets.top + 66} bg="black">
        <IconButton accessibilityLabel="关闭相机" onPress={() => router.back()}>
          <X size={20} color="white" />
        </IconButton>
        <View flex={1} />
        <IconButton accessibilityLabel={flashLabel} disabled={!device?.hasFlash} onPress={cycleFlash}>
          {flashMode === 'off' ? <ZapOff size={19} color="white" /> : <Zap size={19} color="white" />}
          {flashMode !== 'off' ? (
            <Text position="absolute" r={3} b={2} color="white" fontSize={8} fontWeight="800">
              {flashMode === 'auto' ? 'A' : 'ON'}
            </Text>
          ) : null}
        </IconButton>
      </XStack>
      <View flex={1} minH={0} flexDirection={isLandscape ? 'row' : 'column'} pb={isLandscape ? insets.bottom : 0}>
        {stage}
        {controlPanel}
      </View>
      <ComparisonResultModal
        visible={resultVisible}
        bangumi={bangumi}
        point={point}
        photoUri={photoUri}
        referenceFit={referenceFit}
        referenceUri={referenceUri}
        onClose={() => router.back()}
        onPickReference={pickReference}
        onRetake={() => setResultVisible(false)}
      />
    </View>
  );
}
