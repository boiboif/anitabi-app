import { MAP_CONTROL_SIZE } from '@/lib/constants';
import { MAP_STYLES } from '@/lib/map-styles';
import { Layers } from '@tamagui/lucide-icons-2';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';
import { Text, useTheme, YStack } from 'tamagui';

type Props = {
  styleIndex: number;
  onChange: (index: number) => void;
};

export default function LayerSwitch({ styleIndex, onChange }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [styles.button, { backgroundColor: theme.background.val, opacity: pressed ? 0.7 : 1 }]}
      onPress={() => onChange((styleIndex + 1) % MAP_STYLES.length)}
    >
      <YStack width="100%" items="center" justify="center" gap={0} pointerEvents="none">
        <Layers size={18} color="$color11" />
        <Text
          maxW="100%"
          fontSize={9}
          lineHeight={11}
          fontWeight="600"
          color="$color11"
          text="center"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.3}
        >
          {t(MAP_STYLES[styleIndex].label.key, { defaultValue: MAP_STYLES[styleIndex].label.defaultValue })}
        </Text>
      </YStack>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: MAP_CONTROL_SIZE,
    height: MAP_CONTROL_SIZE,
    borderRadius: MAP_CONTROL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 4px 0 rgba(0, 0, 0, 0.2)',
  },
});
