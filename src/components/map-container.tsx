import BangumiIcons from '@/components/bangumi-icons';
import { MAP_STYLES } from '@/components/layer-switch';
import MapMarkers from '@/components/map-markers';
import PointImageMarkers from '@/components/point-image-markers';
import PopupCard from '@/components/point-popup-card';
import type { Bangumi, Point } from '@/services/types';
import { useSelectedBangumi } from '@/store/use-selected-bangumi';
import { Camera, LocationPuck, MapState, MapView, MarkerView } from '@rnmapbox/maps';
import { forwardRef, useCallback, useRef, useState } from 'react';
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
  const [selectedPopupPoint, setSelectedPopupPoint] = useState<{
    point: Point;
    bangumi: Bangumi;
  } | null>(null);
  const { setSelectedBangumi } = useSelectedBangumi();

  // 地图初始化时 onCameraChanged 可能连续触发多次携带不稳定 zoom 值，
  // 跳过前 N 次事件过滤掉这些中间态，避免误设 zoom 状态。
  const cameraEventSkipCount = useRef(5);

  const handleCameraChanged = useCallback(
    (state: MapState) => {
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
        onPress={() => setSelectedPopupPoint(null)}
      >
        <Camera ref={ref} centerCoordinate={DEFAULT_COORDINATES} zoomLevel={DEFAULT_ZOOM} animationMode="none" />
        <LocationPuck
          visible
          puckBearingEnabled
          puckBearing="heading"
          pulsing={{ isEnabled: true, color: '#007AFF' }}
        />
        <MapMarkers bangumis={bangumis} onPointSelect={(point, bangumi) => setSelectedPopupPoint({ point, bangumi })} />
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
          onPointSelect={(point, bangumi) => setSelectedPopupPoint({ point, bangumi })}
        />

        {/* 选中点位弹窗（图片标记 & 圆点标记共用） */}
        {selectedPopupPoint && (
          <MarkerView
            coordinate={[selectedPopupPoint.point.geo[1], selectedPopupPoint.point.geo[0]]}
            anchor={{ x: 0.5, y: 1 }}
            allowOverlap
          >
            <PopupCard point={selectedPopupPoint.point} bangumi={selectedPopupPoint.bangumi} />
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
