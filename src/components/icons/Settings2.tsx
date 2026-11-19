import type { JSX } from 'react';
import { Svg, Circle, Path, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const Settings2: (props: IconProps) => JSX.Element = themed(function Settings2(props: IconProps) {
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
      <Path d="M20 7h-9" stroke={color} />
      <Path d="M14 17H5" stroke={color} />
      <Circle cx="17" cy="17" r="3" stroke={color} />
      <Circle cx="7" cy="7" r="3" stroke={color} />
    </Svg>
  );
});
