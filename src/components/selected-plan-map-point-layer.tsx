import SelectedMapPointMarker from '@/components/selected-map-point-marker';
import { SELECTED_MAP_POINT_LAYER_ID } from '@/lib/constants';
import { getSelectedMapPointSource, type SelectedMapPointData } from '@/utils/selected-map-point-source';
import { Image as MapboxImage, Images, ShapeSource, SymbolLayer } from '@rnmapbox/maps';
import { useCallback, useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'tamagui';

// Reuse one texture slot instead of retaining an image for every visited point.
const IMAGE_ID = 'selected-plan-point-artwork';

type Props = {
  selected: SelectedMapPointData | null;
  showImage: boolean;
};

export default function SelectedPlanMapPointLayer({ selected, showImage }: Props) {
  const imageRef = useRef<ComponentRef<typeof MapboxImage>>(null);
  const frameRef = useRef<number | null>(null);
  const theme = useTheme();
  const { t } = useTranslation();
  const label = t('currentLocation', { defaultValue: '当前点位' });
  const primary = theme.primary.val;
  // Camera movement never changes the selected source payload or its artwork.
  const shape = useMemo(() => getSelectedMapPointSource(selected), [selected]);
  const refreshArtwork = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      imageRef.current?.refresh();
    });
  }, []);

  useEffect(() => {
    refreshArtwork();
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [selected, showImage, primary, label, refreshArtwork]);

  return (
    <>
      {selected ? (
        <Images
          onImageMissing={(name) => {
            if (name === IMAGE_ID) refreshArtwork();
          }}
        >
          <MapboxImage name={IMAGE_ID} ref={imageRef}>
            <SelectedMapPointMarker
              point={selected.point}
              bangumi={selected.bangumi}
              showImage={showImage}
              onRendered={refreshArtwork}
            />
          </MapboxImage>
        </Images>
      ) : null}
      {/* The underlying image or circle source handles taps, including taps on this selected marker. */}
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
