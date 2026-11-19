import { useRef } from 'react';
import type { GestureResponderEvent, LayoutChangeEvent, LayoutRectangle, PressableProps } from 'react-native';
import { Button as TamaguiButton, type ButtonProps } from 'tamagui/button';

const strictPressRetentionOffset = { top: 0, right: 0, bottom: 0, left: 0 };

// Preserve the app's v2 button geometry while v3 uses named control sizes.
const buttonSizes = {
  sm: { height: 28, padding: 7, radius: 5 },
  md: { height: 36, padding: 13, radius: 7 },
  lg: { height: 44, padding: 18, radius: 9 },
} as const;

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

type StrictButtonProps = ButtonProps & Pick<PressableProps, 'onLayout' | 'onResponderMove' | 'pressRetentionOffset'>;

export function StrictButton({
  children,
  size = 'lg',
  // The classic pack retains this relative theme; v3 types omit its component aliases.
  theme = 'Button' as ButtonProps['theme'],
  fontSize = 'body',
  fontWeight = '400',
  onLayout,
  onPress,
  pressRetentionOffset,
  ...props
}: StrictButtonProps) {
  const layoutRef = useRef<LayoutRectangle | null>(null);
  const dimensions =
    size === true
      ? buttonSizes.lg
      : typeof size === 'string' && size in buttonSizes
        ? buttonSizes[size as keyof typeof buttonSizes]
        : undefined;
  const circularSize = props.w ?? props.h ?? dimensions?.height;

  const handleLayout = (event: LayoutChangeEvent) => {
    layoutRef.current = event.nativeEvent.layout;
    onLayout?.(event);
  };

  const handlePress = (event: GestureResponderEvent) => {
    // V3 delegates move cancellation to RN Pressability. Check release coordinates
    // as well: Pressability can miss the final position when no move arrives first.
    if (isInsideLayout(getPressCoordinates(event), layoutRef.current)) {
      onPress?.(event);
    }
  };

  const buttonProps = {
    opacity: 1,
    ...(dimensions && {
      h: dimensions.height,
      minH: 0,
      px: props.circular ? 0 : dimensions.padding,
      py: 0,
      rounded: props.circular ? 100_000 : dimensions.radius,
      ...(props.circular && {
        w: circularSize,
        h: circularSize,
        minW: circularSize,
        maxW: circularSize,
        minH: circularSize,
        maxH: circularSize,
      }),
    }),
    ...props,
    // Keep false explicit so native buttons clear a previous disabled state.
    accessibilityState: {
      ...props.accessibilityState,
      disabled: props.disabled ?? props.accessibilityState?.disabled ?? false,
    },
    size,
    theme,
    fontSize,
    fontWeight,
    onLayout: handleLayout,
    onPress: handlePress,
    pressRetentionOffset: pressRetentionOffset ?? strictPressRetentionOffset,
  } satisfies StrictButtonProps;

  return <TamaguiButton {...buttonProps}>{children}</TamaguiButton>;
}
