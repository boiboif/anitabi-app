import LayerSwitch from '@/components/layer-switch';
import LoadingBadge from '@/components/loading-badge';
import LocateButton from '@/components/locate-button';
import MapContainer from '@/components/map-container';
import MapTopBangumiIcons from '@/components/map-top-bangumi-icons';
import PlanMapPointCard, {
  PLAN_MAP_POINT_CARD_BOTTOM_OFFSET,
  PLAN_MAP_POINT_CARD_FALLBACK_HEIGHT,
} from '@/components/plan-map-point-card';
import PlanMapPointListSheet from '@/components/plan-map-point-list-sheet';
import type { PlanMapResolvedPoint } from '@/components/plan-map-point-types';
import PointImageMarkerSwitch from '@/components/point-image-marker-switch';
import { StrictButton as Button } from '@/components/strict-button';
import { useMapLocate } from '@/hooks/use-map-locate';
import { useThemedMapStyle } from '@/hooks/use-themed-map-style';
import { getPointFlyToZoom } from '@/lib/map-camera';
import { ICON_BUTTON_ICON_SIZE } from '@/lib/ui-sizes';
import type { Bangumi, Point } from '@/services/types';
import { type MapPointReference } from '@/store/use-map-browse';
import { useMapData } from '@/store/use-map-data';
import { usePlans } from '@/store/use-plans';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import type { Camera } from '@rnmapbox/maps';
import { ArrowLeft, List } from '@tamagui/lucide-icons-2';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, YStack } from 'tamagui';

type CameraState = {
  zoom: number;
  bounds: { ne: [number, number]; sw: [number, number] } | null;
};

const POINT_CAMERA_TOP_PADDING = 110;
const POINT_CAMERA_BOTTOM_PADDING = 24;

function findPoint(bangumis: Bangumi[], reference: MapPointReference | null): Point | null {
  if (!reference) return null;
  return (
    bangumis
      .find((bangumi) => bangumi.id === reference.bangumiId)
      ?.points.find((point) => point.id === reference.pointId) ?? null
  );
}

function findCircularPoint(
  points: PlanMapResolvedPoint[],
  current: PlanMapResolvedPoint | null,
  direction: 'previous' | 'next',
): PlanMapResolvedPoint | null {
  if (!current || points.length === 0) return null;
  if (points.length === 1 && points[0].item.key === current.item.key) return null;

  const currentPoolIndex = points.findIndex((resolved) => resolved.item.key === current.item.key);
  if (currentPoolIndex >= 0) {
    const offset = direction === 'previous' ? -1 : 1;
    return points[(currentPoolIndex + offset + points.length) % points.length];
  }

  if (direction === 'next') {
    return points.find((resolved) => resolved.planIndex > current.planIndex) ?? points[0];
  }

  const previousPoints = points.filter((resolved) => resolved.planIndex < current.planIndex);
  return previousPoints[previousPoints.length - 1] ?? points[points.length - 1];
}

