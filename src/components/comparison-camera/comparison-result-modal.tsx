import Toast from '@/../modules/toaster';
import {
  COMPARISON_CAMERA_BOTTOM_REGION_HEIGHT,
  COMPARISON_CAMERA_TOP_REGION_HEIGHT,
} from '@/components/comparison-camera/comparison-camera-layout';
import type { ReferenceFit } from '@/components/comparison-camera/comparison-camera-screen';
import type { Bangumi, Point } from '@/services/types';
import { Download, Images, RotateCcw, X } from '@tamagui/lucide-icons-2';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StatusBar, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import { View, XStack } from 'tamagui';

type Props = {
  visible: boolean;
  bangumi: Bangumi;
  point: Point;
  photoUri?: string;
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

type ImageDimensions = {
  uri: string;
  width: number;
  height: number;
};

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
  photoUri,
  referenceFit,
  referenceUri,
  onPickReference,
  onRetake,
}: Props) {
  const insets = useSafeAreaInsets();
  const viewShotRef = useRef<ViewShotRef>(null);
  const [loadedReferenceUri, setLoadedReferenceUri] = useState<string>();
  const [loadedPhotoUri, setLoadedPhotoUri] = useState<string>();
  const [photoDimensions, setPhotoDimensions] = useState<ImageDimensions>();
  const [saving, setSaving] = useState(false);

  const referenceLoaded = Boolean(referenceUri && loadedReferenceUri === referenceUri);
  const photoLoaded = Boolean(photoUri && loadedPhotoUri === photoUri && photoDimensions?.uri === photoUri);
  const readyToSave = referenceLoaded && photoLoaded && !saving;

  const saveComparison = async () => {
    if (!readyToSave || !viewShotRef.current) return;
    try {
      setSaving(true);
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert('无法保存图片', '请允许应用向系统相册添加照片。');
        return;
      }
      const uri = await viewShotRef.current.capture();
      await MediaLibrary.Asset.create(uri);
      Toast.show('对比图已保存到相册');
    } catch {
      Alert.alert('保存失败', '生成或保存对比图时出现问题，请稍后重试。');
    } finally {
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
            <ViewShot
              ref={viewShotRef}
              options={{
                format: 'jpg',
                quality: 1,
                result: 'tmpfile',
              }}
              style={{ flex: 1, backgroundColor: '#000000' }}
            >
              <View flex={1} minH={0} overflow="hidden" bg="black">
                {referenceUri ? (
                  <Image
                    source={{ uri: referenceUri }}
                    cachePolicy="disk"
                    contentFit="cover"
                    onLoad={() => setLoadedReferenceUri(referenceUri)}
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
                    onLoad={(event) => {
                      setLoadedPhotoUri(photoUri);
                      setPhotoDimensions({ uri: photoUri, ...event.source });
                    }}
                    style={StyleSheet.absoluteFill}
                    transition={0}
                  />
                ) : null}
              </View>
            </ViewShot>
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
