import { styled } from 'tamagui';
import { Input } from 'tamagui/input';

export const ThemeInput = styled(Input, {
  name: 'ThemeInput',
  size: false,
  rounded: 9,
  px: 16,
  height: 44,
  fontSize: 'body',
  bg: 'color-1 disabled:color-3',
  color: 'color-12 disabled:color-8',
  borderWidth: 1,
  borderColor: 'color-7 hover:color-8 focus:primary disabled:color-5',
  cursorColor: 'primary',
  opacity: 'disabled:0.6',
  placeholderTextColor: 'color-8',
}).resolve((props) => (props.multiline ? { height: 'auto', py: 13 } : undefined));
