import { Switch, type SwitchProps } from 'tamagui';

type ThemeSwitchProps = Pick<SwitchProps, 'checked' | 'onCheckedChange'>;

export function ThemeSwitch(props: ThemeSwitchProps) {
  return (
    <Switch
      checked={props.checked}
      onCheckedChange={props.onCheckedChange}
      activeStyle={{ backgroundColor: '$primary' }}
      size="$3"
      padding="$1"
    >
      <Switch.Thumb
        style={{ height: '100%', aspectRatio: 1 }}
        backgroundColor="$white"
        transition="quickest"
      />
    </Switch>
  );
}