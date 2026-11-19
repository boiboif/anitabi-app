import type { JSX } from 'react';
import { Svg, Line, Path, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const Trash2: (props: IconProps) => JSX.Element = themed(function Trash2(props: IconProps) {
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
      <Path d="M3 6h18" stroke={color} />
      <Path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" stroke={color} />
      <Path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" stroke={color} />
      <Line x1="10" x2="10" y1="11" y2="17" stroke={color} />
      <Line x1="14" x2="14" y1="11" y2="17" stroke={color} />
    </Svg>
  );
});
