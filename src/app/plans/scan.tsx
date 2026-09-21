import { StrictButton as Button } from '@/components/strict-button';
import i18n from '@/i18n';
import { decodeSharedPlanValue } from '@/lib/plan-sharing';
import { BLOCK_BUTTON_ICON_SIZE, ICON_BUTTON_ICON_SIZE } from '@/lib/ui-sizes';
import { usePlanImport } from '@/store/use-plan-import';
import { Images, ScanLine, X } from '@tamagui/lucide-icons-2';
import { CameraView, scanFromURLAsync, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : i18n.t('thisIsNotAValidAnitabiPilgrimagePlanQrCode', { defaultValue: '这不是有效的 Anitabi 巡礼计划二维码' });
}

export default function ScanPlanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const setPending = usePlanImport((state) => state.setPending);
  const requestedPermissionRef = useRef(false);
  const handledRef = useRef(false);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const askForPermission = useCallback(async () => {
    if (requestingPermission) return;
    setRequestingPermission(true);
    try {
      await requestPermission();
    } catch (error) {
      Alert.alert(t('couldNotRequestCameraPermission', { defaultValue: '无法申请相机权限' }), errorMessage(error));
    } finally {
      setRequestingPermission(false);
    }
  }, [requestPermission, requestingPermission, t]);

  useEffect(() => {
    if (!permission || permission.granted || !permission.canAskAgain || requestedPermissionRef.current) return;
    requestedPermissionRef.current = true;
    void askForPermission();
  }, [askForPermission, permission]);

  const continueScanning = useCallback(() => {
    handledRef.current = false;
    setScanned(false);
  }, []);

  const importPlanValue = useCallback(
    (value: string) => {
      setPending(decodeSharedPlanValue(value), 'qr');
      router.replace('/plans/import' as never);
    },
    [router, setPending],
  );

  const handleBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (handledRef.current) return;
      handledRef.current = true;
      setScanned(true);
      try {
        importPlanValue(data);
      } catch (error) {
        Alert.alert(t('couldNotReadQrCode', { defaultValue: '无法识别二维码' }), errorMessage(error), [
          { text: t('continueScanning', { defaultValue: '继续扫描' }), onPress: continueScanning },
          { text: t('cancel', { defaultValue: '取消' }), style: 'cancel', onPress: () => router.back() },
        ]);
      }
    },
    [continueScanning, importPlanValue, router, t],
  );

  const pickQrImage = useCallback(async () => {
    if (pickingImage) return;
    handledRef.current = true;
    setScanned(true);
    setPickingImage(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled || !result.assets[0]) {
        continueScanning();
        return;
      }

      const codes = await scanFromURLAsync(result.assets[0].uri, ['qr']);
      if (codes.length === 0)
        throw new Error(
          t('noQrCodeWasFoundChooseAnImageContainingTheCompleteQrCode', {
            defaultValue: '图片中没有识别到二维码，请选择包含完整二维码的图片。',
          }),
        );

      let lastError: unknown;
      for (const code of codes) {
        try {
          importPlanValue(code.data);
          return;
        } catch (error) {
          lastError = error;
        }
      }
      throw (
        lastError ??
        new Error(
          t('theImageDoesNotContainAValidPilgrimagePlanQrCode', { defaultValue: '图片中没有有效的巡礼计划二维码。' }),
        )
      );
    } catch (error) {
      Alert.alert(t('couldNotImportFromImage', { defaultValue: '无法从图片导入' }), errorMessage(error), [
        { text: t('continueScanning', { defaultValue: '继续扫描' }), onPress: continueScanning },
        { text: t('cancel', { defaultValue: '取消' }), style: 'cancel', onPress: () => router.back() },
      ]);
    } finally {
      setPickingImage(false);
    }
  }, [continueScanning, importPlanValue, pickingImage, router, t]);

  const close = () => router.back();

  if (!permission) {
    return (
      <View flex={1} bg="black" items="center" justify="center">
        <Stack.Screen options={{ headerShown: false }} />
        <Spinner size="large" color="white" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <YStack flex={1} bg="$background" px="$6" items="center" justify="center" gap="$3">
        <Stack.Screen options={{ headerShown: false }} />
        <ScanLine size={36} color="$primary" strokeWidth={1.8} />
        <Text color="$color12" fontSize="$subtitle" fontWeight="700" text="center">
          {t('cameraPermissionRequired', { defaultValue: '需要相机权限' })}
        </Text>
        <Text color="$color11" fontSize="$footnote" lineHeight={19} text="center">
          {t('theCameraIsOnlyUsedToReadPilgrimagePlanQrCodesItWillNotTakeOrSavePhotos', {
            defaultValue: '相机只用于识别巡礼计划二维码，不会拍摄或保存照片。',
          })}
        </Text>
        {permission.canAskAgain ? (
          <Button
            mt="$2"
            bg="$primary"
            color="white"
            icon={<ScanLine size={BLOCK_BUTTON_ICON_SIZE} color="white" />}
            disabled={requestingPermission}
            onPress={() => void askForPermission()}
          >
            {requestingPermission
              ? t('requesting', { defaultValue: '正在申请…' })
              : t('allowCameraAccess', { defaultValue: '允许使用相机' })}
          </Button>
        ) : (
          <Button mt="$2" bg="$primary" color="white" onPress={() => void Linking.openSettings()}>
            {t('openSystemSettings', { defaultValue: '前往系统设置' })}
          </Button>
        )}
        <Button chromeless color="$color11" onPress={close}>
          {t('cancel', { defaultValue: '取消' })}
        </Button>
      </YStack>
    );
  }

  if (cameraError) {
    return (
      <YStack flex={1} bg="$background" px="$6" items="center" justify="center" gap="$3">
        <Stack.Screen options={{ headerShown: false }} />
        <Text color="$color12" fontSize="$subtitle" fontWeight="700" text="center">
          {t('couldNotOpenCamera', { defaultValue: '无法打开相机' })}
        </Text>
        <Text color="$color11" fontSize="$footnote" lineHeight={19} text="center" selectable>
          {cameraError}
        </Text>
        <Button bg="$color3" color="$color12" onPress={close}>
          {t('back', { defaultValue: '返回' })}
        </Button>
      </YStack>
    );
  }

  return (
    <View flex={1} bg="black">
      <Stack.Screen options={{ headerShown: false }} />
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        onMountError={({ message }) => setCameraError(message)}
      />

      <View position="absolute" t={0} r={0} b={0} l={0} pointerEvents="none" items="center" justify="center">
        <View width={248} height={248} rounded={24} borderWidth={3} borderColor="white" />
      </View>

      <View position="absolute" t={insets.top + 8} l={12}>
        <Button
          circular
          width={42}
          height={42}
          p="$0"
          bg="rgba(0,0,0,0.48)"
          icon={<X size={ICON_BUTTON_ICON_SIZE} color="white" />}
          onPress={close}
          aria-label={t('closeScanner', { defaultValue: '关闭扫码' })}
        />
      </View>

      <XStack position="absolute" l={24} r={24} b={insets.bottom + 24} items="center" justify="center" gap="$2">
        <XStack minH={44} px="$3" rounded="$4" bg="rgba(0,0,0,0.58)" items="center" gap="$2">
          <ScanLine size={ICON_BUTTON_ICON_SIZE} color="white" />
          <Text color="white" fontSize="$footnote" fontWeight="600" numberOfLines={1}>
            {t('positionTheQrCodeFromTheSharedImageInsideTheFrame', { defaultValue: '将分享图片中的二维码放入框内' })}
          </Text>
        </XStack>
        <Button
          circular
          width={44}
          height={44}
          p="$0"
          bg="rgba(0,0,0,0.64)"
          icon={
            pickingImage ? (
              <Spinner size="small" color="white" />
            ) : (
              <Images size={ICON_BUTTON_ICON_SIZE} color="white" />
            )
          }
          disabled={pickingImage}
          accessibilityState={{ disabled: pickingImage }}
          opacity={pickingImage ? 0.65 : 1}
          onPress={() => void pickQrImage()}
          aria-label={t('chooseQrCodeFromPhotos', { defaultValue: '从相册选择二维码' })}
          position="absolute"
          r={0}
        />
      </XStack>
    </View>
  );
}
