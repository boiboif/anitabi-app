import { Camera, locationManager, LocationPuck, MapView } from '@rnmapbox/maps';
import { Locate } from '@tamagui/lucide-icons-2';
import { toast } from '@tamagui/toast/v2';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

const DEFAULT_COORDINATES: [number, number] = [137, 34.5]; // Japan center (southwest)

export default function HomeScreen() {
  const cameraRef = useRef<Camera>(null);

  useEffect(() => {
    async function requestAndStart() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        locationManager.start();
      }
    }
    requestAndStart();
    return () => locationManager.stop();
  }, []);

  const handleLocate = useCallback(async () => {
    return toast.success('Saved!');

    // const { status } = await Location.requestForegroundPermissionsAsync();
    // if (status !== 'granted') return;

    // const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    // cameraRef.current?.flyTo([pos.coords.longitude, pos.coords.latitude], 1000);
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        styleURL="mapbox://styles/mapbox/standard"
        compassEnabled
        compassPosition={{ top: 100, right: 16 }}
        scaleBarEnabled={false}
      >
        <Camera ref={cameraRef} centerCoordinate={DEFAULT_COORDINATES} zoomLevel={4.5} animationMode="none" />
        <LocationPuck
          visible
          puckBearingEnabled
          puckBearing="heading"
          pulsing={{ isEnabled: true, color: '#007AFF' }}
        />
      </MapView>

      <View style={styles.locateButton}>
        <TouchableOpacity style={styles.locateInner} activeOpacity={0.7} onPress={handleLocate}>
          <Locate size={24} color="#555" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  locateButton: {
    position: 'absolute',
    bottom: 32,
    right: 16,
    zIndex: 10,
  },
  locateInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 10px 0 rgba(0, 0, 0, 0.2)',
  },
});
