import { ActionSheet, type ActionSheetRef } from '@/components/action-sheet';
import type { PreviewImage } from '@/components/image-preview';
import { deletePreviewFile, preparePreviewImage, PreviewImageFileError } from '@/lib/image-preview-files';
import { Toast } from '@boiboif/react-native-toast';
import { Download, Share2 } from '@tamagui/lucide-icons-2';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform } from 'react-native';

type ImageAction = 'save' | 'share';

export function useImagePreviewActions() {
  const { t } = useTranslation();
  const sheetRef = useRef<ActionSheetRef>(null);
  const targetRef = useRef<PreviewImage | null>(null);
  const menuOpenRef = useRef(false);
  const pendingRef = useRef<ImageAction | null>(null);
  const operationRef = useRef<AbortController | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState<ImageAction | null>(null);

  useEffect(() => () => operationRef.current?.abort(), []);

  const runAction = async (action: ImageAction, image: PreviewImage) => {
    if (operationRef.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    operationRef.current = controller;
    setBusy(action);
    let prepared: Awaited<ReturnType<typeof preparePreviewImage>> | undefined;
    let handedToSharing = false;
    try {
      if (Platform.OS === 'web') {
        Alert.alert(t('imagePreviewActionsUnavailableOnWeb'));
        return;
      }
      if (action === 'save') {
        const permission = await MediaLibrary.requestPermissionsAsync(true);
        if (signal.aborted) return;
        if (!permission.granted) {
          Alert.alert(t('couldNotSaveImage'), t('allowTheAppToAddPhotosToYourLibrary'), [
            { text: t('cancel'), style: 'cancel' },
            ...(!permission.canAskAgain
              ? [{ text: t('imagePreviewOpenSettings'), onPress: () => void Linking.openSettings().catch(() => {}) }]
              : []),
          ]);
          return;
        }
      } else if (!(await Sharing.isAvailableAsync())) {
        if (!signal.aborted) Alert.alert(t('systemSharingIsNotSupportedOnThisDevice'));
        return;
      }
      if (signal.aborted) return;
      prepared = await preparePreviewImage(image.uri, signal);
      if (signal.aborted) return;
      if (action === 'save') {
        await MediaLibrary.Asset.create(prepared.file.uri);
        if (!signal.aborted) Toast.show(t('imagePreviewSaved'));
      } else {
        handedToSharing = true;
        await Sharing.shareAsync(prepared.file.uri, {
          mimeType: prepared.mimeType,
          UTI: prepared.UTI,
          dialogTitle: t('shareImage'),
        });
      }
    } catch (error) {
      if (signal.aborted) return;
      console.error(`[image-preview] ${action} failed`, error);
      const message =
        error instanceof PreviewImageFileError
          ? t(error.reason === 'download' ? 'imagePreviewDownloadFailed' : 'imagePreviewUnsupportedFormat')
          : t(action === 'save' ? 'imagePreviewSaveFailed' : 'sharingFailedPleaseTryAgainLater');
      Alert.alert(action === 'save' ? t('saveFailed') : t('shareImage'), message);
    } finally {
      if (prepared && !handedToSharing) deletePreviewFile(prepared.file);
      if (operationRef.current === controller) operationRef.current = null;
      if (!signal.aborted) setBusy(null);
    }
  };

  const openMenu = (image: PreviewImage) => {
    if (menuOpenRef.current || operationRef.current) return;
    targetRef.current = image;
    pendingRef.current = null;
    menuOpenRef.current = true;
    setMenuOpen(true);
    void sheetRef.current?.present().catch(() => {
      menuOpenRef.current = false;
      setMenuOpen(false);
    });
  };

  const dismissMenu = () => {
    if (!menuOpenRef.current) return false;
    void sheetRef.current?.dismiss();
    return true;
  };

  return {
    openMenu,
    dismissMenu,
    menuOpen,
    busy,
    cancel: () => operationRef.current?.abort(),
    sheet: (
      <ActionSheet
        ref={sheetRef}
        onDidDismiss={() => {
          menuOpenRef.current = false;
          setMenuOpen(false);
          const action = pendingRef.current;
          const image = targetRef.current;
          pendingRef.current = null;
          // Present permissions/sharing only once the native sheet has dismissed.
          if (action && image) void runAction(action, image);
        }}
        sections={[
          {
            actions: [
              { label: t('imagePreviewSaveToPhotos'), icon: Download, onPress: () => (pendingRef.current = 'save') },
              { label: t('shareImage'), icon: Share2, onPress: () => (pendingRef.current = 'share') },
            ],
          },
        ]}
      />
    ),
  };
}
