import BangumiDetailSheet from '@/components/bangumi-detail-sheet';
import Building3DSwitch from '@/components/building-3d-switch';
import LayerSwitch from '@/components/layer-switch';
import LoadingBadge from '@/components/loading-badge';
import LocateButton from '@/components/locate-button';
import MapContainer from '@/components/map-container';
import MapTopBangumiIcons from '@/components/map-top-bangumi-icons';
import PointImageMarkerSwitch from '@/components/point-image-marker-switch';
import RandomPointButton from '@/components/random-point-button';
import SearchBox from '@/components/search-box';
import { useMapLocate } from '@/hooks/use-map-locate';
import { useThemedMapStyle } from '@/hooks/use-themed-map-style';
import { FILTER_MODE_MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE } from '@/lib/constants';
import { getPointFlyToZoom } from '@/lib/map-camera';
import { useMapBangumiFilter } from '@/store/use-map-bangumi-filter';
import { useMapBrowse } from '@/store/use-map-browse';
import { useMapData } from '@/store/use-map-data';
import type { Camera } from '@rnmapbox/maps';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, YStack } from 'tamagui';

type CameraState = {
  zoom: number;
  bounds: { ne: [number, number]; sw: [number, number] } | null;
};

export default function HomeScreen() {
  const { t } = useTranslation();
  const cameraRef = useRef<Camera>(null);
  const { handleLocate, isLocating, isLocationPuckActive, locationPuckRevision } = useMapLocate(cameraRef);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const insets = useSafeAreaInsets();
  const data = useMapData((state) => state.data);
  const progress = useMapData((state) => state.progress);
  const router = useRouter();
  const [cameraState, setCameraState] = useState<CameraState>({
    zoom: 4.6,
    bounds: null,
  });
  const [show3DBuildings, setShow3DBuildings] = useState(false);
  const [showPointImageMarkers, setShowPointImageMarkers] = useState(true);
  const setCameraRef = useCallback((camera: Camera | null) => {
    cameraRef.current = camera;
    setIsCameraReady(camera !== null);
  }, []);
  const handleCameraChange = useCallback((nextCameraState: CameraState) => {
    setCameraState(nextCameraState);
  }, []);
  const bangumis = useMemo(() => data?.data.bangumis ?? [], [data]);
  const openedBangumiDetailsId = useMapBrowse((state) => state.openedBangumiDetailsId);
  const mapCameraRequest = useMapBrowse((state) => state.mapCameraRequest);
  const focusPointFromMapControl = useMapBrowse((state) => state.focusPointFromMapControl);
  const completeMapCameraRequest = useMapBrowse((state) => state.completeMapCameraRequest);
  const clearMapBangumiFilter = useMapBangumiFilter((state) => state.clear);
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

  const handleRandomPoint = useCallback(() => {
    if (randomPointCandidates.length === 0) {
      Alert.alert(
        t('noLocationsYet', { defaultValue: '暂无巡礼点' }),
        t('tryAgainAfterTheMapDataFinishesLoading', { defaultValue: '地图数据加载完成后再试。' }),
      );
      return;
    }

    const randomIndex = Math.floor(Math.random() * randomPointCandidates.length);
    clearMapBangumiFilter();
    focusPointFromMapControl(randomPointCandidates[randomIndex]);
  }, [clearMapBangumiFilter, focusPointFromMapControl, randomPointCandidates, t]);

  const [styleIndex, setStyleIndex] = useThemedMapStyle();
  const handle3DBuildingsChange = useCallback((enabled: boolean) => {
    setShow3DBuildings(enabled);
    cameraRef.current?.setCamera({
      pitch: enabled ? 45 : 0,
      animationDuration: 500,
      animationMode: 'easeTo',
    });
  }, []);

  return (
    <View style={styles.container}>
      <MapContainer
        ref={setCameraRef}
        insets={insets}
        bangumis={bangumis}
        styleIndex={styleIndex}
        show3DBuildings={show3DBuildings}
        showPointImageMarkers={showPointImageMarkers}
        locationPuckActive={isLocationPuckActive}
        locationPuckRevision={locationPuckRevision}
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
          <YStack r="$2" p="$1.5" position="absolute" b="26%" z={20} gap="$3">
            <RandomPointButton onPress={handleRandomPoint} />
            <LocateButton loading={isLocating} onPress={handleLocate} />
          </YStack>
        </>
      )}

      <YStack r="$2" p="$1.5" position="absolute" t={200} z={20} gap="$3">
        {!selectedBangumi && <LayerSwitch styleIndex={styleIndex} onChange={setStyleIndex} />}
        <Building3DSwitch enabled={show3DBuildings} onChange={handle3DBuildingsChange} />
        {cameraState.zoom > FILTER_MODE_MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE && (
          <PointImageMarkerSwitch visible={showPointImageMarkers} onChange={setShowPointImageMarkers} />
        )}
      </YStack>

      <BangumiDetailSheet />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
