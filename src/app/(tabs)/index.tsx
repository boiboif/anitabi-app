import BangumiDetailSheet, { type BangumiDetailSheetRef } from '@/components/bangumi-detail-sheet';
import LayerSwitch from '@/components/layer-switch';
import LoadingBadge from '@/components/loading-badge';
import LocateButton from '@/components/locate-button';
import MapContainer from '@/components/map-container';
import MapTopBangumiIcons from '@/components/map-top-bangumi-icons';
import SearchBox from '@/components/search-box';
import { fetchMapData } from '@/services/map-data';
import type { AssembledData, FetchProgress } from '@/services/types';
import { useSelectedBangumi } from '@/store/use-selected-bangumi';
import type { Camera, Location } from '@rnmapbox/maps';
import { locationManager } from '@rnmapbox/maps';
import { requestForegroundPermissionsAsync } from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'tamagui';

export default function HomeScreen() {
  const cameraRef = useRef<Camera>(null);
  const bangumiSheetRef = useRef<BangumiDetailSheetRef>(null);
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState<FetchProgress | null>({
    phase: 'checking',
    message: '检查数据更新…',
  });
  const [data, setData] = useState<AssembledData | null>(null);
  const router = useRouter();
  const [cameraState, setCameraState] = useState<{
    zoom: number;
    bounds: { ne: [number, number]; sw: [number, number] } | null;
  }>({
    zoom: 4.6,
    bounds: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // 首次进入即请求定位权限，使 LocationPuck 能正常显示
      requestForegroundPermissionsAsync().catch(() => {});

      try {
        const result = await fetchMapData((p) => {
          if (!cancelled) setProgress(p);
        });
        if (!cancelled) {
          setData(result);
          console.log('data', result);
          setProgress(null);
        }
      } catch (e) {
        console.error('fetchMapData error:', e);
        if (!cancelled) setProgress({ phase: 'error', message: '数据加载失败' });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const { selectedPoint, selectedBangumi, setSelectedBangumi } = useSelectedBangumi();

  // 选中巡礼点时，地图 camera 飞到该点
  useEffect(() => {
    if (!selectedPoint) return;
    const [lat, lng] = selectedPoint.point.geo;
    cameraRef.current?.setCamera({
      centerCoordinate: [lng, lat],
      zoomLevel: 22,
      animationMode: 'flyTo',
      animationDuration: 500,
    });
  }, [selectedPoint]);

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
        bangumis={data?.data.bangumis ?? []}
        styleIndex={styleIndex}
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

        <MapTopBangumiIcons
          bangumis={data?.data.bangumis ?? []}
          zoom={cameraState.zoom}
          bounds={cameraState.bounds}
          onIconPress={(bangumi) => {
            setSelectedBangumi(bangumi);
            bangumiSheetRef.current?.snapToIndex(1);
          }}
          onOpenSheet={() => {
            bangumiSheetRef.current?.snapToIndex(1);
          }}
        />
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

      <BangumiDetailSheet ref={bangumiSheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
