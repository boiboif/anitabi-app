import BangumiIcons from '@/components/map/bangumi-icons';
import { MapMarkerSelectionContext } from '@/components/map/map-marker-selection';
import MapMarkers from '@/components/map/map-markers';
import {
  getSelectedPlanMarkerKey,
  type MarkerHitRect,
  SelectedMapPointLayer,
  SelectedPlanMapPointLayer,
} from '@/components/map/map-selected-point-layers';
import PointImageMarkers from '@/components/map/point-image-markers';
import PopupCard from '@/components/map/point-popup-card';
import { resolveLanguageTag } from '@/i18n';
import { MAP_COMPASS_TOP_OFFSET } from '@/lib/constants';
import { MAP_STYLES } from '@/lib/map-styles';
import { logStartupOnce } from '@/lib/startup-timing';
import type { Bangumi } from '@/services/types';
import { type MapPointReference, useMapBrowse } from '@/store/use-map-browse';
import {
  Camera,
  FillExtrusionLayer,
  Images,
  LocationPuck,
  Image as MapboxImage,
  MapState,
  MapView,
  MarkerView,
} from '@rnmapbox/maps';
import { useDebounceFn } from 'ahooks';
import Constants from 'expo-constants';
import { useFocusEffect, useNavigation } from 'expo-router';
import { type ComponentProps, forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EdgeInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { YStack } from 'tamagui';

export type Bounds = { ne: number[]; sw: number[] };
type ScaleBarPosition = ComponentProps<typeof MapView>['scaleBarPosition'];

type Props = {
  insets: EdgeInsets;
  bangumis: Bangumi[];
  styleIndex: number;
  show3DBuildings: boolean;
  showPointImageMarkers: boolean;
  /** Reports the viewport after camera events stop for 250ms. */
  onCameraChange?: (state: { zoom: number; bounds: { ne: [number, number]; sw: [number, number] } | null }) => void;
  /** Reports the viewport immediately so point selection can use the current camera state. */
  onViewportChange?: (state: { zoom: number; bounds: { ne: [number, number]; sw: [number, number] } | null }) => void;
  onMapReady?: () => void;
  mode?: 'browse' | 'plan';
  selectedPoint?: MapPointReference | null;
  selectedBangumiIds?: number[];
  maxPointMarkerDiameter?: number;
  onPointSelect?: (point: MapPointReference) => void;
  onMapPress?: () => void;
  locationPuckActive?: boolean;
  locationPuckRevision?: number;
  scaleBarPosition?: ScaleBarPosition;
};

const DEFAULT_COORDINATES: [number, number] = [137, 35.2];
const DEFAULT_ZOOM = 4.6;
const STARTUP_RENDER_PROBE_ENABLED = Constants.expoConfig?.extra?.appVariant === 'test';
const CAMERA_CHANGE_DEBOUNCE_MS = 250;
const LOCATION_PUCK_BEARING_IMAGE = 'location-puck-bearing';
const LOCATION_PUCK_COLOR = '#1677FF';
const LOCATION_PUCK_BEARING_STROKE_WIDTH = 1.5;
const LOCATION_PUCK_CIRCLE_STROKE_WIDTH = 2;
const BUILDING_COLORS: Partial<Record<(typeof MAP_STYLES)[number]['key'], string>> = {
  dark: '#545B63',
  satellite: '#C9C2B8',
};

function Map3DBuildings({ styleIndex }: { styleIndex: number }) {
  const mapStyle = MAP_STYLES[styleIndex];
  const color = BUILDING_COLORS[mapStyle.key] ?? '#C8C2BB';

  return (
    <FillExtrusionLayer
      key={`3d-buildings-${mapStyle.key}`}
      id="anitabi-3d-buildings"
      sourceID="composite"
      sourceLayerID="building"
      aboveLayerID="building"
      minZoomLevel={15}
      maxZoomLevel={24}
      filter={['==', ['get', 'extrude'], 'true']}
      style={{
        fillExtrusionColor: color,
        fillExtrusionOpacity: 0.82,
        fillExtrusionHeight: ['get', 'height'],
        fillExtrusionBase: ['get', 'min_height'],
        fillExtrusionVerticalScale: ['interpolate', ['linear'], ['zoom'], 15, 0, 15.5, 1],
        fillExtrusionVerticalGradient: true,
      }}
    />
  );
}

const MapContainer = forwardRef<Camera, Props>(function MapContainer(
  {
    insets,
    bangumis,
    styleIndex,
    show3DBuildings,
    showPointImageMarkers,
    onCameraChange,
    onViewportChange,
    onMapReady,
    mode = 'browse',
    selectedPoint,
    selectedBangumiIds,
    maxPointMarkerDiameter,
    onPointSelect,
    onMapPress,
    locationPuckActive = true,
    locationPuckRevision = 0,
    scaleBarPosition,
  },
  ref,
) {
  const { i18n } = useTranslation();
  const isPlanMode = mode === 'plan';
  const language = resolveLanguageTag(i18n.resolvedLanguage);
  const mapLabelLocale = language === 'zh-CN' ? 'zh-Hans' : language;
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [loadedStyleIndex, setLoadedStyleIndex] = useState<number | null>(null);
  const loadedStyleIndexRef = useRef<number | null>(null);
  const navigation = useNavigation();
  const storedOpenedBangumiDetailsId = useMapBrowse((state) => state.openedBangumiDetailsId);
  const storedSelectedMapPoint = useMapBrowse((state) => state.selectedMapPoint);
  const lastPopupMapPoint = useMapBrowse((state) => state.lastPopupMapPoint);
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
  const popupPointData = useMemo(() => {
    if (selectedPointData || !lastPopupMapPoint) return selectedPointData;
    const bangumi = bangumis.find((item) => item.id === lastPopupMapPoint.bangumiId);
    const point = bangumi?.points.find((item) => item.id === lastPopupMapPoint.pointId);
    return bangumi && point ? { bangumi, point } : null;
  }, [bangumis, lastPopupMapPoint, selectedPointData]);
  const selectedPopupPositionKey = selectedPointData
    ? `${selectedPointData.bangumi.id}:${selectedPointData.point.id}:${selectedPointData.point.geo.join(',')}`
    : null;
  const [positionedPopupKey, setPositionedPopupKey] = useState<string | null>(null);

  const cameraRef = useRef<Camera>(null);
  const mapViewRef = useRef<MapView>(null);
  const firstPointProbeDoneRef = useRef(false);
  const pointProbeRunningRef = useRef(false);
  const pointProbeAttemptsRef = useRef(0);
  const pointProbeLastAttemptAtRef = useRef(0);
  const selectedHitRectsRef = useRef<{ key: string; rects: MarkerHitRect[] } | null>(null);
  const selectedMarkerKey = selectedPointData
    ? getSelectedPlanMarkerKey(selectedPointData.bangumi.id, selectedPointData.point.id, showPointImageMarkers)
    : null;
  const selectedMarkerKeyRef = useRef(selectedMarkerKey);
  const hasFocusedMapRef = useRef(false);
  const ignoreNextFocusCameraEventRef = useRef(false);

  useEffect(() => {
    selectedMarkerKeyRef.current = selectedMarkerKey;
  }, [selectedMarkerKey]);

  useEffect(() => {
    if (
      isPlanMode ||
      !selectedPointData ||
      !selectedPopupPositionKey ||
      positionedPopupKey === selectedPopupPositionKey
    )
      return;

    let cancelled = false;
    let frame: number | null = null;
    const revealAfterNativePosition = () => {
      if (cancelled) return;
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          frame = null;
          if (!cancelled) setPositionedPopupKey(selectedPopupPositionKey);
        });
      });
    };

    // Keep the reused annotation hidden until its new coordinate has crossed the native map boundary.
    const map = mapViewRef.current;
    if (map) {
      void map
        .getPointInView([selectedPointData.point.geo[1], selectedPointData.point.geo[0]])
        .then(revealAfterNativePosition, revealAfterNativePosition);
    } else {
      revealAfterNativePosition();
    }

    return () => {
      cancelled = true;
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [isPlanMode, positionedPopupKey, selectedPointData, selectedPopupPositionKey]);

  const isPopupVisible = !!selectedPointData && positionedPopupKey === selectedPopupPositionKey;

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

  useFocusEffect(
    useCallback(() => {
      cancelCameraChange();
      if (!isPlanMode) {
        if (hasFocusedMapRef.current) ignoreNextFocusCameraEventRef.current = true;
        else hasFocusedMapRef.current = true;
      }

      return () => {
        cancelCameraChange();
      };
    }, [cancelCameraChange, isPlanMode]),
  );

  const handleMapReady = useCallback(() => {
    logStartupOnce('map-ready');
    loadedStyleIndexRef.current = styleIndex;
    setLoadedStyleIndex(styleIndex);
    onMapReady?.();
  }, [onMapReady, styleIndex]);

  function handleMapFrameRendered() {
    if (
      !STARTUP_RENDER_PROBE_ENABLED ||
      isPlanMode ||
      bangumis.length === 0 ||
      firstPointProbeDoneRef.current ||
      pointProbeRunningRef.current ||
      pointProbeAttemptsRef.current >= 20
    )
      return;
    const map = mapViewRef.current;
    if (!map) return;
    const now = performance.now();
    if (now - pointProbeLastAttemptAtRef.current < 150) return;

    pointProbeLastAttemptAtRef.current = now;
    pointProbeAttemptsRef.current += 1;
    pointProbeRunningRef.current = true;
    logStartupOnce('map-point-probe-start');
    void map
      .queryRenderedFeaturesInRect([], [], ['points'])
      .then((result) => {
        const count = result?.features.length ?? 0;
        if (count === 0 || firstPointProbeDoneRef.current) return;
        firstPointProbeDoneRef.current = true;
        logStartupOnce('first-visible-map-point', { count });
      })
      .catch((error: unknown) => {
        logStartupOnce('map-point-probe-error', { message: String(error) });
      })
      .finally(() => {
        pointProbeRunningRef.current = false;
      });
  }

  const handleCameraChanged = useCallback(
    (state: MapState) => {
      // TabSlot restores the native map from display:none when this route regains
      // focus. Mapbox then emits one non-gesture event with the previous zoom but
      // bounds measured from the collapsed viewport. Keeping that event would make
      // viewport-driven overlays incorrect until the user moves the map.
      if (ignoreNextFocusCameraEventRef.current) {
        ignoreNextFocusCameraEventRef.current = false;
        if (!state.gestures.isGestureActive) return;
      }

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
      const next = updateCameraState(state);
      onViewportChange?.(next);
      reportCameraChange(next);
    },
    [navigation, onViewportChange, reportCameraChange, styleIndex, updateCameraState],
  );

  const getSelectedArtworkPress = useCallback(
    async (screenPoint: { x: number; y: number }): Promise<MapPointReference | null> => {
      const selected = selectedPointData;
      const hitRects = selectedHitRectsRef.current;
      const map = mapViewRef.current;
      if (!isPlanMode || !selected || !selectedMarkerKey || hitRects?.key !== selectedMarkerKey || !map) return null;

      try {
        // Project on each press so camera movement cannot leave the selected artwork's hit area behind.
        const [anchorX, anchorY] = await map.getPointInView([selected.point.geo[1], selected.point.geo[0]]);
        if (selectedMarkerKeyRef.current !== selectedMarkerKey) return null;
        if (
          hitRects.rects.some(
            ({ left, top, right, bottom }) =>
              screenPoint.x >= anchorX + left &&
              screenPoint.x <= anchorX + right &&
              screenPoint.y >= anchorY + top &&
              screenPoint.y <= anchorY + bottom,
          )
        ) {
          return { bangumiId: selected.bangumi.id, pointId: selected.point.id };
        }
      } catch {
        // The map can unmount while a native screen projection is pending.
      }
      return null;
    },
    [isPlanMode, selectedMarkerKey, selectedPointData],
  );

  const handlePointSelect = useCallback(
    (point: Bangumi['points'][number], bangumi: Bangumi, screenPoint?: { x: number; y: number }) => {
      const reference = { bangumiId: bangumi.id, pointId: point.id };
      if (!isPlanMode) {
        selectMapPoint(reference);
        return;
      }
      if (!screenPoint) {
        onPointSelect?.(reference);
        return;
      }
      void getSelectedArtworkPress(screenPoint).then((selectedPress) => {
        onPointSelect?.(selectedPress ?? reference);
      });
    },
    [getSelectedArtworkPress, isPlanMode, onPointSelect, selectMapPoint],
  );

  const handlePlanMapPress = useCallback(
    (event: GeoJSON.Feature<GeoJSON.Point, { screenPointX: number; screenPointY: number }>) => {
      void getSelectedArtworkPress({ x: event.properties.screenPointX, y: event.properties.screenPointY }).then(
        (selectedPress) => {
          if (selectedPress) onPointSelect?.(selectedPress);
          else onMapPress?.();
        },
      );
    },
    [getSelectedArtworkPress, onMapPress, onPointSelect],
  );

  const handleBangumiIconPress = useCallback(
    (bangumi: Bangumi) => {
      openBangumiDetails(bangumi.id);
    },
    [openBangumiDetails],
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
    <MapMarkerSelectionContext.Provider value={isPlanMode ? activeSelectedPoint : null}>
      <MapView
        ref={mapViewRef}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        styleURL={MAP_STYLES[styleIndex].url}
        localizeLabels={{ locale: mapLabelLocale }}
        compassEnabled
        compassPosition={{ top: insets.top + MAP_COMPASS_TOP_OFFSET, right: 8 }}
        scaleBarEnabled={true}
        scaleBarPosition={scaleBarPosition ?? { right: 0, bottom: 8 }}
        onCameraChanged={handleCameraChanged}
        onDidFinishLoadingMap={handleMapReady}
        onDidFinishRenderingFrameFully={STARTUP_RENDER_PROBE_ENABLED ? handleMapFrameRendered : undefined}
        onPress={isPlanMode ? handlePlanMapPress : clearSelectedMapPoint}
      >
        <Camera
          ref={setCameraRef}
          centerCoordinate={DEFAULT_COORDINATES}
          zoomLevel={DEFAULT_ZOOM}
          animationMode="none"
        />
        <Images>
          <MapboxImage name={LOCATION_PUCK_BEARING_IMAGE}>
            <YStack width={44} height={44} items="center" collapsable={false}>
              <Svg width={44} height={44} viewBox="0 0 44 44">
                <Path
                  d="M22 3 L30.97 15.63 L13.03 15.63 Z"
                  fill={LOCATION_PUCK_COLOR}
                  stroke="#FFFFFF"
                  strokeLinejoin="miter"
                  strokeWidth={LOCATION_PUCK_BEARING_STROKE_WIDTH}
                />
                <Circle
                  cx={22}
                  cy={22}
                  r={10.75}
                  fill={LOCATION_PUCK_COLOR}
                  stroke="#FFFFFF"
                  strokeWidth={LOCATION_PUCK_CIRCLE_STROKE_WIDTH}
                />
              </Svg>
            </YStack>
          </MapboxImage>
        </Images>
        {locationPuckActive && (
          <LocationPuck
            key={`location-puck-${locationPuckRevision}`}
            visible
            bearingImage={LOCATION_PUCK_BEARING_IMAGE}
            puckBearing="heading"
            puckBearingEnabled
            pulsing={{ isEnabled: true, color: LOCATION_PUCK_COLOR }}
          />
        )}
        {show3DBuildings && <Map3DBuildings styleIndex={styleIndex} />}
        <MapMarkers
          bangumis={bangumis}
          selectedBangumiIds={isPlanMode ? (selectedBangumiIds ?? []) : undefined}
          openedBangumiDetailsId={isPlanMode ? null : undefined}
          showAllPoints={isPlanMode}
          maxVisualDiameter={maxPointMarkerDiameter}
          onPointSelect={handlePointSelect}
        />
        {!isPlanMode && loadedStyleIndex === styleIndex && (
          <BangumiIcons bangumis={bangumis} onIconPress={handleBangumiIconPress} />
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

        {isPlanMode ? (
          <SelectedPlanMapPointLayer
            selected={selectedPointData}
            showImage={showPointImageMarkers}
            onHitRectsChange={(key, rects) => {
              selectedHitRectsRef.current = { key, rects };
            }}
          />
        ) : (
          <SelectedMapPointLayer
            selected={selectedPointData}
            maxVisualDiameter={maxPointMarkerDiameter}
            onPress={handlePointSelect}
          />
        )}
        {!isPlanMode && popupPointData ? (
          <MarkerView
            coordinate={[popupPointData.point.geo[1], popupPointData.point.geo[0]]}
            anchor={{ x: 0.5, y: 1 }}
            allowOverlap
            allowOverlapWithPuck
            isSelected={isPopupVisible}
            pointerEvents={isPopupVisible ? 'auto' : 'none'}
          >
            {/* Android mounts the marker content in Mapbox's annotation tree, so hide the content itself. */}
            <YStack
              collapsable={false}
              opacity={isPopupVisible ? 1 : 0}
              pointerEvents={isPopupVisible ? 'auto' : 'none'}
              accessibilityElementsHidden={!isPopupVisible}
              importantForAccessibility={isPopupVisible ? 'auto' : 'no-hide-descendants'}
            >
              <PopupCard point={popupPointData.point} bangumi={popupPointData.bangumi} />
            </YStack>
          </MarkerView>
        ) : null}
      </MapView>
    </MapMarkerSelectionContext.Provider>
  );
});

export default MapContainer;
