import LayerSwitch from '@/components/layer-switch';
import LoadingBadge from '@/components/loading-badge';
import LocateButton from '@/components/locate-button';
import MapContainer from '@/components/map-container';
import MapTopBangumiIcons from '@/components/map-top-bangumi-icons';
import PointImageMarkerSwitch from '@/components/point-image-marker-switch';
import { StrictButton as Button } from '@/components/strict-button';
import { getPointFlyToZoom } from '@/lib/map-camera';
import type { Bangumi, Point } from '@/services/types';
import { type MapPointReference } from '@/store/use-map-browse';
import { useMapData } from '@/store/use-map-data';
import { usePlans } from '@/store/use-plans';
import type { Camera, Location } from '@rnmapbox/maps';
import { locationManager } from '@rnmapbox/maps';
import { ArrowLeft } from '@tamagui/lucide-icons-2';
import { requestForegroundPermissionsAsync } from 'expo-location';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, YStack } from 'tamagui';

type CameraState = {
  zoom: number;
  bounds: { ne: [number, number]; sw: [number, number] } | null;
};

const POINT_CAMERA_TOP_PADDING = 110;
const POINT_CAMERA_BOTTOM_PADDING = 24;

function findPoint(bangumis: Bangumi[], reference: MapPointReference | null): Point | null {
  if (!reference) return null;
  return (
    bangumis
      .find((bangumi) => bangumi.id === reference.bangumiId)
      ?.points.find((point) => point.id === reference.pointId) ?? null
  );
}

