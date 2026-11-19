import type { JSX } from 'react';
import { Svg, Line, Path, Polyline, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const Download: (props: IconProps) => JSX.Element = themed(function Download(props: IconProps) {
  const {
    color = 'black',
    size = 24,
    ...otherProps
  } = props as SvgProps & {
    color?: string;
    size?: number;
  };
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
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke={color} />
      <Polyline points="7 10 12 15 17 10" stroke={color} />
      <Line x1="12" x2="12" y1="15" y2="3" stroke={color} />
    </Svg>
  );
});
