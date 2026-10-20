import { StrictButton as Button } from '@/components/ui/strict-button';
import { MAP_CONTROL_SIZE } from '@/lib/constants';
import { Building2 } from '@tamagui/lucide-icons-2';
import { useTranslation } from 'react-i18next';
import { Text, useTheme, YStack } from 'tamagui';

type Props = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

export default function Building3DSwitch({ enabled, onChange }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const label = enabled
    ? t('turnOff3DMapMode', { defaultValue: '关闭 3D 地图模式' })
    : t('turnOn3DMapMode', { defaultValue: '开启 3D 地图模式' });

  return (
    <Button
      circular
      width={MAP_CONTROL_SIZE}
      height={MAP_CONTROL_SIZE}
      p="$0"
      style={{ backgroundColor: enabled ? theme.primary.val : theme.background.val }}
      borderWidth={0}
      boxShadow="0 0 4px rgba(0,0,0,0.2)"
      onPress={() => onChange(!enabled)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: enabled }}
    >
      <YStack items="center" gap={-2} pointerEvents="none">
        <Building2 size={18} color={enabled ? 'white' : '$color11'} />
        <Text fontSize={9} lineHeight={11} fontWeight="600" color={enabled ? 'white' : '$color11'}>
          3D
        </Text>
      </YStack>
    </Button>
  );
}
