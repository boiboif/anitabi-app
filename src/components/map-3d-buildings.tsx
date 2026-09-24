import { MAP_STYLES } from '@/lib/map-styles';
import { FillExtrusionLayer } from '@rnmapbox/maps';

type Props = {
  styleIndex: number;
};

const BUILDING_COLORS: Partial<Record<(typeof MAP_STYLES)[number]['key'], string>> = {
  dark: '#545B63',
  satellite: '#C9C2B8',
};

export default function Map3DBuildings({ styleIndex }: Props) {
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
