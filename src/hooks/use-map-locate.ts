import Toast from '@modules/toaster';
import { locationManager, type Camera, type Location as MapboxLocation } from '@rnmapbox/maps';
import { hasServicesEnabledAsync, requestForegroundPermissionsAsync } from 'expo-location';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

const CURRENT_LOCATION_TIMEOUT_MS = 10_000;

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

export function useMapLocate(cameraRef: RefObject<Camera | null>) {
  const latestLocationRef = useRef<MapboxLocation | null>(null);
  const pendingLocationResolversRef = useRef(new Set<(location: MapboxLocation) => void>());
  const isSubscribedRef = useRef(false);
  const locatingRef = useRef(false);
  const [isLocating, setIsLocating] = useState(false);

  const handleLocationUpdate = useCallback((location: MapboxLocation) => {
    if (!isValidLocation(location)) return;

    latestLocationRef.current = location;
    pendingLocationResolversRef.current.forEach((resolve) => resolve(location));
    pendingLocationResolversRef.current.clear();
  }, []);

  const startLocationUpdates = useCallback(() => {
    if (isSubscribedRef.current) return;

    locationManager.addListener(handleLocationUpdate);
    isSubscribedRef.current = true;
  }, [handleLocationUpdate]);

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

  useEffect(() => {
    let isMounted = true;
    const pendingLocationResolvers = pendingLocationResolversRef.current;

    requestForegroundPermissionsAsync()
      .then(({ status }) => {
        if (isMounted && status === 'granted') startLocationUpdates();
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      pendingLocationResolvers.clear();

      if (isSubscribedRef.current) {
        locationManager.removeListener(handleLocationUpdate);
        isSubscribedRef.current = false;
      }
    };
  }, [handleLocationUpdate, startLocationUpdates]);

  const handleLocate = useCallback(async () => {
    if (locatingRef.current) return;

    // 地图页加载时已经持续订阅位置。像主流地图应用一样，点击只使用
    // 当前维护的位置移动相机，不再为了等待一个“更新”的定位而阻塞。
    if (isValidLocation(latestLocationRef.current)) {
      moveToLocation(latestLocationRef.current);
      return;
    }

    locatingRef.current = true;
    setIsLocating(true);

    try {
      const { status } = await requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('位置权限被拒绝', '请在设置中允许访问位置信息以使用此功能。');
        return;
      }

      if (!(await hasServicesEnabledAsync())) {
        Alert.alert('定位服务未开启', '请先开启手机定位服务后重试。');
        return;
      }

      startLocationUpdates();

      const cachedLocation = await locationManager.getLastKnownLocation();
      if (isValidLocation(cachedLocation)) {
        latestLocationRef.current = cachedLocation;
        moveToLocation(cachedLocation);
        return;
      }

      let resolveNextLocation: ((location: MapboxLocation) => void) | undefined;
      const nextLocationPromise = new Promise<MapboxLocation>((resolve) => {
        resolveNextLocation = resolve;
        pendingLocationResolversRef.current.add(resolve);
      });

      try {
        const location = await withTimeout(nextLocationPromise, CURRENT_LOCATION_TIMEOUT_MS);
        moveToLocation(location);
      } catch {
        Toast.show('定位超时，请稍后重试');
      } finally {
        if (resolveNextLocation) {
          pendingLocationResolversRef.current.delete(resolveNextLocation);
        }
      }
    } catch {
      Alert.alert('定位失败', '无法获取当前位置，请检查位置服务是否可用。');
    } finally {
      locatingRef.current = false;
      setIsLocating(false);
    }
  }, [moveToLocation, startLocationUpdates]);

  return { handleLocate, isLocating };
}
