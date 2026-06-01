import LoadingBadge from '@/components/loading-badge';
import LocateButton from '@/components/locate-button';
import MapContainer from '@/components/map-container';
import { fetchMapData } from '@/services/map-data';
import type { AssembledData, FetchProgress } from '@/services/types';
import type { Camera } from '@rnmapbox/maps';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'tamagui';

export default function HomeScreen() {
  const cameraRef = useRef<Camera>(null);
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState<FetchProgress | null>({
    phase: 'checking',
    message: '检查数据更新…',
  });
  const [data, setData] = useState<AssembledData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
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

  const handleLocate = useCallback(async () => {
    // TODO: locate user
  }, []);

  return (
    <View style={styles.container}>
      <MapContainer ref={cameraRef} insets={insets} bangumis={data?.data.bangumis ?? []} />

      {progress && <LoadingBadge progress={progress} insets={insets} />}

      <LocateButton onPress={handleLocate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