export default function PlanMapScreen() {
  const { t } = useTranslation();
  const { planId, bangumiId, pointId } = useLocalSearchParams<{
    planId: string;
    bangumiId?: string;
    pointId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);
  const pointListSheetRef = useRef<TrueSheet>(null);
  const { handleLocate, isLocating, isLocationPuckActive, locationPuckRevision } = useMapLocate(cameraRef);
  const initialCameraApplied = useRef(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [styleIndex, setStyleIndex] = useThemedMapStyle();
  const [showPointImageMarkers, setShowPointImageMarkers] = useState(true);
  const [selectedBangumiIds, setSelectedBangumiIds] = useState<number[]>([]);
  const [cameraState, setCameraState] = useState<CameraState>({ zoom: 4.6, bounds: null });
  const [pointCardHeight, setPointCardHeight] = useState(PLAN_MAP_POINT_CARD_FALLBACK_HEIGHT);
  const plan = usePlans((state) => state.plans.find((item) => item.id === planId));
  const togglePoint = usePlans((state) => state.togglePoint);
  const data = useMapData((state) => state.data);
  const progress = useMapData((state) => state.progress);

  const initialPointReference = useMemo<MapPointReference | null>(() => {
    const parsedBangumiId = Number(bangumiId);
    return pointId && Number.isFinite(parsedBangumiId) ? { bangumiId: parsedBangumiId, pointId } : null;
  }, [bangumiId, pointId]);
  const [selectedPoint, setSelectedPoint] = useState<MapPointReference | null>(initialPointReference);

  const bangumis = useMemo<Bangumi[]>(() => {
    if (!plan || !data) return [];

    const pointIdsByBangumi = new Map<number, Set<string>>();
    for (const item of plan.items) {
      const pointIds = pointIdsByBangumi.get(item.bangumiId) ?? new Set<string>();
      pointIds.add(item.pointId);
      pointIdsByBangumi.set(item.bangumiId, pointIds);
    }

    return data.data.bangumis.flatMap((bangumi) => {
      const pointIds = pointIdsByBangumi.get(bangumi.id);
      if (!pointIds) return [];
      const points = bangumi.points.filter((point) => pointIds.has(point.id));
      return points.length > 0 ? [{ ...bangumi, points }] : [];
    });
  }, [data, plan]);

  const resolvedPlanPoints = useMemo<PlanMapResolvedPoint[]>(() => {
    if (!plan) return [];
    const bangumiById = new Map(bangumis.map((bangumi) => [bangumi.id, bangumi]));
    return plan.items.flatMap((item, planIndex) => {
      const bangumi = bangumiById.get(item.bangumiId);
      const point = bangumi?.points.find((candidate) => candidate.id === item.pointId);
      return bangumi && point ? [{ item, planIndex, bangumi, point }] : [];
    });
  }, [bangumis, plan]);

  const selectedResolvedPoint = useMemo(
    () =>
      selectedPoint
        ? (resolvedPlanPoints.find(
            (resolved) =>
              resolved.bangumi.id === selectedPoint.bangumiId && resolved.point.id === selectedPoint.pointId,
          ) ?? null)
        : null,
    [resolvedPlanPoints, selectedPoint],
  );

  const bottomOverlayHeight = selectedResolvedPoint
    ? pointCardHeight + insets.bottom + PLAN_MAP_POINT_CARD_BOTTOM_OFFSET
    : 0;

  const navigationPoints = useMemo(() => {
    const incompletePoints = resolvedPlanPoints.filter((resolved) => !resolved.item.completed);
    return incompletePoints.length > 0 ? incompletePoints : resolvedPlanPoints;
  }, [resolvedPlanPoints]);
  const previousPoint = useMemo(
    () => findCircularPoint(navigationPoints, selectedResolvedPoint, 'previous'),
    [navigationPoints, selectedResolvedPoint],
  );
  const nextPoint = useMemo(
    () => findCircularPoint(navigationPoints, selectedResolvedPoint, 'next'),
    [navigationPoints, selectedResolvedPoint],
  );

  const setCamera = useCallback((camera: Camera | null) => {
    cameraRef.current = camera;
  }, []);
  const handlePointCardHeightChange = useCallback((height: number) => {
    setPointCardHeight((current) => (current === height ? current : height));
  }, []);
  useEffect(() => {
    if (!isMapReady || initialCameraApplied.current || bangumis.length === 0) return;

    const camera = cameraRef.current;
    if (!camera) return;

    const initialPoint = findPoint(bangumis, initialPointReference);
    if (initialPoint) {
      camera.setCamera({
        centerCoordinate: [initialPoint.geo[1], initialPoint.geo[0]],
        zoomLevel: getPointFlyToZoom(initialPoint.density),
        animationMode: 'flyTo',
        padding: {
          paddingTop: insets.top + POINT_CAMERA_TOP_PADDING,
          paddingRight: 0,
          paddingBottom: bottomOverlayHeight + POINT_CAMERA_BOTTOM_PADDING,
          paddingLeft: 0,
        },
      });
      initialCameraApplied.current = true;
      return;
    }

    const points = bangumis
      .flatMap((bangumi) => bangumi.points)
      .filter((point) => point.geo[0] !== 0 || point.geo[1] !== 0);
    if (points.length === 0) return;
    if (points.length === 1) {
      const [lat, lng] = points[0].geo;
      camera.setCamera({
        centerCoordinate: [lng, lat],
        zoomLevel: getPointFlyToZoom(points[0].density),
        animationMode: 'flyTo',
        padding: {
          paddingTop: insets.top + POINT_CAMERA_TOP_PADDING,
          paddingRight: 0,
          paddingBottom: bottomOverlayHeight + POINT_CAMERA_BOTTOM_PADDING,
          paddingLeft: 0,
        },
      });
    } else {
      const latitudes = points.map((point) => point.geo[0]);
      const longitudes = points.map((point) => point.geo[1]);
      camera.fitBounds(
        [Math.max(...longitudes), Math.max(...latitudes)],
        [Math.min(...longitudes), Math.min(...latitudes)],
        [insets.top + 120, 60, bottomOverlayHeight + 36, 60],
        500,
      );
    }
    initialCameraApplied.current = true;
  }, [bangumis, bottomOverlayHeight, initialPointReference, insets.top, isMapReady]);

  const moveCameraToPoint = useCallback(
    (resolved: PlanMapResolvedPoint) => {
      cameraRef.current?.setCamera({
        centerCoordinate: [resolved.point.geo[1], resolved.point.geo[0]],
        zoomLevel: getPointFlyToZoom(resolved.point.density),
        animationMode: 'flyTo',
        animationDuration: 1000,
        padding: {
          paddingTop: insets.top + POINT_CAMERA_TOP_PADDING,
          paddingRight: 0,
          paddingBottom:
            pointCardHeight + insets.bottom + PLAN_MAP_POINT_CARD_BOTTOM_OFFSET + POINT_CAMERA_BOTTOM_PADDING,
          paddingLeft: 0,
        },
      });
    },
    [insets.bottom, insets.top, pointCardHeight],
  );

  const focusPoint = useCallback(
    (resolved: PlanMapResolvedPoint) => {
      if (selectedBangumiIds.length > 0 && !selectedBangumiIds.includes(resolved.bangumi.id)) {
        setSelectedBangumiIds([]);
      }
      setSelectedPoint({ bangumiId: resolved.bangumi.id, pointId: resolved.point.id });
      moveCameraToPoint(resolved);
    },
    [moveCameraToPoint, selectedBangumiIds],
  );

  const handlePointSelect = useCallback(
    (reference: MapPointReference) => {
      const resolved = resolvedPlanPoints.find(
        (candidate) => candidate.bangumi.id === reference.bangumiId && candidate.point.id === reference.pointId,
      );
      if (resolved) focusPoint(resolved);
    },
    [focusPoint, resolvedPlanPoints],
  );

  const handleSelectFromList = useCallback(
    (resolved: PlanMapResolvedPoint) => {
      focusPoint(resolved);
      void pointListSheetRef.current?.dismiss();
    },
    [focusPoint],
  );

  const handleToggleCompletedFromList = useCallback(
    (resolved: PlanMapResolvedPoint) => togglePoint(planId, resolved.item.key),
    [planId, togglePoint],
  );

  const handleToggleBangumi = useCallback(
    (id: number, visibleBangumiIds: number[]) => {
      const wasSelected = selectedBangumiIds.includes(id);
      const visibleIds = new Set(visibleBangumiIds);
      const visibleSelectedIds = selectedBangumiIds.filter((selectedId) => visibleIds.has(selectedId));
      const nextSelectedIds = wasSelected
        ? visibleSelectedIds.filter((selectedId) => selectedId !== id)
        : [...visibleSelectedIds, id];

      setSelectedBangumiIds(nextSelectedIds);
      if (selectedPoint && nextSelectedIds.length > 0 && !nextSelectedIds.includes(selectedPoint.bangumiId)) {
        setSelectedPoint(null);
      }
    },
    [selectedBangumiIds, selectedPoint],
  );

  return (
    <View flex={1}>
      <Stack.Screen options={{ headerShown: false }} />
      {plan ? (
        <>
          <MapContainer
            ref={setCamera}
            mode="plan"
            insets={insets}
            bangumis={bangumis}
            styleIndex={styleIndex}
            showPointImageMarkers={showPointImageMarkers}
            locationPuckActive={isLocationPuckActive}
            locationPuckRevision={locationPuckRevision}
            scaleBarPosition={{ left: 14, bottom: bottomOverlayHeight + 12 }}
            onMapReady={() => setIsMapReady(true)}
            selectedPoint={selectedPoint}
            selectedBangumiIds={selectedBangumiIds}
            onPointSelect={handlePointSelect}
            onCameraChange={setCameraState}
          />

          <YStack position="absolute" l="$0" r="$0" t={insets.top} z={20} pointerEvents="box-none">
            <View height={40} l="$3" justify="center" pointerEvents="box-none">
              <Button
                chromeless
                circular
                width={40}
                height={40}
                p="$0"
                icon={<ArrowLeft size={ICON_BUTTON_ICON_SIZE} strokeWidth={2.25} color="$primary" />}
                onPress={() => router.back()}
                aria-label={t('backToPilgrimagePlans', { defaultValue: '返回巡礼计划' })}
              />
            </View>
            <MapTopBangumiIcons
              bangumis={bangumis}
              zoom={cameraState.zoom}
              bounds={cameraState.bounds}
              alwaysVisible
              showOpenedBangumiDetails={false}
              filter={{
                selectedBangumiIds,
                onToggleBangumi: handleToggleBangumi,
                onClear: () => setSelectedBangumiIds([]),
              }}
            />
          </YStack>

          <YStack r="$2" p="$1.5" position="absolute" t={200} z={20} gap="$3">
            <LayerSwitch styleIndex={styleIndex} onChange={setStyleIndex} />
            <PointImageMarkerSwitch visible={showPointImageMarkers} onChange={setShowPointImageMarkers} />
          </YStack>

          <YStack
            r="$2"
            p="$1.5"
            position="absolute"
            b={bottomOverlayHeight > 0 ? bottomOverlayHeight + 20 : insets.bottom + 24}
            z={20}
            gap="$3"
          >
            <Button
              circular
              width={44}
              height={44}
              p="$0"
              bg="$color1"
              borderWidth={0}
              boxShadow="0 0 4px rgba(0,0,0,0.2)"
              icon={<List size={24} strokeWidth={2.1} color="$color11" />}
              onPress={() => pointListSheetRef.current?.present()}
              aria-label={t('viewPlanLocations', { defaultValue: '查看计划点位' })}
            />
            <LocateButton loading={isLocating} onPress={handleLocate} />
          </YStack>

          {selectedResolvedPoint ? (
            <PlanMapPointCard
              resolved={selectedResolvedPoint}
              total={plan.items.length}
              bottomInset={insets.bottom}
              hasPrevious={Boolean(previousPoint)}
              hasNext={Boolean(nextPoint)}
              onPrevious={() => previousPoint && focusPoint(previousPoint)}
              onNext={() => nextPoint && focusPoint(nextPoint)}
              onRefocus={() => moveCameraToPoint(selectedResolvedPoint)}
              onToggleCompleted={() => togglePoint(plan.id, selectedResolvedPoint.item.key)}
              onHeightChange={handlePointCardHeightChange}
            />
          ) : null}

          <PlanMapPointListSheet
            ref={pointListSheetRef}
            points={resolvedPlanPoints}
            selectedKey={selectedResolvedPoint?.item.key}
            onSelect={handleSelectFromList}
            onToggleCompleted={handleToggleCompletedFromList}
          />

          {progress && <LoadingBadge progress={progress} insets={insets} />}
        </>
      ) : (
        <YStack flex={1} bg="$background" items="center" justify="center">
          <Text color="$color11">
            {t('thePlanDoesNotExistOrHasBeenDeleted', { defaultValue: '计划不存在或已被删除' })}
          </Text>
          <View position="absolute" l="$1" t={insets.top}>
            <Button
              chromeless
              width={44}
              height={44}
              p="$0"
              icon={<ArrowLeft size={ICON_BUTTON_ICON_SIZE} strokeWidth={2.25} color="$color12" />}
              onPress={() => router.back()}
              aria-label={t('backToPilgrimagePlans', { defaultValue: '返回巡礼计划' })}
            />
          </View>
        </YStack>
      )}
    </View>
  );
}
