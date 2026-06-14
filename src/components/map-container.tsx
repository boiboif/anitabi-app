import BangumiIcons from '@/components/bangumi-icons';
import { MAP_STYLES } from '@/components/layer-switch';
import MapMarkers from '@/components/map-markers';
import PointImageMarkers from '@/components/point-image-markers';
import PopupCard from '@/components/point-popup-card';
import type { Bangumi } from '@/services/types';
import { useSelectedBangumi } from '@/store/use-selected-bangumi';
import { Camera, LocationPuck, MapState, MapView, MarkerView } from '@rnmapbox/maps';
import { useIsFocused } from 'expo-router';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { View } from 'tamagui';

export type Bounds = { ne: number[]; sw: number[] };

type Props = {
  insets: EdgeInsets;
  bangumis: Bangumi[];
  styleIndex: number;
  onCameraChange?: (state: { zoom: number; bounds: { ne: [number, number]; sw: [number, number] } | null }) => void;
};

const DEFAULT_COORDINATES: [number, number] = [137, 35.2];
const DEFAULT_ZOOM = 4.6;

const MapContainer = forwardRef<Camera, Props>(function MapContainer(
  { insets, bangumis, styleIndex, onCameraChange },
  ref,
) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const { selectedBangumi, setSelectedBangumi, selectedPoint, setSelectedPoint } =
    useSelectedBangumi();

  const cameraRef = useRef<any>(null);

  // 合并本地 cameraRef 与外部转发 ref
  const setCameraRef = useCallback(
    (node: any) => {
      cameraRef.current = node;
      if (ref) {
        if (typeof ref === 'function') ref(node);
        else ref.current = node;
      }
    },
    [ref],
  );

  const flag = useRef(false);

  const isFocused = useIsFocused();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isFocused) {
      timer = setTimeout(() => {
        flag.current = true;
      }, 500);
    }

    return () => {
      flag.current = false;
      clearTimeout(timer);
    };
  }, [isFocused]);

  // 地图初始化时 onCameraChanged 可能连续触发多次携带不稳定 zoom 值，
  // 跳过前 N 次事件过滤掉这些中间态，避免误设 zoom 状态。
  const cameraEventSkipCount = useRef(5);

  const handleCameraChanged = useCallback(
    (state: MapState) => {
      if (!flag.current) return;
      if (cameraEventSkipCount.current > 0) {
        cameraEventSkipCount.current--;
        return;
      }
      if (state.properties.center.includes(0)) return;
      const z = state.properties.zoom;
      const b = state.properties.bounds
        ? { ne: state.properties.bounds.ne as [number, number], sw: state.properties.bounds.sw as [number, number] }
        : null;
      setZoom(z);
      if (b) setBounds(b);
      onCameraChange?.({ zoom: z, bounds: b });
    },
    [onCameraChange],
  );

  // 筛选模式：自动将地图缩放到选中番剧的所有巡礼点范围
  useEffect(() => {
    const cam = cameraRef.current;
    if (!cam) return;

    if (!selectedBangumi) {
      return;
    }

    const bangumi = bangumis.find((b) => b.id === selectedBangumi.id);
    if (!bangumi || bangumi.points.length === 0) return;

    const validPoints = bangumi.points.filter((p) => !(p.geo[0] === 0 && p.geo[1] === 0));
    if (validPoints.length === 0) return;

    let minLat = Infinity,
      maxLat = -Infinity;
    let minLng = Infinity,
      maxLng = -Infinity;

    for (const p of validPoints) {
      const [lat, lng] = p.geo;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }

    // 单点 → 中心定位 + 固定 zoom
    if (minLat === maxLat && minLng === maxLng) {
      cam.setCamera({
        centerCoordinate: [minLng, minLat],
        zoomLevel: 14,
        animationDuration: 500,
        animationMode: 'flyTo',
      });
      return;
    }

    cam.fitBounds(
      [maxLng, maxLat], // ne
      [minLng, minLat], // sw
      [60, 60, 60, 60], // padding [top, right, bottom, left]
      500,
    );
  }, [selectedBangumi, bangumis]);

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        styleURL={MAP_STYLES[styleIndex].url}
        localizeLabels={{ locale: 'zh' }}
        compassEnabled
        compassPosition={{ top: insets.top + 100, right: 8 }}
        scaleBarEnabled={false}
        onCameraChanged={handleCameraChanged}
        onPress={() => setSelectedPoint(null)}
      >
        <Camera
          ref={setCameraRef}
          centerCoordinate={DEFAULT_COORDINATES}
          zoomLevel={DEFAULT_ZOOM}
          animationMode="none"
        />
        <LocationPuck
          visible
          puckBearingEnabled
          puckBearing="heading"
          pulsing={{ isEnabled: true, color: '#007AFF' }}
        />
        <MapMarkers bangumis={bangumis} onPointSelect={(point, bangumi) => setSelectedPoint({ point, bangumi })} />
        <BangumiIcons
          bangumis={bangumis}
          zoom={zoom}
          onIconPress={(bangumi) => {
            setSelectedBangumi(bangumi);
          }}
        />
        <PointImageMarkers
          bangumis={bangumis}
          zoom={zoom}
          bounds={bounds}
          onPointSelect={(point, bangumi) => setSelectedPoint({ point, bangumi })}
        />

        {/* 选中点位弹窗（图片标记 & 圆点标记共用） */}
        {selectedPoint && (
          <MarkerView
            coordinate={[selectedPoint.point.geo[1], selectedPoint.point.geo[0]]}
            anchor={{ x: 0.5, y: 1 }}
            allowOverlap
          >
            <PopupCard point={selectedPoint.point} bangumi={selectedPoint.bangumi} />
          </MarkerView>
        )}
      </MapView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});

export default MapContainer;
