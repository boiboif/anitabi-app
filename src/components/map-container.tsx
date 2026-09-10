import BangumiIcons from '@/components/bangumi-icons';
import { MAP_STYLES } from '@/components/layer-switch';
import MapMarkers from '@/components/map-markers';
import PointImageMarkers from '@/components/point-image-markers';
import PopupCard from '@/components/point-popup-card';
import type { Bangumi } from '@/services/types';
import { type MapPointReference, useMapBrowse } from '@/store/use-map-browse';
import { Camera, LocationPuck, MapState, MapView, MarkerView } from '@rnmapbox/maps';
import { useDebounceFn } from 'ahooks';
import { useFocusEffect, useNavigation } from 'expo-router';
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

export type Bounds = { ne: number[]; sw: number[] };

type Props = {
  insets: EdgeInsets;
  bangumis: Bangumi[];
  styleIndex: number;
  showPointImageMarkers: boolean;
  /** Reports the viewport after camera events stop for 200ms. */
  onCameraChange?: (state: { zoom: number; bounds: { ne: [number, number]; sw: [number, number] } | null }) => void;
  onMapReady?: () => void;
  mode?: 'browse' | 'plan';
  selectedPoint?: MapPointReference | null;
  selectedBangumiIds?: number[];
  onPointSelect?: (point: MapPointReference) => void;
  onMapPress?: () => void;
};

const DEFAULT_COORDINATES: [number, number] = [137, 35.2];
const DEFAULT_ZOOM = 4.6;
const CAMERA_CHANGE_DEBOUNCE_MS = 250;

