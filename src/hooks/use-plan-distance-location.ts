import {
  Accuracy,
  getForegroundPermissionsAsync,
  hasServicesEnabledAsync,
  requestForegroundPermissionsAsync,
  watchPositionAsync,
  type LocationPermissionResponse,
  type LocationSubscription,
} from 'expo-location';
import { useIsFocused } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isValidCoordinate, type PlanDistanceLocation } from '@/utils/plan-point-distances';

type LocationError = 'permission' | 'services' | 'unavailable';
type DistanceLocationState = {
  location: PlanDistanceLocation | null;
  isLocating: boolean;
  error: LocationError | null;
};

const EMPTY_STATE: DistanceLocationState = { location: null, isLocating: false, error: null };
const FIRST_LOCATION_TIMEOUT_MS = 20_000;

/** A screen-scoped foreground watch; opening distance mode is the permission request intent. */
export function usePlanDistanceLocation(enabled: boolean) {
  const isFocused = useIsFocused();
  const [state, setState] = useState<DistanceLocationState>(EMPTY_STATE);
  const [retryRevision, setRetryRevision] = useState(0);
  const permissionAttempted = useRef(false);
  const pendingPermission = useRef<Promise<LocationPermissionResponse> | null>(null);
  const screenActive = enabled && isFocused;

  // Clear a previous screen session before rendering it again; inactive output is
  // derived directly from the inputs instead of synchronizing it in an effect.
  if (!screenActive && state !== EMPTY_STATE) setState(EMPTY_STATE);

  useEffect(() => {
    if (!enabled) permissionAttempted.current = false;
    if (!enabled || !isFocused) return;

    let disposed = false;
    let active = AppState.currentState === 'active';
    let revision = 0;
    let starting = false;
    let restartRequested = false;
    let creatingWatch = false;
    let receivedFirstFix = false;
    let subscription: LocationSubscription | null = null;
    let firstFixTimeout: ReturnType<typeof setTimeout> | null = null;
    let latestTimestamp = 0;

    const clearFirstFixTimeout = () => {
      if (firstFixTimeout !== null) clearTimeout(firstFixTimeout);
      firstFixTimeout = null;
    };

    const stopWatch = () => {
      revision++;
      clearFirstFixTimeout();
      receivedFirstFix = false;
      subscription?.remove();
      subscription = null;
    };

    const waitForFirstFix = () => {
      if (firstFixTimeout !== null) return;
      const timeoutRevision = revision;
      firstFixTimeout = setTimeout(() => {
        firstFixTimeout = null;
        if (disposed || !active || revision !== timeoutRevision) return;
        // A successful subscription does not guarantee that the provider has a fix.
        // Invalidating the revision also rejects callbacks from a still-pending watch.
        restartRequested = false;
        stopWatch();
        setState({ location: null, isLocating: false, error: 'unavailable' });
      }, FIRST_LOCATION_TIMEOUT_MS);
    };

    const startWatch = async () => {
      if (disposed || !active || subscription) return;
      if (starting) {
        restartRequested = true;
        // Native creation may still be pending when the app resumes. Bound that
        // wait too, without timing out a foreground permission dialog.
        if (creatingWatch && !receivedFirstFix) {
          setState({ location: null, isLocating: true, error: null });
          waitForFirstFix();
        }
        return;
      }
      starting = true;
      setState({ location: null, isLocating: true, error: null });
      try {
        const existingRequest = pendingPermission.current;
        if (existingRequest) permissionAttempted.current = true;
        let permission = await (existingRequest ?? getForegroundPermissionsAsync());
        if (disposed || !active) return;
        if (!permission.granted && !permissionAttempted.current) {
          // AppState can become inactive while the system permission sheet is open.
          // Keep this intent alive; only the watch itself is invalidated on suspension.
          permissionAttempted.current = true;
          const request = requestForegroundPermissionsAsync();
          pendingPermission.current = request;
          try {
            permission = await request;
          } finally {
            if (pendingPermission.current === request) pendingPermission.current = null;
          }
        } else if (permission.granted) {
          permissionAttempted.current = true;
        }
        if (disposed) return;
        if (!permission.granted) {
          setState({ location: null, isLocating: false, error: 'permission' });
          return;
        }
        if (!active) return;

        const watchRevision = revision;
        const isCurrent = () => !disposed && active && revision === watchRevision;
        const servicesEnabled = await hasServicesEnabledAsync();
        if (!isCurrent()) return;
        if (!servicesEnabled) {
          setState({ location: null, isLocating: false, error: 'services' });
          return;
        }

        let failed = false;
        creatingWatch = true;
        receivedFirstFix = false;
        // A permission/settings dialog may have cleared the visible loading state.
        setState({ location: null, isLocating: true, error: null });
        waitForFirstFix();
        const watch = await watchPositionAsync(
          { accuracy: Accuracy.Balanced, distanceInterval: 10, timeInterval: 10_000 },
          (location) => {
            if (!isCurrent() || failed) return;
            const { latitude, longitude } = location.coords;
            const age = Date.now() - location.timestamp;
            if (
              !isValidCoordinate(latitude, longitude) ||
              !Number.isFinite(location.timestamp) ||
              age < -5_000 ||
              age > 60_000 ||
              location.timestamp < latestTimestamp
            ) {
              return;
            }
            latestTimestamp = location.timestamp;
            receivedFirstFix = true;
            clearFirstFixTimeout();
            setState({ location: { latitude, longitude }, isLocating: false, error: null });
          },
          () => {
            if (!isCurrent()) return;
            failed = true;
            clearFirstFixTimeout();
            subscription?.remove();
            subscription = null;
            setState({ location: null, isLocating: false, error: 'unavailable' });
          },
        );
        // Native watch creation can finish after blur, suspension, disable, or unmount.
        if (!isCurrent() || failed) watch.remove();
        else subscription = watch;
      } catch {
        clearFirstFixTimeout();
        if (!disposed && active) setState({ location: null, isLocating: false, error: 'unavailable' });
      } finally {
        creatingWatch = false;
        starting = false;
        if (restartRequested) {
          restartRequested = false;
          void startWatch();
        }
      }
    };

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      active = nextState === 'active';
      if (active) void startWatch();
      else {
        stopWatch();
        setState(EMPTY_STATE);
      }
    });
    void startWatch();

    return () => {
      disposed = true;
      appStateSubscription.remove();
      stopWatch();
    };
  }, [enabled, isFocused, retryRevision]);

  return {
    ...(screenActive ? state : EMPTY_STATE),
    retry: () => {
      permissionAttempted.current = false;
      setRetryRevision((current) => current + 1);
    },
  };
}
