import BangumiDetailSheet from '@/components/bangumi-detail-sheet';
import LayerSwitch from '@/components/layer-switch';
import LoadingBadge from '@/components/loading-badge';
import LocateButton from '@/components/locate-button';
import MapContainer from '@/components/map-container';
import MapTopBangumiIcons from '@/components/map-top-bangumi-icons';
import PointImageMarkerSwitch from '@/components/point-image-marker-switch';
import SearchBox from '@/components/search-box';
import { FILTER_MODE_MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE } from '@/lib/constants';
import { useMapData } from '@/store/use-map-data';
import { useSelectedBangumi } from '@/store/use-selected-bangumi';
import type { Camera, Location } from '@rnmapbox/maps';
import { locationManager } from '@rnmapbox/maps';
import { requestForegroundPermissionsAsync } from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'tamagui';

export default function HomeScreen() {
  const cameraRef = useRef<Camera>(null);
  const insets = useSafeAreaInsets();
  const data = useMapData((state) => state.data);
  const progress = useMapData((state) => state.progress);
  const router = useRouter();
  const [cameraState, setCameraState] = useState<{
    zoom: number;
    bounds: { ne: [number, number]; sw: [number, number] } | null;
  }>({
    zoom: 4.6,
    bounds: null,
  });
  const [showPointImageMarkers, setShowPointImageMarkers] = useState(true);

  useEffect(() => {
    // 首次进入即请求定位权限，使 LocationPuck 能正常显示
    requestForegroundPermissionsAsync().catch(() => {});
  }, []);

  const bangumis = data?.data.bangumis ?? [];
  const selectedBangumiId = useSelectedBangumi((state) => state.selectedBangumiId);
  const selectedPoint = useSelectedBangumi((state) => state.selectedPoint);
  const selectedBangumi = useMemo(
    () => bangumis.find((bangumi) => bangumi.id === selectedBangumiId) ?? null,
    [bangumis, selectedBangumiId],
  );
  const selectedPointData = useMemo(() => {
    if (!selectedPoint) return null;
    const bangumi = bangumis.find((item) => item.id === selectedPoint.bangumiId);
    const point = bangumi?.points.find((item) => item.id === selectedPoint.pointId);
    return bangumi && point ? { bangumi, point } : null;
  }, [bangumis, selectedPoint]);

  // 选中巡礼点时，地图 camera 飞到该点
  useEffect(() => {
    if (!selectedPointData) return;
    const { density } = selectedPointData.point;
    const [lat, lng] = selectedPointData.point.geo;

    // density = 到最近邻点的距离（米）
    // density 越小 → 附近有其他点 → 放大地图显示更友好
    // density 为空 → 固定一个相对较小的 zoom
    const zoomLevel = density == null ? 14 : Math.max(13, Math.min(18, 16 - Math.log10(density / 10)));

    cameraRef.current?.setCamera({
      centerCoordinate: [lng, lat],
      zoomLevel,
      animationMode: 'flyTo',
      animationDuration: 500,
    });
  }, [selectedPointData]);

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

  const [styleIndex, setStyleIndex] = useState(0);

  return (
    <View style={styles.container}>
      <MapContainer
        ref={cameraRef}
        insets={insets}
        bangumis={bangumis}
        styleIndex={styleIndex}
        showPointImageMarkers={showPointImageMarkers}
        onCameraChange={setCameraState}
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
          <View r="$2" p="$1.5" position="absolute" b="26%" z={20}>
            <LocateButton onPress={handleLocate} />
          </View>
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
