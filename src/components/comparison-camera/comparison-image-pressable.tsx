import { Pressable, type PressableProps } from 'react-native';

// Keep reference images and the result photo on the result page's original press feedback.
export function ComparisonImagePressable({ style, ...props }: PressableProps) {
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={(state) => [typeof style === 'function' ? style(state) : style, { opacity: state.pressed ? 0.82 : 1 }]}
    />
  );
}
