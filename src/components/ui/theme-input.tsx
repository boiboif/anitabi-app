import { Input, styled, useThemeName, type InputProps } from 'tamagui';

const ThemeInputFrame = styled(Input, {
  name: 'ThemeInput',
  fontSize: '$body',
  bg: '$color1',
  color: '$color12',
  borderWidth: 1,
  borderColor: '$color7',
  cursorColor: '$primary',
  hoverStyle: {
    borderColor: '$color8',
  },
  focusStyle: {
    borderColor: '$primary',
  },
  disabledStyle: {
    bg: '$color3',
    color: '$color8',
    borderColor: '$color5',
    opacity: 0.6,
  },
});

export const ThemeInput = ThemeInputFrame.styleable((props, ref) => {
  const isDark = useThemeName().startsWith('dark');
  // Input accepts literal colors at runtime, but its placeholder type only lists tokens.
  const placeholderTextColor = (isDark ? '#98989f' : '#8a8a93') as InputProps['placeholderTextColor'];
  return (
    <ThemeInputFrame {...props} ref={ref} placeholderTextColor={props.placeholderTextColor ?? placeholderTextColor} />
  );
});
