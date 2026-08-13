import {
  checkBinaryUpdate,
  downloadAndInstallBinaryUpdate,
  type BinaryDownloadProgress,
  type BinaryUpdate,
} from '@/services/app-update';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Updates from 'expo-updates';

export type AppUpdateManager = {
  binaryUpdate: BinaryUpdate | null;
  isBinaryUpdateVisible: boolean;
  hotUpdateReady: boolean;
  isChecking: boolean;
  isDownloadingBinary: boolean;
  binaryProgress: BinaryDownloadProgress | null;
  checkNow: () => Promise<BinaryUpdate | null>;
  installBinaryUpdate: () => Promise<void>;
  reloadForHotUpdate: () => Promise<void>;
  showBinaryUpdate: () => void;
  dismissBinaryUpdate: () => void;
  dismissHotUpdate: () => void;
};

export function useAppUpdates(): AppUpdateManager {
  const [binaryUpdate, setBinaryUpdate] = useState<BinaryUpdate | null>(null);
  const [isBinaryUpdateVisible, setIsBinaryUpdateVisible] = useState(false);
  const [hotUpdateReady, setHotUpdateReady] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloadingBinary, setIsDownloadingBinary] = useState(false);
  const [binaryProgress, setBinaryProgress] = useState<BinaryDownloadProgress | null>(null);
  const isCheckingRef = useRef(false);

  const checkNow = useCallback(async () => {
    if (__DEV__ || isCheckingRef.current) return null;
    isCheckingRef.current = true;
    setIsChecking(true);

    try {
      const [binaryResult, hotResult] = await Promise.allSettled([
        checkBinaryUpdate(),
        Updates.isEnabled ? Updates.checkForUpdateAsync() : Promise.resolve({ isAvailable: false }),
      ]);

      if (binaryResult.status === 'fulfilled' && binaryResult.value) {
        setBinaryUpdate(binaryResult.value);
        setIsBinaryUpdateVisible(true);
      }

      if (hotResult.status === 'fulfilled' && hotResult.value.isAvailable) {
        const fetched = await Updates.fetchUpdateAsync();
        if (fetched.isNew) setHotUpdateReady(true);
      }
      if (binaryResult.status === 'rejected') throw binaryResult.reason;
      return binaryResult.value;
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  }, []);

  const installBinaryUpdate = useCallback(async () => {
    if (!binaryUpdate || isDownloadingBinary) return;
    setIsDownloadingBinary(true);
    setBinaryProgress({ bytesWritten: 0, totalBytes: 0, percent: 0 });

    try {
      await downloadAndInstallBinaryUpdate(binaryUpdate, setBinaryProgress);
    } finally {
      setIsDownloadingBinary(false);
    }
  }, [binaryUpdate, isDownloadingBinary]);

  const reloadForHotUpdate = useCallback(async () => {
    await Updates.reloadAsync();
  }, []);

  useEffect(() => {
    void checkNow().catch((error) => {
      console.warn('Failed to check app updates', error);
    });
  }, [checkNow]);

  return {
    binaryUpdate,
    isBinaryUpdateVisible,
    hotUpdateReady,
    isChecking,
    isDownloadingBinary,
    binaryProgress,
    checkNow,
    installBinaryUpdate,
    reloadForHotUpdate,
    showBinaryUpdate: () => {
      if (binaryUpdate) setIsBinaryUpdateVisible(true);
    },
    dismissBinaryUpdate: () => setIsBinaryUpdateVisible(false),
    dismissHotUpdate: () => setHotUpdateReady(false),
  };
}
