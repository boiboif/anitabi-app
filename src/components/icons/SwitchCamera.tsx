import type { JSX } from 'react';
import { Svg, Circle, Path, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const SwitchCamera: (props: IconProps) => JSX.Element = themed(function SwitchCamera(props: IconProps) {
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
      <Path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" stroke={color} />
      <Path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" stroke={color} />
      <Circle cx="12" cy="12" r="3" stroke={color} />
      <Path d="m18 22-3-3 3-3" stroke={color} />
      <Path d="m6 2 3 3-3 3" stroke={color} />
    </Svg>
  );
});
