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
import NearbyPointPopupCard from '@/components/map/nearby-point-popup-card';
import { resolveLanguageTag } from '@/i18n';
import { MAP_COMPASS_TOP_OFFSET, MAP_DEFAULT_ZOOM } from '@/lib/constants';
import { MAP_STYLES } from '@/lib/map-styles';
import { observeAdministrativeRegion } from '@/services/administrative-region';
import { prefetchMapStyle } from '@/services/map-text-color';
import { prefetchPlaceSprite, preparePlaceIcon } from '@/services/nearby-place-sprite';
import type { Bangumi } from '@/services/types';
import { useMapBangumiFilter } from '@/store/use-map-bangumi-filter';
import { useMapData } from '@/store/use-map-data';
import type { MapCoordinate, MapViewportState } from '@/utils/map-viewport';
import { type MapPointReference, type NearbyMapLocation, useMapBrowse } from '@/store/use-map-browse';
import { findNearbyPoints } from '@/utils/nearby-points';
import { isValidCoordinate } from '@/utils/plan-point-distances';
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
import { useFocusEffect, useNavigation } from 'expo-router';
import {
  type ComponentProps,
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  /** Plan maps without a threshold keep every point image visible. */
  planPointImageZoomThreshold?: number;
  /** Keeps image density independent of the plan's visibility threshold. */
  planPointImageDensityZoomThreshold?: number;
  /** Reports the viewport after camera events stop for 250ms. */
  onCameraChange?: (state: MapViewportState) => void;
  /** Reports the viewport immediately so point selection can use the current camera state. */
  onViewportChange?: (state: { zoom: number; bounds: { ne: [number, number]; sw: [number, number] } | null }) => void;
  onMapReady?: () => void;
  mode?: 'browse' | 'plan';
  selectedPoint?: MapPointReference | null;
  /** The plan screen owns its selection independently of the browse map. */
  nearbyLocation?: NearbyMapLocation | null;
  onNearbyLocationOpen?: (location: NearbyMapLocation) => void;
  selectedBangumiIds?: number[];
  maxPointMarkerDiameter?: number;
  onPointSelect?: (point: MapPointReference) => void;
  onMapPress?: () => void;
  locationPuckActive?: boolean;
  locationPuckRevision?: number;
  scaleBarPosition?: ScaleBarPosition;
};

const DEFAULT_COORDINATES: [number, number] = [137, 35.2];
const CAMERA_CHANGE_DEBOUNCE_MS = 250;
const LOCATION_PUCK_BEARING_IMAGE = 'location-puck-bearing';
const LOCATION_PUCK_COLOR = '#1677FF';
const LOCATION_PUCK_BEARING_STROKE_WIDTH = 1.5;
const LOCATION_PUCK_CIRCLE_STROKE_WIDTH = 2;
// Only query known Mapbox basemap layers, never the application's own marker sources.
const NEARBY_PLACE_LAYERS = ['poi-label', 'transit-label', 'airport-label', 'natural-point-label'];
const EMPTY_BANGUMI_IDS: number[] = [];

