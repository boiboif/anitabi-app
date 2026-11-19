import { MAP_CONTROL_SIZE } from '@/lib/constants';
import { Building2 } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { Text, YStack } from 'tamagui';

type Props = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

export default function Building3DSwitch({ enabled, onChange }: Props) {
  const { t } = useTranslation();
  const label = enabled
    ? t('turnOff3DMapMode', { defaultValue: '关闭 3D 地图模式' })
    : t('turnOn3DMapMode', { defaultValue: '开启 3D 地图模式' });

  return (
    <Pressable
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      onPress={() => onChange(!enabled)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: enabled }}
    >
      <YStack
        w={MAP_CONTROL_SIZE}
        h={MAP_CONTROL_SIZE}
        rounded={MAP_CONTROL_SIZE / 2}
        bg={enabled ? 'primary' : 'background'}
        boxShadow="0 0 4px rgba(0,0,0,0.2)"
        items="center"
        justify="center"
        gap={0}
        pointerEvents="none"
      >
        <Building2 size={18} color={enabled ? 'white' : 'color-11'} />
        <Text
          maxW="100%"
          fontSize={9}
          lineHeight="11px"
          fontWeight="600"
          color={enabled ? 'white' : 'color-11'}
          text="center"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.3}
        >
          3D
        </Text>
      </YStack>
    </Pressable>
  );
}