export default function PlanMapScreen() {
  const { planId, bangumiId, pointId } = useLocalSearchParams<{
    planId: string;
    bangumiId?: string;
    pointId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);
  const latestLocationRef = useRef<Location | null>(null);
  const initialCameraApplied = useRef(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [styleIndex, setStyleIndex] = useState(0);
  const [showPointImageMarkers, setShowPointImageMarkers] = useState(true);
  const [selectedBangumiIds, setSelectedBangumiIds] = useState<number[]>([]);
  const [cameraState, setCameraState] = useState<CameraState>({ zoom: 4.6, bounds: null });
  const plan = usePlans((state) => state.plans.find((item) => item.id === planId));
  const data = useMapData((state) => state.data);
  const progress = useMapData((state) => state.progress);

  const initialPointReference = useMemo<MapPointReference | null>(() => {
    const parsedBangumiId = Number(bangumiId);
    return pointId && Number.isFinite(parsedBangumiId) ? { bangumiId: parsedBangumiId, pointId } : null;
  }, [bangumiId, pointId]);
  const [selectedPoint, setSelectedPoint] = useState<MapPointReference | null>(initialPointReference);

  const bangumis = useMemo<Bangumi[]>(() => {
    if (!plan || !data) return [];

    const pointIdsByBangumi = new Map<number, Set<string>>();
    for (const item of plan.items) {
      const pointIds = pointIdsByBangumi.get(item.bangumiId) ?? new Set<string>();
      pointIds.add(item.pointId);
      pointIdsByBangumi.set(item.bangumiId, pointIds);
    }

    return data.data.bangumis.flatMap((bangumi) => {
      const pointIds = pointIdsByBangumi.get(bangumi.id);
      if (!pointIds) return [];
      const points = bangumi.points.filter((point) => pointIds.has(point.id));
      return points.length > 0 ? [{ ...bangumi, points }] : [];
    });
  }, [data, plan]);

  const setCamera = useCallback((camera: Camera | null) => {
    cameraRef.current = camera;
  }, []);
  const handleUserLocationUpdate = useCallback((location: Location) => {
    latestLocationRef.current = location;
  }, []);

  useEffect(() => {
    requestForegroundPermissionsAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (!isMapReady || initialCameraApplied.current || bangumis.length === 0) return;

    const camera = cameraRef.current;
    if (!camera) return;

    const initialPoint = findPoint(bangumis, initialPointReference);
    if (initialPoint) {
      camera.setCamera({
        centerCoordinate: [initialPoint.geo[1], initialPoint.geo[0]],
        zoomLevel: getPointFlyToZoom(initialPoint.density),
        animationMode: 'flyTo',
        padding: {
          paddingTop: insets.top + POINT_CAMERA_TOP_PADDING,
          paddingRight: 0,
          paddingBottom: insets.bottom + POINT_CAMERA_BOTTOM_PADDING,
          paddingLeft: 0,
        },
      });
      initialCameraApplied.current = true;
      return;
    }

    const points = bangumis
      .flatMap((bangumi) => bangumi.points)
      .filter((point) => point.geo[0] !== 0 || point.geo[1] !== 0);
    if (points.length === 0) return;
    if (points.length === 1) {
      const [lat, lng] = points[0].geo;
      camera.setCamera({
        centerCoordinate: [lng, lat],
        zoomLevel: getPointFlyToZoom(points[0].density),
        animationMode: 'flyTo',
        animationDuration: 500,
      });
    } else {
      const latitudes = points.map((point) => point.geo[0]);
      const longitudes = points.map((point) => point.geo[1]);
      camera.fitBounds(
        [Math.max(...longitudes), Math.max(...latitudes)],
        [Math.min(...longitudes), Math.min(...latitudes)],
        [insets.top + 120, 60, insets.bottom + 60, 60],
        500,
      );
    }
    initialCameraApplied.current = true;
  }, [bangumis, initialPointReference, insets.bottom, insets.top, isMapReady]);

  const handleToggleBangumi = useCallback(
    (id: number, visibleBangumiIds: number[]) => {
      const wasSelected = selectedBangumiIds.includes(id);
      const visibleIds = new Set(visibleBangumiIds);
      const visibleSelectedIds = selectedBangumiIds.filter((selectedId) => visibleIds.has(selectedId));
      const nextSelectedIds = wasSelected
        ? visibleSelectedIds.filter((selectedId) => selectedId !== id)
        : [...visibleSelectedIds, id];

      setSelectedBangumiIds(nextSelectedIds);
      if (selectedPoint && nextSelectedIds.length > 0 && !nextSelectedIds.includes(selectedPoint.bangumiId)) {
        setSelectedPoint(null);
      }
    },
    [selectedBangumiIds, selectedPoint],
  );

  const handleLocate = useCallback(async () => {
    try {
      const { status } = await requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('位置权限被拒绝', '请在设置中允许访问位置信息以使用此功能。');
        return;
      }

      let location = latestLocationRef.current ?? (await locationManager.getLastKnownLocation());
      if (!location) {
        location = await new Promise<Location>((resolve) => {
          const listener = (nextLocation: Location) => {
            locationManager.removeListener(listener);
            resolve(nextLocation);
          };
          locationManager.addListener(listener);
        });
      }

      cameraRef.current?.setCamera({
        centerCoordinate: [location.coords.longitude, location.coords.latitude],
        zoomLevel: 15,
        animationMode: 'flyTo',
        animationDuration: 1000,
      });
    } catch {
      Alert.alert('定位失败', '无法获取当前位置，请检查位置服务是否已开启。');
    }
  }, []);

  return (
    <View flex={1}>
      <Stack.Screen options={{ headerShown: false }} />
      {plan ? (
        <>
          <MapContainer
            ref={setCamera}
            mode="plan"
            insets={insets}
            bangumis={bangumis}
            styleIndex={styleIndex}
            showPointImageMarkers={showPointImageMarkers}
            onMapReady={() => setIsMapReady(true)}
            selectedPoint={selectedPoint}
            selectedBangumiIds={selectedBangumiIds}
            onPointSelect={setSelectedPoint}
            onMapPress={() => setSelectedPoint(null)}
            onCameraChange={setCameraState}
            onUserLocationUpdate={handleUserLocationUpdate}
          />

          <YStack position="absolute" l="$0" r="$0" t={insets.top} z={20} pointerEvents="box-none">
            <View height={40} l="$3" justify="center" pointerEvents="box-none">
              <Button
                chromeless
                circular
                width={40}
                height={40}
                p="$0"
                icon={<ArrowLeft size={26} strokeWidth={2.25} color="$primary" />}
                onPress={() => router.back()}
                aria-label="返回巡礼计划"
              />
            </View>
            <MapTopBangumiIcons
              bangumis={bangumis}
              zoom={cameraState.zoom}
              bounds={cameraState.bounds}
              alwaysVisible
              showOpenedBangumiDetails={false}
              filter={{
                selectedBangumiIds,
                onToggleBangumi: handleToggleBangumi,
                onClear: () => setSelectedBangumiIds([]),
              }}
            />
          </YStack>

          <YStack r="$2" p="$1.5" position="absolute" t={200} z={20} gap="$3">
            <LayerSwitch styleIndex={styleIndex} onChange={setStyleIndex} />
            <PointImageMarkerSwitch visible={showPointImageMarkers} onChange={setShowPointImageMarkers} />
          </YStack>

          <YStack r="$2" p="$1.5" position="absolute" b="26%" z={20} gap="$3">
            <LocateButton onPress={handleLocate} />
          </YStack>

          {progress && <LoadingBadge progress={progress} insets={insets} />}
        </>
      ) : (
        <YStack flex={1} bg="$background" items="center" justify="center">
          <Text color="$color11">计划不存在或已被删除</Text>
          <View position="absolute" l="$1" t={insets.top}>
            <Button
              chromeless
              width={44}
              height={44}
              p="$0"
              icon={<ArrowLeft size={26} strokeWidth={2.25} color="$color12" />}
              onPress={() => router.back()}
              aria-label="返回巡礼计划"
            />
          </View>
        </YStack>
      )}
    </View>
  );
}
