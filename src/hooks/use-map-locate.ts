import { Toast } from '@boiboif/react-native-toast';
import { locationManager, type Camera, type Location as MapboxLocation } from '@rnmapbox/maps';
import { hasServicesEnabledAsync, requestForegroundPermissionsAsync } from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';

const CURRENT_LOCATION_TIMEOUT_MS = 10_000;
const FRESH_LOCATION_MAX_AGE_MS = 15_000;
const LOCATION_TIMESTAMP_FUTURE_TOLERANCE_MS = 5_000;
const PROVIDER_STALE_AFTER_MS = 60_000;
const PROVIDER_RECOVERY_COOLDOWN_MS = 60_000;
const PROVIDER_WATCHDOG_INTERVAL_MS = 15_000;

type LocationSnapshot = {
  location: MapboxLocation;
  receivedAt: number;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Location request timed out')), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function isValidLocation(location: MapboxLocation | null): location is MapboxLocation {
  if (!location) return false;

  const { latitude, longitude } = location.coords;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function getLocationTimestamp(location: MapboxLocation): number | null {
  return typeof location.timestamp === 'number' && Number.isFinite(location.timestamp)
    ? location.timestamp
    : null;
}

function isFreshLocation(location: MapboxLocation, now = Date.now()) {
  const timestamp = getLocationTimestamp(location);
  if (timestamp === null) return false;

  const age = now - timestamp;
  return age >= -LOCATION_TIMESTAMP_FUTURE_TOLERANCE_MS && age <= FRESH_LOCATION_MAX_AGE_MS;
}

export function useMapLocate(cameraRef: RefObject<Camera | null>) {
  const latestSnapshotRef = useRef<LocationSnapshot | null>(null);
  const pendingLocationResolversRef = useRef(new Set<(location: MapboxLocation) => void>());
  const followNextLocationUntilRef = useRef(0);
  const isSubscribedRef = useRef(false);
  const isFocusedRef = useRef(false);
  const isMountedRef = useRef(true);
  const hasLocationPermissionRef = useRef(false);
  const locatingRef = useRef(false);
  const focusStartedAtRef = useRef(0);
  const lastProviderRecoveryAtRef = useRef(0);
  const [isLocating, setIsLocating] = useState(false);
  const [isLocationPuckActive, setIsLocationPuckActive] = useState(false);
  const [locationPuckRevision, setLocationPuckRevision] = useState(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const moveToLocation = useCallback(
    (location: MapboxLocation) => {
      cameraRef.current?.setCamera({
        centerCoordinate: [location.coords.longitude, location.coords.latitude],
        zoomLevel: 15,
        animationMode: 'flyTo',
        animationDuration: 1000,
      });
    },
    [cameraRef],
  );

  const handleLocationUpdate = useCallback(
    (location: MapboxLocation) => {
      if (!isValidLocation(location)) return;

      const currentLocation = latestSnapshotRef.current?.location;
      const currentTimestamp = currentLocation ? getLocationTimestamp(currentLocation) : null;
      const nextTimestamp = getLocationTimestamp(location);
      if (currentTimestamp !== null && nextTimestamp !== null && nextTimestamp < currentTimestamp) return;

      const now = Date.now();
      latestSnapshotRef.current = { location, receivedAt: now };

      if (followNextLocationUntilRef.current >= now) {
        followNextLocationUntilRef.current = 0;
        moveToLocation(location);
      }

      if (isFreshLocation(location, now)) {
        pendingLocationResolversRef.current.forEach((resolve) => resolve(location));
        pendingLocationResolversRef.current.clear();
      }
    },
    [moveToLocation],
  );

  const startLocationUpdates = useCallback(() => {
    if (!isSubscribedRef.current) {
      locationManager.addListener(handleLocationUpdate);
      isSubscribedRef.current = true;
    }

    // addListener normally starts the native manager. Calling start is also needed
    // after Android suspended the provider while this JS listener stayed registered.
    locationManager.start(0);
  }, [handleLocationUpdate]);

  const stopLocationUpdates = useCallback(() => {
    if (!isSubscribedRef.current) return;

    locationManager.removeListener(handleLocationUpdate);
    isSubscribedRef.current = false;
  }, [handleLocationUpdate]);

  const recoverLocationProvider = useCallback(
    ({ force = false, remountPuck = false }: { force?: boolean; remountPuck?: boolean } = {}) => {
      if (!isFocusedRef.current || !hasLocationPermissionRef.current || AppState.currentState !== 'active') return;

      const now = Date.now();
      if (!force && now - lastProviderRecoveryAtRef.current < PROVIDER_RECOVERY_COOLDOWN_MS) return;

      lastProviderRecoveryAtRef.current = now;
      startLocationUpdates();

      // RNMapbox applies a displacement update by registering the native
      // DeviceLocationProvider observer again. Zero keeps every movement.
      locationManager.setMinDisplacement(0);

      if (remountPuck && isMountedRef.current) {
        setLocationPuckRevision((revision) => revision + 1);
      }
    },
    [startLocationUpdates],
  );

  const cacheLastKnownLocation = useCallback(async () => {
    try {
      const cachedLocation = await locationManager.getLastKnownLocation();
      if (isFocusedRef.current && isValidLocation(cachedLocation)) {
        handleLocationUpdate(cachedLocation);
      }
    } catch {
      // Cached data is only a fast path; live updates remain authoritative.
    }
  }, [handleLocationUpdate]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      isFocusedRef.current = true;
      focusStartedAtRef.current = Date.now();

      const activateLocation = async () => {
        try {
          const { status } = await requestForegroundPermissionsAsync();
          if (cancelled || !isFocusedRef.current) return;

          hasLocationPermissionRef.current = status === 'granted';
          setIsLocationPuckActive(status === 'granted' && AppState.currentState === 'active');
          if (status !== 'granted') return;

          startLocationUpdates();
          recoverLocationProvider({ force: true });
          await cacheLastKnownLocation();
        } catch {
          if (!cancelled && isMountedRef.current) setIsLocationPuckActive(false);
        }
      };

      void activateLocation();

      let previousAppState: AppStateStatus = AppState.currentState;
      const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
        const becameActive = previousAppState !== 'active' && nextAppState === 'active';
        previousAppState = nextAppState;

        if (nextAppState !== 'active') {
          if (isMountedRef.current) setIsLocationPuckActive(false);
          return;
        }

        if (becameActive && hasLocationPermissionRef.current) {
          if (isMountedRef.current) setIsLocationPuckActive(true);
          recoverLocationProvider({ force: true, remountPuck: true });
          void cacheLastKnownLocation();
        }
      });

      const watchdogId = setInterval(() => {
        if (!isFocusedRef.current || !hasLocationPermissionRef.current || AppState.currentState !== 'active') return;

        const lastReceivedAt = latestSnapshotRef.current?.receivedAt ?? focusStartedAtRef.current;
        if (Date.now() - lastReceivedAt >= PROVIDER_STALE_AFTER_MS) {
          recoverLocationProvider();
        }
      }, PROVIDER_WATCHDOG_INTERVAL_MS);

      return () => {
        cancelled = true;
        isFocusedRef.current = false;
        followNextLocationUntilRef.current = 0;
        clearInterval(watchdogId);
        appStateSubscription.remove();
        stopLocationUpdates();
        pendingLocationResolversRef.current.clear();
        locatingRef.current = false;
        if (isMountedRef.current) {
          setIsLocating(false);
          setIsLocationPuckActive(false);
        }
      };
    }, [cacheLastKnownLocation, recoverLocationProvider, startLocationUpdates, stopLocationUpdates]),
  );

  const waitForFreshLocation = useCallback(() => {
    let resolveNextLocation!: (location: MapboxLocation) => void;
    const nextLocationPromise = new Promise<MapboxLocation>((resolve) => {
      resolveNextLocation = resolve;
      pendingLocationResolversRef.current.add(resolve);
    });

    const latestLocation = latestSnapshotRef.current?.location;
    if (latestLocation && isFreshLocation(latestLocation)) {
      pendingLocationResolversRef.current.delete(resolveNextLocation);
      resolveNextLocation(latestLocation);
    }

    return {
      promise: withTimeout(nextLocationPromise, CURRENT_LOCATION_TIMEOUT_MS),
      cancel: () => {
        pendingLocationResolversRef.current.delete(resolveNextLocation);
      },
    };
  }, []);

  const handleLocate = useCallback(async () => {
    if (locatingRef.current) return;

    try {
      const { status } = await requestForegroundPermissionsAsync();
      hasLocationPermissionRef.current = status === 'granted';
      if (status !== 'granted') {
        Alert.alert('位置权限被拒绝', '请在设置中允许访问位置信息以使用此功能。');
        return;
      }

      if (!(await hasServicesEnabledAsync())) {
        Alert.alert('定位服务未开启', '请先开启手机定位服务后重试。');
        return;
      }

      if (isMountedRef.current) setIsLocationPuckActive(true);
      startLocationUpdates();

      const latestLocation = latestSnapshotRef.current?.location ?? null;
      if (isValidLocation(latestLocation)) {
        moveToLocation(latestLocation);

        if (!isFreshLocation(latestLocation)) {
          // Move immediately to the last position, then silently repair the
          // provider and refine the camera on the next update.
          followNextLocationUntilRef.current = Date.now() + CURRENT_LOCATION_TIMEOUT_MS;
          recoverLocationProvider({ force: true, remountPuck: true });
        }
        return;
      }

      const cachedLocation = await locationManager.getLastKnownLocation();
      if (isValidLocation(cachedLocation)) {
        handleLocationUpdate(cachedLocation);
        moveToLocation(cachedLocation);

        if (!isFreshLocation(cachedLocation)) {
          followNextLocationUntilRef.current = Date.now() + CURRENT_LOCATION_TIMEOUT_MS;
          recoverLocationProvider({ force: true, remountPuck: true });
        }
        return;
      }

      locatingRef.current = true;
      if (isMountedRef.current) setIsLocating(true);
      recoverLocationProvider({ force: true, remountPuck: true });

      const pendingLocation = waitForFreshLocation();
      try {
        moveToLocation(await pendingLocation.promise);
      } catch {
        if (isFocusedRef.current) {
          Toast.show('暂时无法获取当前位置，请稍后重试');
        }
      } finally {
        pendingLocation.cancel();
      }
    } catch {
      Alert.alert('定位失败', '无法获取当前位置，请检查位置服务是否可用。');
    } finally {
      locatingRef.current = false;
      if (isMountedRef.current) setIsLocating(false);
    }
  }, [handleLocationUpdate, moveToLocation, recoverLocationProvider, startLocationUpdates, waitForFreshLocation]);

  return {
    handleLocate,
    isLocating,
    isLocationPuckActive,
    locationPuckRevision,
  };
}
