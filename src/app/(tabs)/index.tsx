import LoadingBadge from '@/components/loading-badge';
import LocateButton from '@/components/locate-button';
import MapContainer from '@/components/map-container';
import SearchBox from '@/components/search-box';
import { fetchMapData } from '@/services/map-data';
import type { AssembledData, FetchProgress } from '@/services/types';
import { BottomSheet, Column } from '@expo/ui';
import type { Camera } from '@rnmapbox/maps';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View } from 'tamagui';

export default function HomeScreen() {
  const cameraRef = useRef<Camera>(null);
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState<FetchProgress | null>({
    phase: 'checking',
    message: '检查数据更新…',
  });
  const [data, setData] = useState<AssembledData | null>(null);
  const router = useRouter();

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

  const [isSheetPresented, setIsSheetPresented] = useState(false);

  return (
    <View style={styles.container}>
      <BottomSheet
        snapPoints={['half', 'full']}
        isPresented={isSheetPresented}
        onDismiss={() => setIsSheetPresented(false)}
      >
        <Column spacing={12}>
          <Text>Sheet contents</Text>
          <Text>Drag down or tap the overlay to dismiss.</Text>
        </Column>
      </BottomSheet>
      <MapContainer ref={cameraRef} insets={insets} bangumis={data?.data.bangumis ?? []} />

      <View position="absolute" t={insets.top === 0 ? '$2' : insets.top} l="$3" r="$3" pt="$2" z={10}>
        <SearchBox
          onPress={() => {
            router.navigate('/search');
          }}
          readOnly
        />
      </View>

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
