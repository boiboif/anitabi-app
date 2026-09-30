import { SELECTED_MAP_POINT_LAYER_ID } from '@/lib/constants';
import { SELECTED_MAP_POINT_DOT_DIAMETER } from '@/lib/ui-sizes';
import { buildImageUrl } from '@/services/handlers';
import type { Bangumi, Point } from '@/services/types';
import { getMapPointCircleStyle } from '@/utils/map-point-style';
import { getSelectedMapPointSource, type SelectedMapPointData } from '@/utils/selected-map-point-source';
import { CircleLayer, Images, Image as MapboxImage, ShapeSource, SymbolLayer } from '@rnmapbox/maps';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { LayoutRectangle } from 'react-native';
import { Text, useTheme, View, YStack } from 'tamagui';

export type MarkerHitRect = { left: number; top: number; right: number; bottom: number };

export function getSelectedPlanMarkerKey(bangumiId: number, pointId: string, showImage: boolean): string {
  return `${bangumiId}:${pointId}:${showImage}`;
}

type BrowseLayerProps = {
  selected?: SelectedMapPointData | null;
  maxVisualDiameter?: number;
  onPress: (point: Point, bangumi: Bangumi) => void;
};

export function SelectedMapPointLayer({ selected, maxVisualDiameter, onPress }: BrowseLayerProps) {
  const shape = useMemo(() => getSelectedMapPointSource(selected), [selected]);
  return (
    <ShapeSource
      id="selected-map-point-source"
      shape={shape}
      onPress={() => {
        if (selected) onPress(selected.point, selected.bangumi);
      }}
    >
      {/* An empty source keeps the ordering anchor mounted without an always-false filter. */}
      <CircleLayer id={SELECTED_MAP_POINT_LAYER_ID} style={getMapPointCircleStyle(maxVisualDiameter)} />
    </ShapeSource>
  );
}

type ArtworkProps = {
  point: Point;
  bangumi: Bangumi;
  showImage: boolean;
  onRendered: () => void;
  onHitRectsChange: (rects: MarkerHitRect[]) => void;
};

