import BangumiDetailSheet from '@/components/bangumi-detail-sheet';
import LayerSwitch from '@/components/layer-switch';
import LoadingBadge from '@/components/loading-badge';
import LocateButton from '@/components/locate-button';
import MapContainer from '@/components/map-container';
import MapTopBangumiIcons from '@/components/map-top-bangumi-icons';
import PointImageMarkerSwitch from '@/components/point-image-marker-switch';
import RandomPointButton from '@/components/random-point-button';
import SearchBox from '@/components/search-box';
import { FILTER_MODE_MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE } from '@/lib/constants';
import { useMapBrowse } from '@/store/use-map-browse';
import { useMapData } from '@/store/use-map-data';
import type { Camera, Location } from '@rnmapbox/maps';
import { locationManager } from '@rnmapbox/maps';
import { requestForegroundPermissionsAsync } from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, YStack } from 'tamagui';

type CameraState = {
  zoom: number;
  bounds: { ne: [number, number]; sw: [number, number] } | null;
};

function getPointFlyToZoom(density: number | undefined): number {
  if (density == null || density > 64) return 15;
  if (density > 32) return 16;
  if (density > 16) return 17;
  if (density > 8) return 18;
  if (density > 4) return 19;
  if (density > 2) return 20;
  if (density > 1) return 21;
  return 22;
}

export default function HomeScreen() {
  const cameraRef = useRef<Camera>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const insets = useSafeAreaInsets();
  const data = useMapData((state) => state.data);
  const progress = useMapData((state) => state.progress);
  const router = useRouter();
  const [cameraState, setCameraState] = useState<CameraState>({
    zoom: 4.6,
    bounds: null,
  });
  const [showPointImageMarkers, setShowPointImageMarkers] = useState(true);
  const setCameraRef = useCallback((camera: Camera | null) => {
    cameraRef.current = camera;
    setIsCameraReady(camera !== null);
  }, []);
  const handleCameraChange = useCallback((nextCameraState: CameraState) => {
    setCameraState(nextCameraState);
  }, []);

  useEffect(() => {
    // 首次进入即请求定位权限，使 LocationPuck 能正常显示
    requestForegroundPermissionsAsync().catch(() => {});
  }, []);

  const bangumis = useMemo(() => data?.data.bangumis ?? [], [data]);
  const openedBangumiDetailsId = useMapBrowse((state) => state.openedBangumiDetailsId);
  const mapCameraRequest = useMapBrowse((state) => state.mapCameraRequest);
  const focusPointFromMapControl = useMapBrowse((state) => state.focusPointFromMapControl);
  const completeMapCameraRequest = useMapBrowse((state) => state.completeMapCameraRequest);
  const randomPointCandidates = useMemo(
    () =>
      bangumis.flatMap((bangumi) =>
        bangumi.points
          .filter((point) => point.geo[0] !== 0 || point.geo[1] !== 0)
          .map((point) => ({ bangumiId: bangumi.id, pointId: point.id })),
      ),
    [bangumis],
  );
  const selectedBangumi = useMemo(
    () => bangumis?.find((bangumi) => bangumi.id === openedBangumiDetailsId) ?? null,
    [bangumis, openedBangumiDetailsId],
  );
  const mapCameraRequestData = useMemo(() => {
    if (!mapCameraRequest) return null;
    const bangumi = bangumis?.find((item) => item.id === mapCameraRequest.bangumiId);
    const point = bangumi?.points.find((item) => item.id === mapCameraRequest.pointId);
    return bangumi && point ? { request: mapCameraRequest, point } : null;
  }, [bangumis, mapCameraRequest]);

  useEffect(() => {
    if (!mapCameraRequestData) {
      if (data && mapCameraRequest) {
        completeMapCameraRequest(mapCameraRequest.id);
      }
      return;
    }
    const { request, point } = mapCameraRequestData;
    const camera = cameraRef.current;

    if (!isCameraReady || !camera) return;

    if (request.source === 'map-point-selection') {
      completeMapCameraRequest(request.id);
      return;
    }

    const { density } = point;
    const [lat, lng] = point.geo;

    const zoomLevel = getPointFlyToZoom(density);

    camera.setCamera({
      centerCoordinate: [lng, lat],
      zoomLevel,
      animationMode: 'flyTo',
      animationDuration: 1500,
    });
    completeMapCameraRequest(request.id);
  }, [completeMapCameraRequest, data, isCameraReady, mapCameraRequest, mapCameraRequestData, openedBangumiDetailsId]);

  const handleLocate = useCallback(async () => {
    try {
      const { status } = await requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('位置权限被拒绝', '请在设置中允许访问位置信息以使用此功能。');
        return;
      }

      // 尝试读缓存（LocationPuck 运行时大概率已缓存）
      let loc = await locationManager.getLastKnownLocation();

      if (!loc) {
        // 无缓存时订阅等待第一个位置更新
        loc = await new Promise<Location>((resolve) => {
          const listener = (l: Location) => {
            locationManager.removeListener(listener);
            resolve(l);
          };
          locationManager.addListener(listener);
        });
      }

      const { latitude, longitude } = loc.coords;
      cameraRef.current?.setCamera({
        centerCoordinate: [longitude, latitude],
        zoomLevel: 15,
        animationMode: 'flyTo',
        animationDuration: 1000,
      });
    } catch {
      Alert.alert('定位失败', '无法获取当前位置，请检查位置服务是否已开启。');
    }
  }, []);

  const handleRandomPoint = useCallback(() => {
    if (randomPointCandidates.length === 0) {
      Alert.alert('暂无巡礼点', '地图数据加载完成后再试。');
      return;
    }

    const randomIndex = Math.floor(Math.random() * randomPointCandidates.length);
    focusPointFromMapControl(randomPointCandidates[randomIndex]);
  }, [focusPointFromMapControl, randomPointCandidates]);

  const [styleIndex, setStyleIndex] = useState(0);

  return (
    <View style={styles.container}>
      <MapContainer
        ref={setCameraRef}
        insets={insets}
        bangumis={bangumis}
        styleIndex={styleIndex}
        showPointImageMarkers={showPointImageMarkers}
        onCameraChange={handleCameraChange}
      />

      <View position="absolute" l="$0" r="$0" t={insets.top === 0 ? '$2' : insets.top} pt="$2" z={0}>
        <View mx="$3">
          <SearchBox
            onPress={() => {
              router.navigate('/search');
            }}
            readOnly
          />
        </View>

        <MapTopBangumiIcons bangumis={bangumis} zoom={cameraState.zoom} bounds={cameraState.bounds} />
      </View>

      {progress && <LoadingBadge progress={progress} insets={insets} />}

      {!selectedBangumi && (
        <>
          <YStack r="$2" p="$1.5" position="absolute" b="26%" z={20} gap="$2">
            <RandomPointButton onPress={handleRandomPoint} />
            <LocateButton onPress={handleLocate} />
          </YStack>
          <View r="$2" p="$1.5" position="absolute" t={200} z={20}>
            <LayerSwitch styleIndex={styleIndex} onChange={setStyleIndex} />
          </View>
        </>
      )}

      {cameraState.zoom >= FILTER_MODE_MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE && (
        <View r="$2" p="$1.5" position="absolute" t={200} z={20}>
          <PointImageMarkerSwitch visible={showPointImageMarkers} onChange={setShowPointImageMarkers} />
        </View>
      )}

      <BangumiDetailSheet />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
