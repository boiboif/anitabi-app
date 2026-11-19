import type { JSX } from 'react';
import { Svg, Circle, Line, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const Locate: (props: IconProps) => JSX.Element = themed(function Locate(props: IconProps) {
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
      <Line x1="2" x2="5" y1="12" y2="12" stroke={color} />
      <Line x1="19" x2="22" y1="12" y2="12" stroke={color} />
      <Line x1="12" x2="12" y1="2" y2="5" stroke={color} />
      <Line x1="12" x2="12" y1="19" y2="22" stroke={color} />
      <Circle cx="12" cy="12" r="7" stroke={color} />
    </Svg>
  );
});
