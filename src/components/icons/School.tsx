import { themed, type IconProps } from '@tamagui/helpers-icon';
import type { JSX } from 'react';
import { Svg, Circle, Path, type SvgProps } from 'react-native-svg';

export const School: (props: IconProps) => JSX.Element = themed(function School(props: IconProps) {
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
      <Path d="M14 22v-4a2 2 0 1 0-4 0v4" stroke={color} />
      <Path d="m18 10 3.447 1.724a1 1 0 0 1 .553.894V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7.382a1 1 0 0 1 .553-.894L6 10" stroke={color} />
      <Path d="M18 5v17" stroke={color} />
      <Path d="m4 6 7.106-3.553a2 2 0 0 1 1.788 0L20 6" stroke={color} />
      <Path d="M6 5v17" stroke={color} />
      <Circle cx="12" cy="9" r="2" stroke={color} />
    </Svg>
  );
});