const MapContainer = forwardRef<Camera, Props>(function MapContainer(
  {
    insets,
    bangumis,
    styleIndex,
    showPointImageMarkers,
    onCameraChange,
    onMapReady,
    mode = 'browse',
    selectedPoint,
    selectedBangumiIds,
    onPointSelect,
    onMapPress,
  },
  ref,
) {
  const isPlanMode = mode === 'plan';
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [loadedStyleIndex, setLoadedStyleIndex] = useState<number | null>(null);
  const loadedStyleIndexRef = useRef<number | null>(null);
  const navigation = useNavigation();
  const storedOpenedBangumiDetailsId = useMapBrowse((state) => state.openedBangumiDetailsId);
  const storedSelectedMapPoint = useMapBrowse((state) => state.selectedMapPoint);
  const openBangumiDetails = useMapBrowse((state) => state.openBangumiDetails);
  const selectMapPoint = useMapBrowse((state) => state.selectMapPoint);
  const clearSelectedMapPoint = useMapBrowse((state) => state.clearSelectedMapPoint);
  const openedBangumiDetailsId = isPlanMode ? null : storedOpenedBangumiDetailsId;
  const activeSelectedPoint = isPlanMode ? (selectedPoint ?? null) : storedSelectedMapPoint;
  const selectedBangumi = useMemo(
    () => bangumis.find((bangumi) => bangumi.id === openedBangumiDetailsId) ?? null,
    [bangumis, openedBangumiDetailsId],
  );
  const selectedPointData = useMemo(() => {
    if (!activeSelectedPoint) return null;
    const bangumi = bangumis.find((item) => item.id === activeSelectedPoint.bangumiId);
    const point = bangumi?.points.find((item) => item.id === activeSelectedPoint.pointId);
    return bangumi && point ? { bangumi, point } : null;
  }, [activeSelectedPoint, bangumis]);

  const cameraRef = useRef<Camera>(null);

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

  const updateCameraState = useCallback((state: MapState) => {
    const z = state.properties.zoom;
    const b = state.properties.bounds
      ? { ne: state.properties.bounds.ne as [number, number], sw: state.properties.bounds.sw as [number, number] }
      : null;
    setZoom(z);
    if (b) {
      setBounds((previous) =>
        previous?.ne[0] === b.ne[0] &&
        previous.ne[1] === b.ne[1] &&
        previous.sw[0] === b.sw[0] &&
        previous.sw[1] === b.sw[1]
          ? previous
          : b,
      );
    }
    return { zoom: z, bounds: b };
  }, []);

  const lastReportedCameraStateRef = useRef<ReturnType<typeof updateCameraState> | null>(null);
  const { run: reportCameraChange, cancel: cancelCameraChange } = useDebounceFn(
    (next: ReturnType<typeof updateCameraState>) => {
      if (!navigation.isFocused()) return;
      const previous = lastReportedCameraStateRef.current;
      if (
        previous?.zoom === next.zoom &&
        previous.bounds?.ne[0] === next.bounds?.ne[0] &&
        previous.bounds?.ne[1] === next.bounds?.ne[1] &&
        previous.bounds?.sw[0] === next.bounds?.sw[0] &&
        previous.bounds?.sw[1] === next.bounds?.sw[1]
      ) {
        return;
      }
      lastReportedCameraStateRef.current = next;
      onCameraChange?.(next);
    },
    { wait: CAMERA_CHANGE_DEBOUNCE_MS },
  );

  useFocusEffect(useCallback(() => cancelCameraChange, [cancelCameraChange]));

  const handleMapReady = useCallback(() => {
    loadedStyleIndexRef.current = styleIndex;
    setLoadedStyleIndex(styleIndex);
    onMapReady?.();
  }, [onMapReady, styleIndex]);

  const handleCameraChanged = useCallback(
    (state: MapState) => {
      // Mapbox 会在样式初始化期间上报 zoom=0 等中间态。此时写入 zoom
      // 会让番剧 icon 的重叠筛选只剩最高优先级的一项，直到下一次移动地图。
      if (
        loadedStyleIndexRef.current !== styleIndex ||
        !navigation.isFocused() ||
        state.properties.center.every((coordinate) => coordinate === 0)
      ) {
        return;
      }
      // MapIdle also waits for tile rendering; camera debounce works while tiles are still loading.
      reportCameraChange(updateCameraState(state));
    },
    [navigation, reportCameraChange, styleIndex, updateCameraState],
  );

  const handlePointSelect = useCallback(
    (point: Bangumi['points'][number], bangumi: Bangumi) => {
      const reference = { bangumiId: bangumi.id, pointId: point.id };
      if (isPlanMode) onPointSelect?.(reference);
      else selectMapPoint(reference);
    },
    [isPlanMode, onPointSelect, selectMapPoint],
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
  }, [bangumis, selectedBangumi]);

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      styleURL={MAP_STYLES[styleIndex].url}
      localizeLabels={{ locale: 'zh' }}
      compassEnabled
      compassPosition={{ top: insets.top + 100, right: 8 }}
      scaleBarEnabled={true}
      scaleBarPosition={{ right: 0, bottom: 8 }}
      onCameraChanged={handleCameraChanged}
      onDidFinishLoadingMap={handleMapReady}
      onPress={isPlanMode ? onMapPress : clearSelectedMapPoint}
    >
      <Camera ref={setCameraRef} centerCoordinate={DEFAULT_COORDINATES} zoomLevel={DEFAULT_ZOOM} animationMode="none" />
      <LocationPuck visible puckBearingEnabled puckBearing="heading" pulsing={{ isEnabled: true, color: '#007AFF' }} />
      <MapMarkers
        bangumis={bangumis}
        selectedBangumiIds={isPlanMode ? (selectedBangumiIds ?? []) : undefined}
        openedBangumiDetailsId={isPlanMode ? null : undefined}
        showAllPoints={isPlanMode}
        onPointSelect={handlePointSelect}
      />
      {!isPlanMode && loadedStyleIndex === styleIndex && (
        <BangumiIcons
          bangumis={bangumis}
          zoom={zoom}
          onIconPress={(bangumi) => {
            openBangumiDetails(bangumi.id);
          }}
        />
      )}
      {showPointImageMarkers && (
        <PointImageMarkers
          bangumis={bangumis}
          zoom={zoom}
          bounds={bounds}
          selectedBangumiIds={isPlanMode ? (selectedBangumiIds ?? []) : undefined}
          openedBangumiDetailsId={isPlanMode ? null : undefined}
          ignoreZoomThreshold={isPlanMode}
          onPointSelect={handlePointSelect}
        />
      )}

      {/* 选中点位弹窗（图片标记 & 圆点标记共用） */}
      {selectedPointData && (
        <MarkerView
          coordinate={[selectedPointData.point.geo[1], selectedPointData.point.geo[0]]}
          anchor={{ x: 0.5, y: 1 }}
          allowOverlap
          allowOverlapWithPuck
        >
          <PopupCard
            point={selectedPointData.point}
            bangumi={selectedPointData.bangumi}
            bangumiTitlePressEnabled={!isPlanMode}
          />
        </MarkerView>
      )}
    </MapView>
  );
});

export default MapContainer;
