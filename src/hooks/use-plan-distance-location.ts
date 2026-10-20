import { locationManager, type Location as MapboxLocation } from '@rnmapbox/maps';
import {
  getForegroundPermissionsAsync,
  hasServicesEnabledAsync,
  requestForegroundPermissionsAsync,
  type LocationPermissionResponse,
} from 'expo-location';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { distanceMeters, isValidCoordinate, type PlanDistanceLocation } from '@/utils/plan-point-distances';

export type PlanDistanceLocationError = 'permission' | 'services' | 'unavailable';
type DistanceLocationState = {
  location: PlanDistanceLocation | null;
  isLocating: boolean;
  error: PlanDistanceLocationError | null;
};

const EMPTY_STATE: DistanceLocationState = { location: null, isLocating: false, error: null };
const FIRST_LOCATION_TIMEOUT_MS = 20_000;
const MIN_LOCATION_DISPLACEMENT_METERS = 10;
const LOCATION_UPDATE_INTERVAL_MS = Platform.OS === 'android' ? 10_000 : 0;

/** A foreground Mapbox subscription; opening distance mode is the permission request intent. */
export function usePlanDistanceLocation(enabled: boolean, onError: (error: PlanDistanceLocationError) => void) {
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
    let subscription: (() => void) | null = null;
    let firstFixTimeout: ReturnType<typeof setTimeout> | null = null;
    let updateTimeout: ReturnType<typeof setTimeout> | null = null;
    let pendingLocation: MapboxLocation | null = null;
    let publishedLocation: PlanDistanceLocation | null = null;
    let publishedAt = 0;
    let latestTimestamp = 0;

    const clearFirstFixTimeout = () => {
      if (firstFixTimeout !== null) clearTimeout(firstFixTimeout);
      firstFixTimeout = null;
    };

    const clearPendingUpdate = () => {
      if (updateTimeout !== null) clearTimeout(updateTimeout);
      updateTimeout = null;
      pendingLocation = null;
    };

    const stopWatch = () => {
      revision++;
      clearFirstFixTimeout();
      clearPendingUpdate();
      publishedLocation = null;
      subscription?.();
      subscription = null;
    };

    const waitForFirstFix = () => {
      if (firstFixTimeout !== null) return;
      const timeoutRevision = revision;
      firstFixTimeout = setTimeout(() => {
        firstFixTimeout = null;
        if (disposed || !active || revision !== timeoutRevision) return;
        // A successful subscription does not guarantee that the provider has a fix.
        // Invalidating the revision also rejects a still-pending cached-location read.
        restartRequested = false;
        stopWatch();
        setState({ location: null, isLocating: false, error: 'unavailable' });
        onError('unavailable');
      }, FIRST_LOCATION_TIMEOUT_MS);
    };

    const startWatch = async () => {
      if (disposed || !active || subscription) return;
      if (starting) {
        restartRequested = true;
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
          if (active) onError('permission');
          return;
        }
        if (!active) return;

        const watchRevision = revision;
        const isCurrent = () => !disposed && active && revision === watchRevision;
        const servicesEnabled = await hasServicesEnabledAsync();
        if (!isCurrent()) return;
        if (!servicesEnabled) {
          setState({ location: null, isLocating: false, error: 'services' });
          onError('services');
          return;
        }

        // A permission/settings dialog may have cleared the visible loading state.
        setState({ location: null, isLocating: true, error: null });
        waitForFirstFix();
        const handleLocationUpdate = (location: MapboxLocation) => {
          if (!isCurrent()) return;
          const { latitude, longitude } = location.coords;
          const timestamp = location.timestamp;
          if (!isValidCoordinate(latitude, longitude) || typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
            return;
          }
          const now = Date.now();
          const age = now - timestamp;
          if (age < -5_000 || age > 60_000 || timestamp < latestTimestamp) return;
          latestTimestamp = timestamp;
          clearFirstFixTimeout();

          // Keep the previous 10m / Android 10s cadence local to this list. The
          // shared Mapbox provider must remain free to update the map more often.
          if (
            publishedLocation &&
            distanceMeters(publishedLocation.latitude, publishedLocation.longitude, latitude, longitude) <
              MIN_LOCATION_DISPLACEMENT_METERS
          ) {
            clearPendingUpdate();
            return;
          }
          const delay = LOCATION_UPDATE_INTERVAL_MS - (now - publishedAt);
          if (publishedLocation && delay > 0) {
            pendingLocation = location;
            if (updateTimeout === null) {
              updateTimeout = setTimeout(() => {
                updateTimeout = null;
                const pending = pendingLocation;
                pendingLocation = null;
                // Recheck session, freshness and displacement at delivery time.
                if (pending) handleLocationUpdate(pending);
              }, delay);
            }
            return;
          }

          clearPendingUpdate();
          publishedAt = now;
          publishedLocation = { latitude, longitude };
          setState({ location: publishedLocation, isLocating: false, error: null });
        };

        // addListener can replay a cached fix synchronously, so arm cleanup and
        // the first-fix deadline before registering. Remove only our own listener.
        subscription = () => locationManager.removeListener(handleLocationUpdate);
        locationManager.addListener(handleLocationUpdate);
        // A slow or unavailable cache must never block live updates or resume.
        void locationManager
          .getLastKnownLocation()
          .then((location) => {
            if (location) handleLocationUpdate(location);
          })
          .catch(() => {
            // The first-fix deadline still covers an unavailable live provider.
          });
      } catch {
        stopWatch();
        if (!disposed && active) {
          setState({ location: null, isLocating: false, error: 'unavailable' });
          onError('unavailable');
        }
      } finally {
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
  }, [enabled, isFocused, onError, retryRevision]);

  return {
    ...(screenActive ? state : EMPTY_STATE),
    retry: () => {
      permissionAttempted.current = false;
      setRetryRevision((current) => current + 1);
    },
  };
}
