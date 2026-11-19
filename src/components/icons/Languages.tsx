import type { JSX } from 'react';
import { Svg, Path, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const Languages: (props: IconProps) => JSX.Element = themed(function Languages(props: IconProps) {
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
      <Path d="m5 8 6 6" stroke={color} />
      <Path d="m4 14 6-6 2-3" stroke={color} />
      <Path d="M2 5h12" stroke={color} />
      <Path d="M7 2h1" stroke={color} />
      <Path d="m22 22-5-10-5 10" stroke={color} />
      <Path d="M14 18h6" stroke={color} />
    </Svg>
  );
});
