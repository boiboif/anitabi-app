import { themed, type IconProps } from '@tamagui/helpers-icon';
import type { JSX } from 'react';
import { Svg, Path, type SvgProps } from 'react-native-svg';

export const Utensils: (props: IconProps) => JSX.Element = themed(function Utensils(props: IconProps) {
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
      <Path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" stroke={color} />
      <Path d="M7 2v20" stroke={color} />
      <Path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" stroke={color} />
    </Svg>
  );
});
