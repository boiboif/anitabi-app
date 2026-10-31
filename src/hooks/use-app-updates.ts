import type { BinaryDownloadOptions, BinaryDownloadProgress, BinaryUpdate } from '@/services/app-update';
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
  const binaryDecisionRef = useRef<Promise<void> | null>(null);
  const binaryUpdateRef = useRef<BinaryUpdate | null>(null);
  const downloadRunningRef = useRef(false);

  const runBinaryDownload = useCallback(
    async (update: BinaryUpdate, options?: BinaryDownloadOptions) => {
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

        const result = await appUpdate.downloadAndInstallBinaryUpdate(update, setBinaryProgress, options);
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
      const binaryCheck = getAppUpdateModule().then(async (appUpdate) => {
        const update = await appUpdate.checkBinaryUpdate();
        if (update) {
          // Apply the installer result without waiting for the OTA service.
          binaryUpdateRef.current = update;
          setBinaryUpdate(update);
          // A newer installer takes priority even after its dialog is dismissed.
          setHotUpdateReady(false);
          const downloaded = appUpdate.isBinaryUpdateDownloaded(update);
          setIsBinaryDownloaded(downloaded);
          setBinaryProgress(downloaded ? null : appUpdate.getResumableBinaryDownloadProgress(update));
          setBinaryDownloadError(null);
          setIsBinaryUpdateVisible(true);
          // A system-managed transfer can outlive this JS runtime. Reattach to
          // its progress instead of asking the user to start another download.
          if (!downloaded && appUpdate.hasBackgroundBinaryUpdateDownload(update)) {
            void runBinaryDownload(update, { installWhenReady: false });
          }
        }
        return update;
      });
      // Publish the decision before yielding so an earlier OTA action can wait
      // for it. checkNow reports failures; this promise only tracks settlement.
      binaryDecisionRef.current = binaryCheck.then(
        () => undefined,
        () => undefined,
      );

      const hotCheck = import('expo-updates').then(async (Updates) => {
        if (!Updates.isEnabled) return { isAvailable: false, isNew: false };
        // Preserve the existing policy: a failed OTA check must not hide a
        // successful installer result. Download failures are still reported.
        const available = await Updates.checkForUpdateAsync().catch(() => null);
        if (!available?.isAvailable) return { isAvailable: false, isNew: false };
        const fetched = await Updates.fetchUpdateAsync();
        return { isAvailable: true, isNew: fetched.isNew };
      });

      const [binaryResult, hotResult] = await Promise.allSettled([binaryCheck, hotCheck]);
      // Download independently, but decide whether to prompt only after the
      // installer check has settled, regardless of which service was faster.
      if (hotResult.status === 'fulfilled' && hotResult.value.isNew && !binaryUpdateRef.current) {
        setHotUpdateReady(true);
      }
      if (hotResult.status === 'rejected') throw hotResult.reason;
      if (binaryResult.status === 'rejected') throw binaryResult.reason;
      return Boolean(binaryResult.value || hotResult.value.isAvailable);
    } finally {
      binaryDecisionRef.current = null;
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  }, [runBinaryDownload]);

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
    if (binaryUpdateRef.current) return;
    // An earlier OTA button must wait for the current installer decision,
    // without waiting for that check's OTA download to finish.
    while (binaryDecisionRef.current) {
      const decision = binaryDecisionRef.current;
      await decision;
      if (binaryDecisionRef.current === decision) break;
    }
    if (binaryUpdateRef.current) return;
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
