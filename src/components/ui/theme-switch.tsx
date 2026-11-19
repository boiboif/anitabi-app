import { useThemeName } from 'tamagui';
import { Switch, type SwitchProps } from 'tamagui/switch';

const checkedTrackStyle = { backgroundColor: 'primary hover:primary' } as const;

const TRACK_WIDTH = 46;
const TRACK_HEIGHT = 23;
const TRACK_PADDING = 2;
const THUMB_SIZE = TRACK_HEIGHT - TRACK_PADDING * 2;

export function ThemeSwitch(props: Omit<SwitchProps, 'children'>) {
  const themeName = useThemeName();
  return (
    <Switch
      activeStyle={checkedTrackStyle}
      activeTheme={themeName}
      size={false}
      w={TRACK_WIDTH}
      h={TRACK_HEIGHT}
      minH={TRACK_HEIGHT}
      bg="color-5 hover:color-5"
      p={TRACK_PADDING}
      {...props}
    >
      <Switch.Thumb
        size={false}
        w={THUMB_SIZE}
        h={THUMB_SIZE}
        backgroundColor="white"
        boxShadow="none"
        transition={{ spring: { damping: 15, mass: 0.6, stiffness: 400 } }}
      />
    </Switch>
  );
}
