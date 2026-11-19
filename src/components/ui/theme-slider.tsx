import type { ComponentProps } from 'react';
import { Platform } from 'react-native';
import { GestureDetector, useNativeGesture } from 'react-native-gesture-handler';
import { Slider } from 'tamagui/slider';

type Props = Omit<ComponentProps<typeof Slider>, 'children'> & {
  trackColor?: ComponentProps<typeof Slider.Track>['backgroundColor'];
  activeColor?: ComponentProps<typeof Slider.TrackActive>['backgroundColor'];
};

export function ThemeSlider({ trackColor = 'color-5', activeColor = 'primary', ...props }: Props) {
  const sliderGesture = useNativeGesture({
    enabled: Platform.OS === 'android' && !props.disabled,
    shouldActivateOnStart: true,
    disallowInterruption: true,
    shouldCancelWhenOutside: false,
    hitSlop: { vertical: 20 },
    // Tamagui's Slider uses React Native's JS responder to update its value.
    // Protect that touch stream from native sheet interception without cancelling the slider itself.
    cancelsJSResponder: false,
  });
  return (
    <GestureDetector gesture={sliderGesture}>
      <Slider size="xs" h={5} {...props}>
        <Slider.Track hitSlop={24} h={6} backgroundColor={trackColor}>
          <Slider.TrackActive backgroundColor={activeColor} />
        </Slider.Track>
        <Slider.Thumb hitSlop={24} circular size="xs" borderWidth={0} bg="primary" index={0} />
      </Slider>
    </GestureDetector>
  );
}
