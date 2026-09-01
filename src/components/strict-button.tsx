import { Button as TamaguiButton, type ButtonProps } from 'tamagui';
import { useRef } from 'react';
import type {
  GestureResponderEvent,
  LayoutChangeEvent,
  LayoutRectangle,
  PressableProps,
} from 'react-native';

const strictPressRetentionOffset = { top: 0, right: 0, bottom: 0, left: 0 };

type PressCoordinates = {
  x: number;
  y: number;
};

function getPressCoordinates(event: GestureResponderEvent): PressCoordinates | null {
  const nativeEvent = event?.nativeEvent as GestureResponderEvent['nativeEvent'] & {
    clientX?: number;
    clientY?: number;
  };

  if (typeof nativeEvent?.locationX === 'number' && typeof nativeEvent.locationY === 'number') {
    return { x: nativeEvent.locationX, y: nativeEvent.locationY };
  }

  if (typeof nativeEvent?.clientX === 'number' && typeof nativeEvent.clientY === 'number') {
    const target = event.currentTarget as unknown as { getBoundingClientRect?: () => DOMRect };
    const rect = target?.getBoundingClientRect?.();
    if (rect) {
      return { x: nativeEvent.clientX - rect.left, y: nativeEvent.clientY - rect.top };
    }
  }

  return null;
}

function isInsideLayout(coordinates: PressCoordinates | null, layout: LayoutRectangle | null) {
  if (!coordinates || !layout) return true;
  return coordinates.x >= 0 && coordinates.x <= layout.width && coordinates.y >= 0 && coordinates.y <= layout.height;
}

type StrictButtonProps = ButtonProps &
  Pick<PressableProps, 'onLayout' | 'onResponderMove' | 'pressRetentionOffset'>;

export function StrictButton({
  onLayout,
  onPress,
  onPressIn,
  onResponderMove,
  pressRetentionOffset,
  ...props
}: StrictButtonProps) {
  const layoutRef = useRef<LayoutRectangle | null>(null);
  const pressInsideRef = useRef(true);

  const handleLayout = (event: LayoutChangeEvent) => {
    layoutRef.current = event.nativeEvent.layout;
    onLayout?.(event);
  };

  const handlePressIn = (event: GestureResponderEvent) => {
    pressInsideRef.current = true;
    onPressIn?.(event);
  };

  const handleResponderMove = (event: GestureResponderEvent) => {
    pressInsideRef.current = isInsideLayout(getPressCoordinates(event), layoutRef.current);
    onResponderMove?.(event);
  };

  const handlePress = (event: GestureResponderEvent) => {
    if (pressInsideRef.current && isInsideLayout(getPressCoordinates(event), layoutRef.current)) {
      onPress?.(event);
    }
  };

  const buttonProps = {
    ...props,
    onLayout: handleLayout,
    onPressIn: handlePressIn,
    onResponderMove: handleResponderMove,
    onPress: handlePress,
    pressRetentionOffset: pressRetentionOffset ?? strictPressRetentionOffset,
  } as ButtonProps;

  return <TamaguiButton {...buttonProps} />;
}
