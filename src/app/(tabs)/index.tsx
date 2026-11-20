import { Dices } from '@/components/icons';
import BangumiDetailSheet from '@/components/map/bangumi-detail-sheet';
import Building3DSwitch from '@/components/map/building-3d-switch';
import LayerSwitch from '@/components/map/layer-switch';
import LoadingBadge from '@/components/map/loading-badge';
import LocateButton from '@/components/map/locate-button';
import MapContainer from '@/components/map/map-container';
import MapControlSurface from '@/components/map/map-control-surface';
import MapTopBangumiIcons from '@/components/map/map-top-bangumi-icons';
import MapViewportPhotos from '@/components/map/map-viewport-photos';
import PointImageMarkerSwitch from '@/components/map/point-image-marker-switch';
import SearchBox from '@/components/ui/search-box';
import { useHomeMapLocate } from '@/hooks/use-home-map-locate';
import { useMapLocate } from '@/hooks/use-map-locate';
import { useThemedMapStyle } from '@/hooks/use-themed-map-style';
import {
  FILTER_MODE_MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE,
  MAP_3D_PITCH,
  MAP_CONTROL_HIT_SLOP,
  MAP_CONTROL_ICON_SIZE,
  MAP_TOP_CONTROLS_TOP_OFFSET,
} from '@/lib/constants';
import { getBangumiOverviewBounds, getPointFlyToZoom } from '@/lib/map-camera';
import type { Bangumi } from '@/services/types';
import { useMapBangumiFilter } from '@/store/use-map-bangumi-filter';
import { useMapBrowse } from '@/store/use-map-browse';
import { useMapData } from '@/store/use-map-data';
import type { MapViewportState } from '@/utils/map-viewport';
import type { ViewportImagePoint } from '@/utils/map-viewport-points';
import type { Camera, CameraStop } from '@rnmapbox/maps';
import { useIsFocused, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, type LayoutRectangle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, YStack } from 'tamagui';

type CameraState = MapViewportState;

type RandomPointCandidate = { bangumiId: number; pointId: string };
const PHOTO_FLY_DURATION_MS = 1000;

function buildRandomPointCandidates(bangumis: Bangumi[]): RandomPointCandidate[] {
  return bangumis.flatMap((bangumi) =>
    bangumi.points
      .filter((point) => point.geo[0] !== 0 || point.geo[1] !== 0)
      .map((point) => ({ bangumiId: bangumi.id, pointId: point.id })),
  );
}

function RandomPointButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      hitSlop={MAP_CONTROL_HIT_SLOP}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      onPress={onPress}
    >
      <MapControlSurface>
        <Dices size={MAP_CONTROL_ICON_SIZE} color="color-11" />
      </MapControlSurface>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const cameraRef = useRef<Camera>(null);
  const cameraAnimationEndRef = useRef(0);
  const cameraOrientationTargetRef = useRef<Pick<CameraStop, 'heading' | 'pitch'> | undefined>(undefined);
  const markCameraAnimationStart = useCallback((duration: number, orientation?: Pick<CameraStop, 'heading' | 'pitch'>) => {
    cameraAnimationEndRef.current = Date.now() + duration;
    cameraOrientationTargetRef.current = orientation;
  }, []);
  const clearCameraAnimation = useCallback(() => {
    cameraAnimationEndRef.current = 0;
    cameraOrientationTargetRef.current = undefined;
  }, []);
  const { handleLocate, cancelPendingCameraMovement, isLocating, isLocationPuckActive, locationPuckRevision } = useMapLocate(cameraRef, markCameraAnimationStart);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const insets = useSafeAreaInsets();
  const data = useMapData((state) => state.data);
  const isPartial = useMapData((state) => state.isPartial);
  const progress = useMapData((state) => state.progress);
  const initializeMapData = useMapData((state) => state.initialize);
  const router = useRouter();
  const isRouteFocused = useIsFocused();
  const navigation = useNavigation();
  const [cameraState, setCameraState] = useState<CameraState>({
    zoom: 4.6,
    bounds: null,
  });
  const [show3DBuildings, setShow3DBuildings] = useState(false);
  const {
    locationViewportRef,
    locateButtonMode,
    handleLocatePress,
    stopLocationTracking,
    handleFollowInterrupted,
  } = useHomeMapLocate({ handleLocate, cancelPendingCameraMovement, isLocationPuckActive, setShow3DBuildings });
  const [showPointImageMarkers, setShowPointImageMarkers] = useState(true);
  const nextVisibilityRequestId = useRef(0);
  const [visibilityRequest, setVisibilityRequest] = useState<{ id: number; bangumiId: number; pointId: string; interruptCamera?: boolean; cameraAnimationEndTime?: number } | null>(null);
  const [searchContainerLayout, setSearchContainerLayout] = useState<LayoutRectangle | null>(null);
  const [searchLayout, setSearchLayout] = useState<LayoutRectangle | null>(null);
  const [photosLayout, setPhotosLayout] = useState<LayoutRectangle | null>();
  const visibilityObstacles = useMemo(() => {
    const obstacles: LayoutRectangle[] = [];
    if (searchContainerLayout && searchLayout) obstacles.push({
      ...searchLayout,
      x: searchContainerLayout.x + searchLayout.x,
      y: searchContainerLayout.y + searchLayout.y,
    });
    if (photosLayout) obstacles.push(photosLayout);
    return obstacles;
  }, [searchContainerLayout, searchLayout, photosLayout]);
  const setCameraRef = useCallback((camera: Camera | null) => {
    cameraRef.current = camera;
    if (!camera) clearCameraAnimation();
    setIsCameraReady(camera !== null);
  }, [clearCameraAnimation]);
  const handleCameraChange = useCallback((nextCameraState: CameraState) => {
    setCameraState(nextCameraState);
  }, []);
  const bangumis = useMemo(() => data?.data.bangumis ?? [], [data]);
  const randomPointCandidatesRef = useRef<{ bangumis: Bangumi[]; candidates: RandomPointCandidate[] } | null>(null);
  const openedBangumiDetailsId = useMapBrowse((state) => state.openedBangumiDetailsId);
  const mapCameraRequest = useMapBrowse((state) => state.mapCameraRequest);
  const focusPointFromMapControl = useMapBrowse((state) => state.focusPointFromMapControl);
  const completeMapCameraRequest = useMapBrowse((state) => state.completeMapCameraRequest);
  const clearMapBangumiFilter = useMapBangumiFilter((state) => state.clear);
  useEffect(() => {
    if (isRouteFocused) return;
    clearCameraAnimation();
    stopLocationTracking();
  }, [clearCameraAnimation, isRouteFocused, stopLocationTracking]);
  useEffect(() => {
    if (bangumis.length === 0) return;
    const buildWhenIdle = () => {
      if (randomPointCandidatesRef.current?.bangumis !== bangumis) {
        randomPointCandidatesRef.current = { bangumis, candidates: buildRandomPointCandidates(bangumis) };
      }
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(buildWhenIdle, { timeout: 2_000 });
      return () => {
        if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id);
      };
    }
    const id = setTimeout(buildWhenIdle, 500);
    return () => clearTimeout(id);
  }, [bangumis]);

  const selectedBangumi = useMemo(
    () => bangumis?.find((bangumi) => bangumi.id === openedBangumiDetailsId) ?? null,
    [bangumis, openedBangumiDetailsId],
  );
  useEffect(() => {
    if (
      !mapCameraRequest ||
      !data ||
      !isRouteFocused ||
      !navigation.isFocused() ||
      useMapBrowse.getState().mapCameraRequest?.id !== mapCameraRequest.id
    )
      return;
    const request = mapCameraRequest;
    const bangumi = bangumis.find((item) => item.id === request.bangumiId);
    if (!bangumi) {
      // A not-yet-downloaded work may become available when the missing shard arrives.
      if (isPartial) return;
      completeMapCameraRequest(request.id);
      return;
    }
    const camera = cameraRef.current;
    if (!isCameraReady || !camera) return;
    const release = stopLocationTracking();
    const moveCamera = () => {
      if (release && (
        !navigation.isFocused() || cameraRef.current !== camera ||
        useMapBrowse.getState().mapCameraRequest?.id !== request.id
      )) return;

      if (request.kind === 'bangumi-overview') {
        const bounds = getBangumiOverviewBounds(bangumi.points);
        if (bounds) {
          markCameraAnimationStart(500);
          if (bounds.ne[0] === bounds.sw[0] && bounds.ne[1] === bounds.sw[1]) {
            camera.setCamera({
              centerCoordinate: bounds.ne,
              zoomLevel: 14,
              animationMode: 'flyTo',
              animationDuration: 500,
            });
          } else {
            camera.fitBounds(bounds.ne, bounds.sw, [60, 60, 60, 60], 500);
          }
        }
      } else {
        const point = bangumi.points.find((item) => item.id === request.pointId);
        if (point) {
          markCameraAnimationStart(1500);
          camera.setCamera({
            centerCoordinate: [point.geo[1], point.geo[0]],
            zoomLevel: getPointFlyToZoom(point.density),
            animationMode: 'flyTo',
            animationDuration: 1500,
          });
        }
      }
      completeMapCameraRequest(request.id);
    };
    if (release) void release.then(moveCamera);
    else moveCamera();
  }, [
    bangumis,
    completeMapCameraRequest,
    data,
    isCameraReady,
    isPartial,
    isRouteFocused,
    markCameraAnimationStart,
    mapCameraRequest,
    navigation,
    stopLocationTracking,
  ]);

  const handleRandomPoint = useCallback(() => {
    let cached = randomPointCandidatesRef.current;
    if (cached?.bangumis !== bangumis) {
      cached = { bangumis, candidates: buildRandomPointCandidates(bangumis) };
      randomPointCandidatesRef.current = cached;
    }
    const randomPointCandidates = cached.candidates;
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
  }, [bangumis, clearMapBangumiFilter, focusPointFromMapControl, t]);

  const [styleIndex, setStyleIndex] = useThemedMapStyle();
  const handleStyleChange = async (nextStyleIndex: number) => {
    const release = stopLocationTracking();
    if (release) await release;
    setStyleIndex(nextStyleIndex);
  };
  const handleCameraGestureStart = () => {
    nextVisibilityRequestId.current++;
    clearCameraAnimation();
    stopLocationTracking();
  };
  const handleViewportPointSelect = async ({ point, bangumi }: ViewportImagePoint) => {
    const requestId = ++nextVisibilityRequestId.current;
    const release = stopLocationTracking();
    cancelPendingCameraMovement();
    if (release) {
      clearCameraAnimation();
      await release;
      if (!navigation.isFocused() || nextVisibilityRequestId.current !== requestId) return;
    }
    const camera = cameraRef.current;
    const isCameraAnimating = !!camera && Date.now() < cameraAnimationEndRef.current;
    if (isCameraAnimating) {
      const orientation = cameraOrientationTargetRef.current;
      markCameraAnimationStart(PHOTO_FLY_DURATION_MS, orientation);
      // Camera.flyTo omits the mode in this rnmapbox version; specify it so
      // Android also starts a flight, preserving any pending orientation change.
      camera.setCamera({
        centerCoordinate: [point.geo[1], point.geo[0]],
        zoomLevel: getPointFlyToZoom(point.density),
        animationMode: 'flyTo',
        animationDuration: PHOTO_FLY_DURATION_MS,
        ...orientation,
      });
    }
    useMapBrowse.getState().selectMapPoint({ bangumiId: bangumi.id, pointId: point.id });
    setVisibilityRequest({ id: requestId, bangumiId: bangumi.id, pointId: point.id,
      interruptCamera: isCameraAnimating, cameraAnimationEndTime: isCameraAnimating ? cameraAnimationEndRef.current : undefined });
  };
  const handle3DBuildingsChange = async (enabled: boolean) => {
    nextVisibilityRequestId.current++;
    setVisibilityRequest(null);
    const release = stopLocationTracking();
    setShow3DBuildings(enabled);
    if (release) {
      await release;
      if (!navigation.isFocused()) return;
    }
    const camera = cameraRef.current;
    if (!camera) return;
    const pitch = enabled ? MAP_3D_PITCH : 0;
    markCameraAnimationStart(500, { pitch });
    camera.setCamera({
      pitch,
      animationDuration: 500,
      animationMode: 'easeTo',
    });
  };

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
        locationViewportRef={locationViewportRef}
        onLocationFollowInterrupted={handleFollowInterrupted}
        onCameraChange={handleCameraChange}
        onCameraAnimationStart={markCameraAnimationStart}
        onCameraGestureStart={handleCameraGestureStart}
        visibilityRequest={visibilityRequest}
        visibilityObstacles={visibilityObstacles}
        visibilityObstaclesReady={!!searchContainerLayout && !!searchLayout && photosLayout !== undefined}
      />

      <View
        position="absolute"
        l="0"
        r="0"
        t={insets.top === 0 ? '7px' : insets.top}
        pt="7px"
        z={0}
        pointerEvents="box-none"
        onLayout={({ nativeEvent: { layout } }) => setSearchContainerLayout(layout)}
      >
        <View mx="13px" onLayout={({ nativeEvent: { layout } }) => setSearchLayout(layout)}>
          <SearchBox
            onPress={() => {
              router.navigate('/search');
            }}
            readOnly
            placeholderTextColor="color-10"
          />
        </View>

        <MapTopBangumiIcons
          bangumis={bangumis}
          zoom={cameraState.zoom}
          bounds={cameraState.bounds}
          footprint={cameraState.footprint}
        />
      </View>

      {progress && <LoadingBadge progress={progress} insets={insets} onRetry={() => void initializeMapData()} />}

      <MapViewportPhotos bangumis={bangumis} viewport={cameraState} onSelect={handleViewportPointSelect} onLayoutChange={setPhotosLayout} />

      {!selectedBangumi && (
        <>
          <YStack r="7px" p={MAP_CONTROL_HIT_SLOP} position="absolute" b="26%" z={20} gap="13px">
            <RandomPointButton onPress={handleRandomPoint} />
            <LocateButton
              loading={isLocating}
              mode={locateButtonMode}
              onPress={() => {
                nextVisibilityRequestId.current++;
                setVisibilityRequest(null);
                void handleLocatePress();
              }}
            />
          </YStack>
        </>
      )}

      <YStack
        r="7px"
        p={MAP_CONTROL_HIT_SLOP}
        position="absolute"
        t={insets.top + MAP_TOP_CONTROLS_TOP_OFFSET}
        z={20}
        gap="13px"
      >
        {!selectedBangumi && <LayerSwitch styleIndex={styleIndex} onChange={handleStyleChange} />}
        <Building3DSwitch enabled={show3DBuildings} onChange={handle3DBuildingsChange} />
        {cameraState.zoom >= FILTER_MODE_MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE && (
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
