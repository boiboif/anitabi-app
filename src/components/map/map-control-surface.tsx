import { MAP_CONTROL_SIZE } from '@/lib/constants';
import { styled, YStack } from 'tamagui';

const MapControlSurface = styled(YStack, {
  name: 'MapControlSurface',
  w: MAP_CONTROL_SIZE,
  h: MAP_CONTROL_SIZE,
  rounded: MAP_CONTROL_SIZE / 2,
  bg: 'background',
  items: 'center',
  justify: 'center',
  pointerEvents: 'none',
  boxShadow: {
    default: '0 0 4px rgba(0,0,0,0.2)',
    dark: '0 0 4px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.12)',
  },
});

export default MapControlSurface;
