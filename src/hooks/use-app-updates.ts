import type { BinaryDownloadProgress, BinaryUpdate } from '@/services/app-update';
import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type AppUpdateModule = typeof import('@/services/app-update');
let appUpdateModulePromise: Promise<AppUpdateModule> | null = null;
let loadedAppUpdateModule: AppUpdateModule | null = null;

function getAppUpdateModule(): Promise<AppUpdateModule> {
  if (!appUpdateModulePromise) {
    appUpdateModulePromise = import('@/services/app-update').then(
      (module) => {
        loadedAppUpdateModule = module;
        return module;
      },
      (error) => {
        appUpdateModulePromise = null;
        throw error;
      },
    );
  }
  return appUpdateModulePromise;
}

export type AppUpdateManager = {
  binaryUpdate: BinaryUpdate | null;
  isBinaryUpdateVisible: boolean;
  hotUpdateReady: boolean;
  isChecking: boolean;
  isDownloadingBinary: boolean;
  isBinaryDownloaded: boolean;
  binaryProgress: BinaryDownloadProgress | null;
  binaryDownloadError: string | null;
  checkNow: () => Promise<boolean>;
  installBinaryUpdate: () => Promise<void>;
  cancelBinaryUpdate: () => void;
  downloadBinaryUpdateInBrowser: () => Promise<void>;
  reloadForHotUpdate: () => Promise<void>;
  showBinaryUpdate: () => void;
  dismissBinaryUpdate: () => void;
  dismissHotUpdate: () => void;
};

