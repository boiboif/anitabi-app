import { StrictButton as Button } from '@/components/strict-button';
import { Building2 } from '@tamagui/lucide-icons-2';
import { useTranslation } from 'react-i18next';
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
    <Button
      circular
      width={44}
      height={44}
      p="$0"
      bg={enabled ? '$primary' : '$color1'}
      borderWidth={0}
      boxShadow="0 0 4px rgba(0,0,0,0.2)"
      onPress={() => onChange(!enabled)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: enabled }}
    >
      <YStack items="center" gap={-2} pointerEvents="none">
        <Building2 size={20} color={enabled ? 'white' : '$color11'} />
        <Text fontSize={9} lineHeight={11} fontWeight="600" color={enabled ? 'white' : '$color11'}>
          3D
        </Text>
      </YStack>
    </Button>
  );
}
