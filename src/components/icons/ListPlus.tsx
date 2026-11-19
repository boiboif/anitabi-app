import type { JSX } from 'react';
import { Svg, Path, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const ListPlus: (props: IconProps) => JSX.Element = themed(function ListPlus(props: IconProps) {
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
      <Path d="M11 12H3" stroke={color} />
      <Path d="M16 6H3" stroke={color} />
      <Path d="M16 18H3" stroke={color} />
      <Path d="M18 9v6" stroke={color} />
      <Path d="M21 12h-6" stroke={color} />
    </Svg>
  );
});