export function useAppUpdates(): AppUpdateManager {
  const { t } = useTranslation();
  const [binaryUpdate, setBinaryUpdate] = useState<BinaryUpdate | null>(null);
  const [isBinaryUpdateVisible, setIsBinaryUpdateVisible] = useState(false);
  const [hotUpdateReady, setHotUpdateReady] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloadingBinary, setIsDownloadingBinary] = useState(false);
  const [isBinaryDownloaded, setIsBinaryDownloaded] = useState(false);
  const [binaryProgress, setBinaryProgress] = useState<BinaryDownloadProgress | null>(null);
  const [binaryDownloadError, setBinaryDownloadError] = useState<string | null>(null);
  const isCheckingRef = useRef(false);
  const binaryUpdateRef = useRef<BinaryUpdate | null>(null);
  const downloadRunningRef = useRef(false);

  const runBinaryDownload = useCallback(
    async (update: BinaryUpdate) => {
      if (downloadRunningRef.current) return;

      downloadRunningRef.current = true;
      setIsDownloadingBinary(true);
      setBinaryDownloadError(null);
      let appUpdate: AppUpdateModule | null = null;
      try {
        appUpdate = await getAppUpdateModule();
        const downloaded = appUpdate.isBinaryUpdateDownloaded(update);
        setIsBinaryDownloaded(downloaded);
        if (!downloaded) {
          const resumableProgress = appUpdate.getResumableBinaryDownloadProgress(update);
          setBinaryProgress(
            (current) =>
              current ??
              resumableProgress ?? {
                bytesWritten: 0,
                totalBytes: 0,
                percent: 0,
              },
          );
        }

        const result = await appUpdate.downloadAndInstallBinaryUpdate(update, setBinaryProgress);
        if (result === 'cancelled') {
          setBinaryProgress(null);
          setBinaryDownloadError(null);
        }
      } catch (error) {
        setBinaryDownloadError(
          t('downloadFailedCheckYourConnectionAndTryAgainOrUseTheBrowser', {
            defaultValue: '下载失败，请检查网络后重试，或使用浏览器下载。',
          }),
        );
        console.warn('Failed to download binary update', error);
      } finally {
        if (appUpdate) setIsBinaryDownloaded(appUpdate.isBinaryUpdateDownloaded(update));
        setIsDownloadingBinary(false);
        downloadRunningRef.current = false;
      }
    },
    [t],
  );

  const checkNow = useCallback(async () => {
    if (__DEV__ || Constants.expoConfig?.extra?.appUpdatesEnabled !== true || isCheckingRef.current) return false;
    isCheckingRef.current = true;
    setIsChecking(true);

    try {
      const [appUpdate, Updates] = await Promise.all([getAppUpdateModule(), import('expo-updates')]);
      const [binaryResult, hotResult] = await Promise.allSettled([
        appUpdate.checkBinaryUpdate(),
        Updates.isEnabled ? Updates.checkForUpdateAsync() : Promise.resolve({ isAvailable: false }),
      ]);

      if (binaryResult.status === 'fulfilled' && binaryResult.value) {
        binaryUpdateRef.current = binaryResult.value;
        setBinaryUpdate(binaryResult.value);
        const downloaded = appUpdate.isBinaryUpdateDownloaded(binaryResult.value);
        setIsBinaryDownloaded(downloaded);
        setBinaryProgress(downloaded ? null : appUpdate.getResumableBinaryDownloadProgress(binaryResult.value));
        setBinaryDownloadError(null);
        setIsBinaryUpdateVisible(true);
      }

      if (hotResult.status === 'fulfilled' && hotResult.value.isAvailable) {
        const fetched = await Updates.fetchUpdateAsync();
        if (fetched.isNew) setHotUpdateReady(true);
      }
      if (binaryResult.status === 'rejected') throw binaryResult.reason;
      return Boolean(binaryResult.value || (hotResult.status === 'fulfilled' && hotResult.value.isAvailable));
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  }, []);

  const installBinaryUpdate = useCallback(async () => {
    const update = binaryUpdateRef.current;
    if (!update || downloadRunningRef.current) return;
    await runBinaryDownload(update);
  }, [runBinaryDownload]);

  const cancelBinaryUpdate = useCallback(() => {
    loadedAppUpdateModule?.cancelBinaryUpdateDownload();
  }, []);

  const downloadBinaryUpdateInBrowser = useCallback(async () => {
    const update = binaryUpdateRef.current;
    if (!update) return;

    setBinaryDownloadError(null);
    try {
      const appUpdate = await getAppUpdateModule();
      if (downloadRunningRef.current) await appUpdate.pauseBinaryUpdateDownload();
      await appUpdate.openBinaryUpdateInBrowser(update);
    } catch (error) {
      setBinaryDownloadError(
        t('couldNotOpenTheBrowserPleaseTryAgainLater', { defaultValue: '无法打开浏览器，请稍后重试。' }),
      );
      console.warn('Failed to open binary update in browser', error);
    }
  }, [t]);

  const reloadForHotUpdate = useCallback(async () => {
    const Updates = await import('expo-updates');
    await Updates.reloadAsync();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let idleCallbackId: number | undefined;
    const timeoutId = setTimeout(() => {
      const checkWhenIdle = () => {
        if (cancelled) return;
        void checkNow().catch((error) => {
          console.warn('Failed to check app updates', error);
        });
      };

      if (typeof requestIdleCallback === 'function') {
        idleCallbackId = requestIdleCallback(checkWhenIdle, { timeout: 2_000 });
      } else {
        checkWhenIdle();
      }
    }, 1_500);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      if (idleCallbackId !== undefined && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(idleCallbackId);
      }
    };
  }, [checkNow]);

  return {
    binaryUpdate,
    isBinaryUpdateVisible,
    hotUpdateReady,
    isChecking,
    isDownloadingBinary,
    isBinaryDownloaded,
    binaryProgress,
    binaryDownloadError,
    checkNow,
    installBinaryUpdate,
    cancelBinaryUpdate,
    downloadBinaryUpdateInBrowser,
    reloadForHotUpdate,
    showBinaryUpdate: () => {
      if (binaryUpdate && loadedAppUpdateModule) {
        setIsBinaryDownloaded(loadedAppUpdateModule.isBinaryUpdateDownloaded(binaryUpdate));
        setBinaryProgress(loadedAppUpdateModule.getResumableBinaryDownloadProgress(binaryUpdate));
        setBinaryDownloadError(null);
        setIsBinaryUpdateVisible(true);
      }
    },
    dismissBinaryUpdate: () => setIsBinaryUpdateVisible(false),
    dismissHotUpdate: () => setHotUpdateReady(false),
  };
}
