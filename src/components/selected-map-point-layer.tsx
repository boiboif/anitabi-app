import { SELECTED_MAP_POINT_LAYER_ID } from '@/lib/constants';
import { getMapPointCircleStyle } from '@/utils/map-point-style';
import { getSelectedMapPointSource, type SelectedMapPointData } from '@/utils/selected-map-point-source';
import { CircleLayer, ShapeSource } from '@rnmapbox/maps';
import { useMemo } from 'react';

type Props = {
  selected?: SelectedMapPointData | null;
  maxVisualDiameter?: number;
  onPress: (point: SelectedMapPointData['point'], bangumi: SelectedMapPointData['bangumi']) => void;
};

export default function SelectedMapPointLayer({ selected, maxVisualDiameter, onPress }: Props) {
  // Keep the native source payload stable across camera updates with the same selection.
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
