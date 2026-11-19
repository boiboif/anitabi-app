import type { JSX } from 'react';
import { Svg, Circle, Path, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const Palette: (props: IconProps) => JSX.Element = themed(function Palette(props: IconProps) {
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
      <Path
        d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"
        stroke={color}
      />
      <Circle cx="13.5" cy="6.5" r=".5" fill={color} stroke={color} />
      <Circle cx="17.5" cy="10.5" r=".5" fill={color} stroke={color} />
      <Circle cx="6.5" cy="12.5" r=".5" fill={color} stroke={color} />
      <Circle cx="8.5" cy="7.5" r=".5" fill={color} stroke={color} />
    </Svg>
  );
});
