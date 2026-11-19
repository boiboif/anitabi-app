import { themed, type IconProps } from '@tamagui/helpers-icon';
import type { JSX } from 'react';
import { Svg, Path, type SvgProps } from 'react-native-svg';

export const Hospital: (props: IconProps) => JSX.Element = themed(function Hospital(props: IconProps) {
  const { color = 'black', size = 24, ...otherProps } = props as SvgProps & { color?: string; size?: number };
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...otherProps}
    >
      <Path d="M12 6v4" stroke={color} />
      <Path d="M14 14h-4" stroke={color} />
      <Path d="M14 18h-4" stroke={color} />
      <Path d="M14 8h-4" stroke={color} />
      <Path d="M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2" stroke={color} />
      <Path d="M18 22V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v18" stroke={color} />
    </Svg>
  );
});
