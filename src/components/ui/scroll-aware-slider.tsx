import { useRef } from 'react';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { Slider, View } from 'tamagui';

type Props = {
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  accessibilityLabel: string;
  onValueChange: (value: number) => void;
};

// A single horizontal slider inside a vertical scroller. The Tamagui slider supplies
// the visuals; RNGH owns touch recognition so its press-down responder cannot jump values.
export function ScrollAwareSlider({ min, max, step, value, disabled, accessibilityLabel, onValueChange }: Props) {
  const width = useRef(0);
  const drag = useRef({ value, x: 0, fromThumb: false });
  const clampValue = (next: number) => {
    const snapped = min + Math.round((next - min) / step) * step;
    return Math.max(min, Math.min(max, Number(snapped.toFixed(10))));
  };
  const isOnThumb = (x: number) => {
    const center = 8 + ((value - min) / (max - min)) * Math.max(0, width.current - 16);
    return Math.abs(x - center) <= 24;
  };
  const changeValue = (next: number) => {
    const clamped = clampValue(next);
    if (clamped !== value) onValueChange(clamped);
  };
  const updateDrag = (event: { x: number }) => {
    if (width.current <= 0) return;
    changeValue(
      drag.current.fromThumb
        ? drag.current.value + ((event.x - drag.current.x) / width.current) * (max - min)
        : min + (event.x / width.current) * (max - min),
    );
  };
  const pan = usePanGesture({
    enabled: !disabled,
    runOnJS: true,
    activeOffsetX: [-10, 10],
    failOffsetY: [-8, 8],
    maxPointers: 1,
    shouldCancelWhenOutside: false,
    onBegin: (event) => {
      drag.current = { value, x: event.x, fromThumb: isOnThumb(event.x) };
    },
    onActivate: updateDrag,
    onUpdate: updateDrag,
    onDeactivate: (event) => {
      if (!event.canceled) updateDrag(event);
    },
  });
  const tap = useTapGesture({
    enabled: !disabled,
    runOnJS: true,
    maxDistance: 8,
    maxDuration: 500,
    // Tap activates on release. A vertical scroll or a horizontal drag fails this gesture.
    onActivate: (event) => {
      if (width.current > 0 && !isOnThumb(event.x)) changeValue(min + (event.x / width.current) * (max - min));
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  return (
    <GestureDetector gesture={gesture}>
      <View
        my="$2.5"
        minH={36}
        justify="center"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        accessibilityValue={{ min, max, now: value }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (disabled) return;
          if (nativeEvent.actionName === 'increment') changeValue(value + step);
          if (nativeEvent.actionName === 'decrement') changeValue(value - step);
        }}
        onLayout={(event) => {
          width.current = event.nativeEvent.layout.width;
        }}
      >
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Slider size="$2" min={min} max={max} step={step} value={[value]} disabled={disabled}>
            <Slider.Track height={6} bg="$color5">
              <Slider.TrackActive bg="$primary" />
            </Slider.Track>
            <Slider.Thumb circular size={16} index={0} borderWidth={0} bg="$primary" />
          </Slider>
        </View>
      </View>
    </GestureDetector>
  );
}
