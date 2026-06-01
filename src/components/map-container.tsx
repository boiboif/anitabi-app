import BangumiIcons from '@/components/bangumi-icons';
import MapMarkers from '@/components/map-markers';
import type { Bangumi } from '@/services/types';
import { Camera, LocationPuck, MapView } from '@rnmapbox/maps';
import { forwardRef, useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

export type Bounds = { ne: number[]; sw: number[] };

type Props = {
  insets: EdgeInsets;
  bangumis: Bangumi[];
};

const DEFAULT_COORDINATES: [number, number] = [138, 35];

const MapContainer = forwardRef<Camera, Props>(function MapContainer({ insets, bangumis }, ref) {
  const [zoom, setZoom] = useState(4.5);

  const handleCameraChanged = useCallback((state: { properties: { zoom: number } }) => {
    setZoom((prev) => {
      const next = state.properties.zoom;
      // 首次 mount Camera 会误报一个 zoom（约 1.5），用 >2 的偏差阈值过滤掉
      if (prev === 4.5 && Math.abs(next - 4.5) > 2) return prev;
      return next;
    });
  }, []);

  return (
    <MapView
      style={styles.map}
      styleURL="mapbox://styles/mapbox/streets-v12"
      localizeLabels={{ locale: 'zh' }}
      compassEnabled
      compassPosition={{ top: insets.top + 80, right: 16 }}
      scaleBarEnabled={false}
      onCameraChanged={handleCameraChanged}
    >
      <Camera ref={ref} centerCoordinate={DEFAULT_COORDINATES} zoomLevel={4.5} animationMode="none" />
      <LocationPuck visible puckBearingEnabled puckBearing="heading" pulsing={{ isEnabled: true, color: '#007AFF' }} />
      <MapMarkers bangumis={bangumis} />
      <BangumiIcons
        bangumis={bangumis}
        zoom={zoom}
        onIconPress={(bangumi) => {
          console.log(bangumi, 'bangumi');
        }}
      />
    </MapView>
  );
});

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});

export default MapContainer;
