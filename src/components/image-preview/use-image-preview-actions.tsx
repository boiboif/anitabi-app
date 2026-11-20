import { ActionSheet, type ActionSheetRef } from '@/components/ui/action-sheet';
import type { PreviewImage } from '@/components/image-preview/image-preview';
import { deletePreviewFile, preparePreviewImage, PreviewImageFileError } from '@/lib/image-preview-files';
import { Toast } from '@boiboif/react-native-toast';
import { Download, Share2 } from '@/components/icons';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking } from 'react-native';

type ImageAction = 'save' | 'share';

export function useImagePreviewActions() {
  const { t } = useTranslation();
  const sheetRef = useRef<ActionSheetRef>(null);
  const menuOpenRef = useRef(false);
  const operationRef = useRef<AbortController | null>(null);
  const [menuImage, setMenuImage] = useState<PreviewImage | null>(null);
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
    const sheet = sheetRef.current;
    if (!sheet || menuOpenRef.current || operationRef.current) return;
    menuOpenRef.current = true;
    setMenuImage(image);
    void sheet.present().catch(() => {
      menuOpenRef.current = false;
      setMenuImage(null);
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
    menuOpen: menuImage !== null,
    busy,
    cancel: () => operationRef.current?.abort(),
    sheet: (
      <ActionSheet
        ref={sheetRef}
        onDidDismiss={() => {
          menuOpenRef.current = false;
          setMenuImage(null);
        }}
        sections={[
          {
            actions: [
              {
                label: t('imagePreviewSaveToPhotos'),
                icon: Download,
                onPress: () => {
                  if (menuImage) void runAction('save', menuImage);
                },
              },
              {
                label: t('shareImage'),
                icon: Share2,
                onPress: () => {
                  if (menuImage) void runAction('share', menuImage);
                },
              },
            ],
          },
        ]}
      />
    ),
  };
}
