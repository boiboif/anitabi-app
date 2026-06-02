import { useThemeOverride } from '@/lib/theme-context';
import { Search } from '@tamagui/lucide-icons-2';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { getTokens, Input, styled, TamaguiElement, View } from 'tamagui';

const StyledInput = styled(Input, {
  rounded: 28,
  paddingInlineStart: 40,
  height: 44,
  fontSize: 16,
  borderColor: '$color6',
  borderWidth: StyleSheet.hairlineWidth * 2,
  focusStyle: {
    borderColor: '$primary',
  },
  cursorColor: '$primary',
  bg: 'transparent',
});

type Props = {
  placeholder?: string;
  left?: ReactNode;
  onPress?: () => void;
  /** 路由跳转后延迟 focus（与原生 autoFocus 不同，等转场动画结束后才调起键盘） */
  focusOnRoute?: boolean;
} & ComponentProps<typeof StyledInput>;

export default function SearchBox({
  placeholder = '城市、作品、地标',
  left,
  onPress,
  readOnly = false,
  focusOnRoute,
  ...props
}: Props) {
  const { theme } = useThemeOverride();
  const ref = useRef<TamaguiElement | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!focusOnRoute) return;
      const timer = setTimeout(() => {
        ref.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }, [focusOnRoute]),
  );

  return (
    <TouchableWithoutFeedback onPress={onPress}>
      <View rounded="$9">
        <BlurView
          intensity={100}
          tint={theme}
          style={{
            borderRadius: getTokens().radius['9'].val,
            overflow: 'hidden',
            boxShadow: '0 0 4px 0 rgba(0, 0, 0, 0.1)',
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: [{ translateY: '-50%' }],
              zIndex: 999,
            }}
          >
            {left ?? <Search size={18} color="$primary" strokeWidth={3} />}
          </View>

          <StyledInput
            placeholder={placeholder}
            placeholderTextColor="$color9"
            readOnly={readOnly}
            ref={ref}
            {...props}
          />
        </BlurView>
      </View>
    </TouchableWithoutFeedback>
  );
}
