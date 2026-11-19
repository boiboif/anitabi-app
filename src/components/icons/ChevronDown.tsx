import { themed, type IconProps } from '@tamagui/helpers-icon';
import type { JSX } from 'react';
import { Svg, Path, type SvgProps } from 'react-native-svg';

export const ChevronDown: (props: IconProps) => JSX.Element = themed(function ChevronDown(props: IconProps) {
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
      <Path d="m6 9 6 6 6-6" stroke={color} />
    </Svg>
  );
});
