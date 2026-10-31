import type { AppUpdateManager } from '@/hooks/use-app-updates';
import Constants from 'expo-constants';
import { useEffect } from 'react';
import { AppState } from 'react-native';

type ReportedUpdateState = Pick<AppUpdateManager, 'hotUpdateReady' | 'binaryUpdate' | 'isChecking'>;

/** Optional local test probe. Production never loads the update/download modules through this hook. */
export function useUpdateTestReporter({ hotUpdateReady, binaryUpdate, isChecking }: ReportedUpdateState): void {
  const extra = Constants.expoConfig?.extra;
  const configuredUrl = extra?.appVariant === 'test' ? extra.updateTestServerUrl : undefined;
  const serverUrl =
    typeof configuredUrl === 'string' && /^https?:\/\//i.test(configuredUrl.trim())
      ? configuredUrl.trim().replace(/\/+$/, '')
      : null;
  const binaryUpdateBuildNumber = binaryUpdate?.buildNumber ?? null;

  useEffect(() => {
    if (!serverUrl) return;
    let disposed = false;
    const requests = new Set<AbortController>();

    const report = () => {
      void (async () => {
        let controller: AbortController | undefined;
        try {
          // Keep the normal startup path from eagerly evaluating FileSystem,
          // MMKV, Expo Updates, or the background downloader just for reporting.
          const [Updates, Application, appUpdate] = await Promise.all([
            import('expo-updates'),
            import('expo-application'),
            import('@/services/app-update'),
          ]);
          if (disposed) return;
          const versionInfo = appUpdate.getCurrentAppVersionInfo();
          controller = new AbortController();
          requests.add(controller);
          const response = await fetch(`${serverUrl}/reports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              updateId: Updates.updateId,
              isEmbeddedLaunch: Updates.isEmbeddedLaunch,
              runtimeVersion: Updates.runtimeVersion,
              packageName: Application.applicationId,
              nativeBuildVersion: Application.nativeBuildVersion,
              nativeApplicationVersion: Application.nativeApplicationVersion,
              displayVersion: versionInfo.displayVersion,
              contentRevision: versionInfo.contentRevision,
              hotUpdateReady,
              binaryUpdateBuildNumber,
              isChecking,
              appState: AppState.currentState,
              bundleMarker: process.env.EXPO_PUBLIC_OTA_TEST_MARKER ?? null,
            }),
          });
          if (!response.ok) throw new Error('Update test report was rejected');
        } catch {
          // A disconnected test server must never affect startup or updating.
        } finally {
          if (controller) requests.delete(controller);
        }
      })();
    };

    report();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') report();
    });
    return () => {
      disposed = true;
      subscription.remove();
      requests.forEach((request) => request.abort());
    };
  }, [serverUrl, hotUpdateReady, binaryUpdateBuildNumber, isChecking]);
}