function readNearbyPlace(feature: GeoJSON.Feature, layer: string, language: string) {
  const properties = feature.properties;
  if (!properties) return null;
  const stringValue = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
  const localizedName = language === 'zh-CN'
    ? stringValue(properties['name_zh-Hans']) ?? stringValue(properties.name_zh)
    : stringValue(properties[`name_${language}`]);
  const name = localizedName ?? stringValue(properties.name);
  if (!name) return null;
  const englishName = stringValue(properties.name_en);
  const betaIcon = stringValue(properties.maki_beta);
  const standardIcon = stringValue(properties.maki);
  const geometry = feature.geometry;
  const featureKey = typeof feature.id === 'string' ||
    (typeof feature.id === 'number' && Number.isFinite(feature.id))
    ? JSON.stringify([layer, 'id', feature.id])
    : geometry?.type === 'Point' && Number.isFinite(geometry.coordinates[0]) && Number.isFinite(geometry.coordinates[1])
      ? JSON.stringify([layer, 'point', geometry.coordinates[0], geometry.coordinates[1], name])
      : undefined;
  return {
    name,
    englishName: englishName !== name ? englishName : undefined,
    icon: betaIcon ?? standardIcon,
    fallbackIcon: betaIcon && standardIcon !== betaIcon ? standardIcon : undefined,
    category: stringValue(properties.class),
    featureKey,
    mapFeature: { layerId: layer, feature },
  };
}
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
    planPointImageZoomThreshold,
    planPointImageDensityZoomThreshold,
    onCameraChange,
    onViewportChange,
    onMapReady,
    mode = 'browse',
    selectedPoint,
    nearbyLocation,
    onNearbyLocationOpen,
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
  const [zoom, setZoom] = useState(MAP_DEFAULT_ZOOM);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [loadedStyleIndex, setLoadedStyleIndex] = useState<number | null>(null);
  const loadedStyleIndexRef = useRef<number | null>(null);
  const styleRevisionRef = useRef(0);
  const navigation = useNavigation();
  const storedSelectedMapPoint = useMapBrowse((state) => state.selectedMapPoint);
  const storedNearbyMapLocation = useMapBrowse((state) => state.nearbyMapLocation);
  const nearbyMapLocation = isPlanMode ? (nearbyLocation ?? null) : storedNearbyMapLocation;
  const filteredBangumiId = useMapBrowse((state) => state.filteredBangumiId);
  const selectedMapBangumiIds = useMapBangumiFilter((state) => state.selectedBangumiIds);
  const focusPointFromNearby = useMapBrowse((state) => state.focusPointFromNearby);
  const openBangumiDetails = useMapBrowse((state) => state.openBangumiDetails);
  const selectMapPoint = useMapBrowse((state) => state.selectMapPoint);
  const activeSelectedPoint = isPlanMode ? (selectedPoint ?? null) : storedSelectedMapPoint;
  const selectedPointData = useMemo(() => {
    if (!activeSelectedPoint) return null;
    const bangumi = bangumis.find((item) => item.id === activeSelectedPoint.bangumiId);
    const point = bangumi?.points.find((item) => item.id === activeSelectedPoint.pointId);
    return bangumi && point ? { bangumi, point } : null;
  }, [activeSelectedPoint, bangumis]);
  const [nearbyRegion, setNearbyRegion] = useState<{ id: number; region: string | null } | null>(null);
  const nearbyLocationId = nearbyMapLocation?.id;
  const nearbyGeo = nearbyMapLocation?.geo;
  const nearbyFilteredBangumiId = isPlanMode ? null : filteredBangumiId;
  const nearbySelectedBangumiIds = isPlanMode ? (selectedBangumiIds ?? EMPTY_BANGUMI_IDS) : selectedMapBangumiIds;
  // Computing distances is O(points), whereas camera gestures cause frequent map renders.
  const nearbyPoints = useMemo(
    () => nearbyGeo ? findNearbyPoints(bangumis, nearbyGeo, nearbyFilteredBangumiId, nearbySelectedBangumiIds) : [],
    [bangumis, nearbyGeo, nearbyFilteredBangumiId, nearbySelectedBangumiIds],
  );

  const cameraRef = useRef<Camera>(null);
  const mapViewRef = useRef<MapView>(null);
  const mapSizeRef = useRef({ width: 0, height: 0 });
  const cameraRevisionRef = useRef(0);
  const browsePressRevisionRef = useRef(0);
  const planSelectionRevisionRef = useRef(0);
  const nextPlanNearbyLocationIdRef = useRef(1);
  const selectedHitRectsRef = useRef<{ key: string; rects: MarkerHitRect[] } | null>(null);
  const selectedMarkerKey = selectedPointData
    ? getSelectedPlanMarkerKey(selectedPointData.bangumi.id, selectedPointData.point.id, showPointImageMarkers)
    : null;
  const pointSelectionRef = useRef<{
    isPlanMode: boolean;
    selectedPointData: typeof selectedPointData;
    selectedPoint: MapPointReference | null;
    nearbyLocation: NearbyMapLocation | null;
    selectedMarkerKey: string | null;
    onPointSelect: Props['onPointSelect'];
    onMapPress: Props['onMapPress'];
    onNearbyLocationOpen: Props['onNearbyLocationOpen'];
  } | null>(null);
  const hasFocusedMapRef = useRef(false);
  const ignoreNextFocusCameraEventRef = useRef(false);

  useLayoutEffect(() => {
    styleRevisionRef.current++;
  }, [styleIndex]);

  useLayoutEffect(() => {
    browsePressRevisionRef.current++;
  }, [isPlanMode]);

  useLayoutEffect(() => {
    planSelectionRevisionRef.current++;
  }, [isPlanMode, selectedPoint, nearbyLocation]);

  useLayoutEffect(() => useMapBrowse.subscribe((state, previous) => {
    if (pointSelectionRef.current?.isPlanMode) return;
    if (state.selectedMapPoint !== previous.selectedMapPoint ||
      state.nearbyMapLocation?.id !== previous.nearbyMapLocation?.id ||
      state.openedBangumiDetailsId !== previous.openedBangumiDetailsId) {
      browsePressRevisionRef.current++;
    }
  }), []);

  // Native source press handlers must stay stable: changing onPress makes
  // ShapeSource serialize its entire GeoJSON even when the points are unchanged.
  // Publish only committed values, before native events can observe the new UI.
  useLayoutEffect(() => {
    pointSelectionRef.current = {
      isPlanMode, selectedPointData, selectedPoint: selectedPoint ?? null,
      nearbyLocation: nearbyLocation ?? null, selectedMarkerKey, onPointSelect, onMapPress, onNearbyLocationOpen,
    };
    return () => {
      pointSelectionRef.current = null;
    };
  }, [isPlanMode, onMapPress, onPointSelect, onNearbyLocationOpen, selectedMarkerKey, selectedPointData, selectedPoint, nearbyLocation]);

  useEffect(() => {
    if (nearbyLocationId === undefined || !nearbyGeo) return;
    return observeAdministrativeRegion(nearbyGeo, (region) => setNearbyRegion({ id: nearbyLocationId, region }));
  }, [isPlanMode, nearbyLocationId, nearbyGeo]);

  useEffect(() => {
    prefetchPlaceSprite();
    prefetchMapStyle(MAP_STYLES[styleIndex].url);
  }, [isPlanMode, styleIndex]);

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
    return {
      zoom: z,
      bounds: b,
      center: state.properties.center,
      heading: state.properties.heading,
      pitch: state.properties.pitch,
      ...mapSizeRef.current,
    };
  }, []);

  const currentCameraStateRef = useRef<ReturnType<typeof updateCameraState> | null>(null);
  const lastReportedCameraStateRef = useRef<ReturnType<typeof updateCameraState> | null>(null);
  const { run: reportCameraChange, cancel: cancelCameraChange } = useDebounceFn(
    async (next: ReturnType<typeof updateCameraState>) => {
      if (!navigation.isFocused()) return;
      const previous = lastReportedCameraStateRef.current;
      if (
        previous?.zoom === next.zoom &&
        previous.center[0] === next.center[0] &&
        previous.center[1] === next.center[1] &&
        previous.heading === next.heading &&
        previous.pitch === next.pitch &&
        previous.width === next.width &&
        previous.height === next.height &&
        previous.bounds?.ne[0] === next.bounds?.ne[0] &&
        previous.bounds?.ne[1] === next.bounds?.ne[1] &&
        previous.bounds?.sw[0] === next.bounds?.sw[0] &&
        previous.bounds?.sw[1] === next.bounds?.sw[1]
      ) {
        return;
      }
      const revision = cameraRevisionRef.current;
      const map = mapViewRef.current;
      let footprint: MapCoordinate[] | undefined;
      if (onCameraChange && map && next.width > 0 && next.height > 0 && (next.heading !== 0 || next.pitch !== 0)) {
        // A rotated/tilted viewport is a quadrilateral inside the camera's bounds.
        // Read only its four corners after settling, never one native call per point/frame.
        try {
          const corners = await Promise.all(
            [
              [0, 0],
              [next.width, 0],
              [next.width, next.height],
              [0, next.height],
            ].map((corner) => map.getCoordinateFromView(corner)),
          );
          if (corners.every((corner) => corner.length >= 2 && corner.every(Number.isFinite))) {
            footprint = corners.map(([longitude, latitude]) => [longitude, latitude]);
          }
        } catch {
          // Retain bounds-based reporting if the native map becomes unavailable.
        }
      }
      if (revision !== cameraRevisionRef.current || !navigation.isFocused() || map !== mapViewRef.current) return;
      lastReportedCameraStateRef.current = next;
      onCameraChange?.({ zoom: next.zoom, center: [next.center[0], next.center[1]], bounds: next.bounds, footprint });
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
        cameraRevisionRef.current++;
        lastReportedCameraStateRef.current = null;
        cancelCameraChange();
      };
    }, [cancelCameraChange, isPlanMode]),
  );

  const handleMapReady = useCallback(() => {
    loadedStyleIndexRef.current = styleIndex;
    setLoadedStyleIndex(styleIndex);
    onMapReady?.();
  }, [onMapReady, styleIndex]);

  const handleCameraChanged = useCallback(
    (state: MapState) => {
      // Invalidate corner reads as soon as another native camera event arrives.
      cameraRevisionRef.current++;
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
      // Update marker viewports on each camera event; debounce only the external settled callback.
      const next = updateCameraState(state);
      currentCameraStateRef.current = next;
      onViewportChange?.(next);
      reportCameraChange(next);
    },
    [navigation, onViewportChange, reportCameraChange, styleIndex, updateCameraState],
  );

  const getSelectedArtworkPress = useCallback(
    async (screenPoint: { x: number; y: number }): Promise<MapPointReference | null> => {
      const selection = pointSelectionRef.current;
      const selected = selection?.selectedPointData;
      const markerKey = selection?.selectedMarkerKey;
      const hitRects = selectedHitRectsRef.current;
      const map = mapViewRef.current;
      if (!selection?.isPlanMode || !selected || !markerKey || hitRects?.key !== markerKey || !map) return null;

      try {
        // Project on each press so camera movement cannot leave the selected artwork's hit area behind.
        const [anchorX, anchorY] = await map.getPointInView([selected.point.geo[1], selected.point.geo[0]]);
        if (pointSelectionRef.current?.selectedMarkerKey !== markerKey || mapViewRef.current !== map) return null;
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
    [],
  );

  // Browse point presses do not inspect the selected artwork. Keeping this
  // callback independent prevents popup dismissal from invalidating the full point source.
  const handleBrowsePointSelect = useCallback(
    (point: Bangumi['points'][number], bangumi: Bangumi) => {
      browsePressRevisionRef.current++;
      const selected = useMapBrowse.getState().selectedMapPoint;
      if (selected?.bangumiId === bangumi.id && selected.pointId === point.id) return;
      selectMapPoint({ bangumiId: bangumi.id, pointId: point.id });
    },
    [selectMapPoint],
  );

  const handlePlanPointSelect = useCallback(
    (point: Bangumi['points'][number], bangumi: Bangumi, screenPoint?: { x: number; y: number }) => {
      const pressRevision = ++browsePressRevisionRef.current;
      const reference = { bangumiId: bangumi.id, pointId: point.id };
      if (!screenPoint) {
        pointSelectionRef.current?.onPointSelect?.(reference);
        return;
      }
      const map = mapViewRef.current;
      void getSelectedArtworkPress(screenPoint).then((selectedPress) => {
        if (mapViewRef.current !== map || pressRevision !== browsePressRevisionRef.current) return;
        pointSelectionRef.current?.onPointSelect?.(selectedPress ?? reference);
      });
    },
    [getSelectedArtworkPress],
  );
  const handlePointSelect = isPlanMode ? handlePlanPointSelect : handleBrowsePointSelect;

  const handleLocationMapPress = useCallback(
    (
      event: GeoJSON.Feature<GeoJSON.Point, { screenPointX: number; screenPointY: number }>,
      pressRevision = ++browsePressRevisionRef.current,
    ) => {
      const selection = pointSelectionRef.current;
      if (!selection) return;
      const planMode = selection.isPlanMode;
      const browse = useMapBrowse.getState();
      const location = planMode ? selection.nearbyLocation : browse.nearbyMapLocation;
      const selectedPoint = planMode ? selection.selectedPoint : browse.selectedMapPoint;
      // The plan's bottom card and selected artwork stay independent of this overlay.
      const hadPopup = planMode ? !!location : !!(selectedPoint || location);
      if (!hadPopup && !useMapData.getState().data) return;
      const [rawLongitude, latitude] = event.geometry.coordinates;
      if (!Number.isFinite(rawLongitude) || !Number.isFinite(latitude)) return;
      // World copies can report longitudes outside [-180, 180].
      const longitude = ((rawLongitude + 180) % 360 + 360) % 360 - 180;
      if (!isValidCoordinate(latitude, longitude)) return;
      const detailsId = browse.openedBangumiDetailsId;
      const planSelectionRevision = planSelectionRevisionRef.current;
      const map = mapViewRef.current;
      const styleRevision = styleRevisionRef.current;
      // The rendered-feature query uses the original screen point. Once the
      // camera moves, that point no longer describes the clicked coordinate.
      const cameraRevision = cameraRevisionRef.current;
      const openNearby = (place: NearbyMapLocation['place'] = null) => {
        const geo: [number, number] = [latitude, longitude];
        if (planMode) {
          pointSelectionRef.current?.onNearbyLocationOpen?.({ id: nextPlanNearbyLocationIdRef.current++, geo, place });
        } else {
          useMapBrowse.getState().openNearbyMapLocation(geo, place);
        }
      };
      const clearSelection = () => {
        if (planMode) pointSelectionRef.current?.onMapPress?.();
        else useMapBrowse.getState().clearSelectedMapPoint();
      };
      const { screenPointX, screenPointY } = event.properties;
      if (!map || !Number.isFinite(screenPointX) || !Number.isFinite(screenPointY)) {
        if (!hadPopup) openNearby();
        return;
      }

      const isCurrent = () => {
        const state = useMapBrowse.getState();
        const currentSelection = pointSelectionRef.current;
        return pressRevision === browsePressRevisionRef.current && map === mapViewRef.current &&
          styleRevision === styleRevisionRef.current && cameraRevision === cameraRevisionRef.current &&
          currentSelection?.isPlanMode === planMode &&
          (planMode
            ? planSelectionRevision === planSelectionRevisionRef.current &&
              currentSelection.nearbyLocation?.id === location?.id && currentSelection.selectedPoint === selectedPoint
            : state.nearbyMapLocation?.id === location?.id && state.selectedMapPoint === selectedPoint &&
              state.openedBangumiDetailsId === detailsId);
      };
      const styleKey = MAP_STYLES[styleIndex].key;
      const layers = NEARBY_PLACE_LAYERS.filter((layer) =>
        layer !== 'transit-label' || (styleKey !== 'dark' && styleKey !== 'light'));

      void (async () => {
        let queryFailed = false;
        for (const layer of layers) {
          if (!isCurrent()) return;
          try {
            const result = await map.queryRenderedFeaturesAtPoint([screenPointX, screenPointY], [], [layer]);
            if (!isCurrent()) return;
            if (!result || !Array.isArray(result.features)) {
              queryFailed = true;
              continue;
            }
            for (const feature of result.features) {
              const place = readNearbyPlace(feature, layer, language);
              if (place) {
                const old = location;
                const sameFeature = !!old?.place && (place.featureKey && old.place.featureKey
                  ? place.featureKey === old.place.featureKey
                  : !place.featureKey && !old.place.featureKey && old.place.name === place.name &&
                    old.geo[0] === latitude && old.geo[1] === longitude);
                if (!sameFeature && useMapData.getState().data) {
                  // Decode the cached icon and sample its color before mounting.
                  // Keep the old card while preparing; never switch a visible
                  // header from fallback artwork/colors to the final appearance.
                  const iconAsset = await preparePlaceIcon(place.icon, place.fallbackIcon).catch(() => null);
                  if (isCurrent() && useMapData.getState().data) {
                    openNearby({ ...place, iconAsset });
                  }
                }
                return;
              }
            }
          } catch {
            // A native query failure cannot safely be interpreted as blank map.
            queryFailed = true;
          }
        }
        if (!isCurrent()) return;
        if (hadPopup) {
          if (!queryFailed) clearSelection();
        } else if (useMapData.getState().data) {
          openNearby();
        }
      })();
    },
    [language, styleIndex],
  );

  const handlePlanMapPress = useCallback(
    (event: GeoJSON.Feature<GeoJSON.Point, { screenPointX: number; screenPointY: number }>) => {
      const pressRevision = ++browsePressRevisionRef.current;
      const planSelectionRevision = planSelectionRevisionRef.current;
      const map = mapViewRef.current;
      const cameraRevision = cameraRevisionRef.current;
      const styleRevision = styleRevisionRef.current;
      void getSelectedArtworkPress({ x: event.properties.screenPointX, y: event.properties.screenPointY }).then(
        (selectedPress) => {
          if (mapViewRef.current !== map || pressRevision !== browsePressRevisionRef.current ||
            planSelectionRevision !== planSelectionRevisionRef.current ||
            cameraRevision !== cameraRevisionRef.current || styleRevision !== styleRevisionRef.current) return;
          const selection = pointSelectionRef.current;
          if (selectedPress) selection?.onPointSelect?.(selectedPress);
          else handleLocationMapPress(event, pressRevision);
        },
      );
    },
    [getSelectedArtworkPress, handleLocationMapPress],
  );

  const handleNearbyPointPress = (point: Bangumi['points'][number], bangumi: Bangumi) => {
    browsePressRevisionRef.current++;
    const reference = { bangumiId: bangumi.id, pointId: point.id };
    const selection = pointSelectionRef.current;
    if (selection?.isPlanMode) {
      selection.onPointSelect?.(reference);
      selection.onMapPress?.();
    } else {
      focusPointFromNearby(reference);
    }
  };

  const handleBangumiIconPress = useCallback(
    (bangumi: Bangumi) => {
      browsePressRevisionRef.current++;
      openBangumiDetails(bangumi.id);
    },
    [openBangumiDetails],
  );

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
        onLayout={({ nativeEvent: { layout } }) => {
          if (mapSizeRef.current.width === layout.width && mapSizeRef.current.height === layout.height) return;
          mapSizeRef.current = { width: layout.width, height: layout.height };
          cameraRevisionRef.current++;
          lastReportedCameraStateRef.current = null;
          if (currentCameraStateRef.current) {
            reportCameraChange({ ...currentCameraStateRef.current, ...mapSizeRef.current });
          }
        }}
        onCameraChanged={handleCameraChanged}
        onDidFinishLoadingMap={handleMapReady}
        onPress={isPlanMode ? handlePlanMapPress : handleLocationMapPress}
      >
        <Camera
          ref={setCameraRef}
          centerCoordinate={DEFAULT_COORDINATES}
          zoomLevel={MAP_DEFAULT_ZOOM}
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
          filteredBangumiId={isPlanMode ? null : undefined}
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
            filteredBangumiId={isPlanMode ? null : undefined}
            ignoreZoomThreshold={isPlanMode && planPointImageZoomThreshold === undefined}
            zoomThresholdOverride={isPlanMode ? planPointImageZoomThreshold : undefined}
            densityZoomThresholdOverride={isPlanMode ? planPointImageDensityZoomThreshold : undefined}
            onPointSelect={handlePointSelect}
          />
        )}

        {isPlanMode ? (
          <SelectedPlanMapPointLayer
            selected={selectedPointData}
            mapReady={loadedStyleIndex === styleIndex}
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
        {!isPlanMode && selectedPointData ? (
          <MarkerView
            coordinate={[selectedPointData.point.geo[1], selectedPointData.point.geo[0]]}
            anchor={{ x: 0.5, y: 1 }}
            allowOverlap
            allowOverlapWithPuck
            isSelected
          >
            <PopupCard point={selectedPointData.point} bangumi={selectedPointData.bangumi} />
          </MarkerView>
        ) : null}
        {nearbyMapLocation ? (
          <MarkerView
            key={`nearby:${mode}:${nearbyMapLocation.id}`}
            coordinate={[nearbyMapLocation.geo[1], nearbyMapLocation.geo[0]]}
            anchor={{ x: 0.5, y: 1 }}
            allowOverlap
            allowOverlapWithPuck
            isSelected
          >
            <NearbyPointPopupCard
              geo={nearbyMapLocation.geo}
              nearbyPoints={nearbyPoints}
              place={nearbyMapLocation.place}
              mapStyleURL={MAP_STYLES[styleIndex].url}
              mapZoom={zoom}
              region={nearbyRegion?.id === nearbyMapLocation.id ? nearbyRegion.region : null}
              onPointPress={handleNearbyPointPress}
            />
          </MarkerView>
        ) : null}
      </MapView>
    </MapMarkerSelectionContext.Provider>
  );
});

export default MapContainer;
