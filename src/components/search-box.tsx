import { useThemeOverride } from '@/lib/theme-context';
import { Search } from '@tamagui/lucide-icons-2';
import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { getTokens, Input, styled, View } from 'tamagui';

const StyledInput = styled(Input, {
  rounded: 28,
  paddingInlineStart: 40,
  height: 44,
  fontSize: 16,
  borderColor: '$color4',
  focusStyle: {
    borderColor: '$primary',
  },
  cursorColor: '$primary',
  bg: 'transparent',
});

type Props = {
  insets: EdgeInsets;
  placeholder?: string;
  left?: ReactNode;
};

export default function SearchBox({ insets, placeholder = '城市、作品、地标', left }: Props) {
  const { theme } = useThemeOverride();

  return (
    <View p="$1.5" z={10} rounded="$9" position="absolute" t={insets.top + 16} l="$2.5" r="$2.5">
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

        <StyledInput placeholder={placeholder} placeholderTextColor="$color9" />
      </BlurView>
    </View>
  );
}