/** Offscreen artwork for the selected map symbol. Each visible part has its own bounds relative to the bottom-center anchor. */
function SelectedMapPointArtwork({ point, bangumi, showImage, onRendered, onHitRectsChange }: ArtworkProps) {
  const { t } = useTranslation();
  const hasImage = Boolean(point.image && showImage);
  const rootLayoutRef = useRef<LayoutRectangle | null>(null);
  const imageLayoutRef = useRef<LayoutRectangle | null>(null);
  const detailsLayoutRef = useRef<LayoutRectangle | null>(null);
  const labelLayoutRef = useRef<LayoutRectangle | null>(null);
  const dotLayoutRef = useRef<LayoutRectangle | null>(null);
  const reportHitRects = () => {
    const root = rootLayoutRef.current;
    const details = detailsLayoutRef.current;
    const label = labelLayoutRef.current;
    const dot = dotLayoutRef.current;
    if (!root || !details || !label || !dot) return;
    const image = hasImage ? imageLayoutRef.current : null;
    if (hasImage && !image) return;
    const toHitRect = (layout: LayoutRectangle, offsetX = 0, offsetY = 0): MarkerHitRect => {
      const left = offsetX + layout.x - root.width / 2;
      const top = offsetY + layout.y - root.height;
      return { left, top, right: left + layout.width, bottom: top + layout.height };
    };
    onHitRectsChange([
      ...(image ? [toHitRect(image)] : []),
      toHitRect(label, details.x, details.y),
      toHitRect(dot, details.x, details.y),
    ]);
  };

  return (
    <YStack
      collapsable={false}
      items="center"
      pointerEvents="none"
      onLayout={(event) => {
        rootLayoutRef.current = event.nativeEvent.layout;
        reportHitRects();
        onRendered();
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {point.image && showImage ? (
        <View
          rounded="$3"
          overflow="hidden"
          borderWidth={3}
          borderColor="$primary"
          onLayout={(event) => {
            imageLayoutRef.current = event.nativeEvent.layout;
            reportHitRects();
          }}
        >
          <Image
            key={point.image}
            source={{ uri: buildImageUrl(point.image, 'plan=h160') }}
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={0}
            onDisplay={onRendered}
            style={{ width: 120, aspectRatio: 16 / 9 }}
          />
        </View>
      ) : null}
      <YStack
        items="center"
        onLayout={(event) => {
          detailsLayoutRef.current = event.nativeEvent.layout;
          reportHitRects();
        }}
      >
        <View
          bg="$primary"
          rounded="$9"
          px="$2"
          py="$0.5"
          mt={hasImage ? -3 : 0}
          z={2}
          onLayout={(event) => {
            labelLayoutRef.current = event.nativeEvent.layout;
            reportHitRects();
          }}
        >
          <Text fontSize="$caption" lineHeight={16} fontWeight="700" color="white">
            {t('currentLocation', { defaultValue: '当前点位' })}
          </Text>
        </View>
        <View
          width={SELECTED_MAP_POINT_DOT_DIAMETER}
          height={SELECTED_MAP_POINT_DOT_DIAMETER}
          rounded="$9"
          borderWidth={3}
          borderColor="white"
          mt={-2}
          style={{ backgroundColor: bangumi.color || '#991b1b' }}
          onLayout={(event) => {
            dotLayoutRef.current = event.nativeEvent.layout;
            reportHitRects();
          }}
        />
      </YStack>
    </YStack>
  );
}

const IMAGE_ID = 'selected-plan-point-artwork';

type PlanLayerProps = {
  selected: SelectedMapPointData | null;
  showImage: boolean;
  onHitRectsChange: (key: string, rects: MarkerHitRect[]) => void;
};

export function SelectedPlanMapPointLayer({ selected, showImage, onHitRectsChange }: PlanLayerProps) {
  const imageRef = useRef<ComponentRef<typeof MapboxImage>>(null);
  const frameRef = useRef<number | null>(null);
  const theme = useTheme();
  const { t } = useTranslation();
  const label = t('currentLocation', { defaultValue: '当前点位' });
  const primary = theme.primary.val;
  const selectedPointId = selected?.point.id;
  const selectedBangumiId = selected?.bangumi.id;
  const selectedImage = selected?.point.image;
  const selectedColor = selected?.bangumi.color;
  const artworkKey = selected ? getSelectedPlanMarkerKey(selected.bangumi.id, selected.point.id, showImage) : null;
  const shape = useMemo(() => getSelectedMapPointSource(selected), [selected]);
  const refreshArtwork = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      imageRef.current?.refresh();
    });
  }, []);

  useEffect(() => {
    if (selectedPointId !== undefined) refreshArtwork();
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [selectedPointId, selectedBangumiId, selectedImage, selectedColor, showImage, primary, label, refreshArtwork]);

  return (
    <>
      {selected && artworkKey ? (
        <Images
          onImageMissing={(name) => {
            if (name === IMAGE_ID) refreshArtwork();
          }}
        >
          <MapboxImage name={IMAGE_ID} ref={imageRef}>
            <SelectedMapPointArtwork
              key={artworkKey}
              point={selected.point}
              bangumi={selected.bangumi}
              showImage={showImage}
              onRendered={refreshArtwork}
              onHitRectsChange={(rects) => onHitRectsChange(artworkKey, rects)}
            />
          </MapboxImage>
        </Images>
      ) : null}
      <ShapeSource id="selected-map-point-source" shape={shape}>
        <SymbolLayer
          id={SELECTED_MAP_POINT_LAYER_ID}
          style={{
            iconImage: IMAGE_ID,
            iconSize: 1,
            iconAnchor: 'bottom',
            iconPitchAlignment: 'viewport',
            iconRotationAlignment: 'viewport',
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
            iconOpacityTransition: { duration: 0, delay: 0 },
          }}
        />
      </ShapeSource>
    </>
  );
}
