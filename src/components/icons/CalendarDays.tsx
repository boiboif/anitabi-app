import type { JSX } from 'react';
import { Svg, Path, Rect, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const CalendarDays: (props: IconProps) => JSX.Element = themed(function CalendarDays(props: IconProps) {
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
      <Path d="M8 2v4" stroke={color} />
      <Path d="M16 2v4" stroke={color} />
      <Rect width="18" height="18" x="3" y="4" rx="2" stroke={color} />
      <Path d="M3 10h18" stroke={color} />
      <Path d="M8 14h.01" stroke={color} />
      <Path d="M12 14h.01" stroke={color} />
      <Path d="M16 14h.01" stroke={color} />
      <Path d="M8 18h.01" stroke={color} />
      <Path d="M12 18h.01" stroke={color} />
      <Path d="M16 18h.01" stroke={color} />
    </Svg>
  );
});
