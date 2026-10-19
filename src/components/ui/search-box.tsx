import { ThemeInput } from '@/components/ui/theme-input';
import { Search, X } from '@tamagui/lucide-icons-2';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, TouchableWithoutFeedback, type TextInputInstance } from 'react-native';
import { getTokens, TamaguiElement, useThemeName, View } from 'tamagui';

type Props = {
  placeholder?: string;
  left?: ReactNode;
  right?: ReactNode;
  allowClear?: boolean;
  onPress?: () => void;
  /** 路由跳转后延迟 focus（与原生 autoFocus 不同，等转场动画结束后才调起键盘） */
  focusOnRoute?: boolean;
} & ComponentProps<typeof ThemeInput>;

export default function SearchBox({
  placeholder,
  left,
  right,
  allowClear = false,
  onPress,
  readOnly = false,
  focusOnRoute,
  ...props
}: Props) {
  const { t } = useTranslation();
  const themeName = useThemeName();
  const theme = themeName === 'dark' ? 'dark' : 'light';
  const ref = useRef<TamaguiElement | null>(null);
  const { onChangeText, value } = props;

  const hasValue = typeof value === 'string' && value.length > 0;
  const showClear = allowClear && hasValue && !right;

  const handleClear = useCallback(() => {
    onChangeText?.('');
    Keyboard.dismiss();
  }, [onChangeText]);

  useFocusEffect(
    useCallback(() => {
      if (!focusOnRoute) return;
      const timer = setTimeout(() => {
        // Tamagui 2's native ref type still names View; StyledInput supplies the focusable instance.
        const input = ref.current as Pick<TextInputInstance, 'focus'> | null;
        input?.focus();
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

          <ThemeInput
            placeholder={placeholder ?? t('cityWorkOrLocation', { defaultValue: '城市、作品、地标' })}
            readOnly={readOnly}
            ref={ref}
            style={right || showClear ? { paddingRight: 40 } : undefined}
            rounded={28}
            paddingInlineStart={40}
            height={44}
            fontSize="$subtitle"
            borderColor="$color4"
            bg="transparent"
            {...props}
          />

          {right ? (
            <View
              style={{
                position: 'absolute',
                right: 16,
                top: '50%',
                transform: [{ translateY: '-50%' }],
                zIndex: 999,
              }}
            >
              {right}
            </View>
          ) : showClear ? (
            <View
              style={{
                position: 'absolute',
                right: 16,
                top: '50%',
                transform: [{ translateY: '-50%' }],
                zIndex: 999,
              }}
            >
              <Pressable onPress={handleClear} hitSlop={8}>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: 'rgba(128, 128, 128, 0.6)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={12} color="white" strokeWidth={3} />
                </View>
              </Pressable>
            </View>
          ) : null}
        </BlurView>
      </View>
    </TouchableWithoutFeedback>
  );
}
