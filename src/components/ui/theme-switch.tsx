import { Switch, type SwitchProps } from 'tamagui';

export function ThemeSwitch(props: Omit<SwitchProps, 'children'>) {
  return (
    <Switch activeStyle={{ backgroundColor: '$primary' }} size="$3" padding="$1" {...props}>
      <Switch.Thumb style={{ height: '100%', aspectRatio: 1 }} backgroundColor="$white" transition="quickest" />
    </Switch>
  );
}
