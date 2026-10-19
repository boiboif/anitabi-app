import { Input, styled } from 'tamagui';

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
  placeholderTextColor: '$color8',
});

export const ThemeInput = ThemeInputFrame.styleable((props, ref) => {
  // Native Input consumes disabled when deriving editable; preserve it for disabledStyle.
  return <ThemeInputFrame {...props} ref={ref} aria-disabled={props.disabled || props['aria-disabled']} />;
});
