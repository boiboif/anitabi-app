import { StrictButton as Button } from '@/components/ui/strict-button';
import { ThemeSwitch } from '@/components/ui/theme-switch';
import {
  COMPARISON_BORDER_COLORS,
  COMPARISON_BORDER_WIDTH_MAX,
  normalizeComparisonExportSettings,
  resolveComparisonBorderColor,
  type ComparisonExportSettings,
} from '@/lib/comparison-export';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable } from 'react-native';
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, useTheme, View, XStack, YStack } from 'tamagui';
import { ThemeInput } from '../ui/theme-input';
import { ThemeSlider } from '../ui/theme-slider';

export type ComparisonExportSheetHandle = {
  present: (settings: ComparisonExportSettings) => Promise<void>;
  dismiss: () => Promise<void>;
};

type Props = {
  sheetRef: Ref<ComparisonExportSheetHandle>;
  onExport: (settings: ComparisonExportSettings) => void;
  onDismiss: (settings: ComparisonExportSettings) => void;
  ready: boolean;
  saving: boolean;
};

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <XStack minH={46} items="center" gap={12}>
      <Text flex={1} fontSize="$body" color="$color12">
        {label}
      </Text>
      <ThemeSwitch checked={checked} onCheckedChange={onChange} accessibilityLabel={label} hitSlop={8} />
    </XStack>
  );
}

export default function ComparisonExportSheet({ sheetRef, onExport, onDismiss, ready, saving }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const nativeSheet = useRef<TrueSheet>(null);
  const [settings, setSettings] = useState(() => normalizeComparisonExportSettings(undefined));
  const latestSettings = useRef(settings);
  const onChange = (nextSettings: ComparisonExportSettings) => {
    latestSettings.current = nextSettings;
    setSettings(nextSettings);
  };
  useImperativeHandle(sheetRef, () => ({
    present: async (nextSettings) => {
      latestSettings.current = nextSettings;
      setSettings(nextSettings);
      await nativeSheet.current?.present();
    },
    dismiss: async () => {
      await nativeSheet.current?.dismiss();
    },
  }));
  const options = [
    { field: 'showLocation' as const, label: t('comparisonExportLocation', { defaultValue: '地点' }) },
    { field: 'showWork' as const, label: t('comparisonExportWork', { defaultValue: '作品' }) },
    { field: 'showScene' as const, label: t('comparisonExportScene', { defaultValue: '场景' }) },
    { field: 'showCapturedAt' as const, label: t('comparisonExportCapturedAt', { defaultValue: '拍摄时间' }) },
    { field: 'showCoordinates' as const, label: t('comparisonExportCoordinates', { defaultValue: '坐标' }) },
  ];

  return (
    <TrueSheet
      ref={nativeSheet}
      detents={[0.6, 1]}
      scrollable
      cornerRadius={20}
      backgroundColor={theme.color2.val}
      grabberOptions={{ color: theme.primary.val, adaptive: false, topMargin: 8, width: 42, height: 5 }}
      dismissible={!saving}
      draggable={!saving}
      onDidDismiss={() => onDismiss(latestSettings.current)}
      header={
        <YStack px={16} pt={24} pb={10}>
          <Text fontSize="$subtitle" fontWeight="700" color="$color12">
            {t('comparisonExportConfiguration', { defaultValue: '导出配置' })}
          </Text>
        </YStack>
      }
      footer={
        <XStack px={16} pt={12} pb={Math.max(insets.bottom, 12)} gap={12} bg="$color2">
          <Button
            flex={1}
            bg="$color4"
            disabled={saving}
            onPress={() => {
              void nativeSheet.current?.dismiss();
            }}
          >
            {t('cancel', { defaultValue: '取消' })}
          </Button>
          <Button
            flex={1}
            bg="$primary"
            color="white"
            disabled={!ready || saving}
            disabledStyle={{ opacity: 0.42 }}
            onPress={() => onExport(latestSettings.current)}
          >
            {saving ? <ActivityIndicator color="white" /> : t('comparisonExportAction', { defaultValue: '导出' })}
          </Button>
        </XStack>
      }
    >
      <GestureHandlerRootView style={{ flexGrow: 1 }} pointerEvents={saving ? 'none' : 'auto'}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80 }}
          keyboardShouldPersistTaps="handled"
        >
          <View gap={10}>
            <View gap={10}>
              <Text color="$color10" fontSize="$caption" fontWeight="600">
                {t('comparisonExportAppearance', { defaultValue: '外观' })}
              </Text>
              <View bg="$color1" rounded={10} px={12} py={8} gap={4}>
                <XStack items="center" justify="space-between">
                  <Text color="$color12" fontSize="$body">
                    {t('comparisonExportBorderWidth', { defaultValue: '边框宽度' })}
                  </Text>
                  <Text color="$color10" fontSize="$footnote">
                    {settings.borderWidth} px
                  </Text>
                </XStack>
                <ThemeSlider
                  my="$2.5"
                  min={0}
                  max={COMPARISON_BORDER_WIDTH_MAX}
                  step={2}
                  value={[settings.borderWidth]}
                  aria-label={t('comparisonExportBorderWidth')}
                  onValueChange={(values) => onChange({ ...settings, borderWidth: values[0] ?? 0 })}
                />
                <Text color="$color12" fontSize="$body">
                  {t('comparisonExportBorderColor', { defaultValue: '边框颜色' })}
                </Text>
                <XStack gap={8} py={8}>
                  {COMPARISON_BORDER_COLORS.map((color) => {
                    const label =
                      color === 'white'
                        ? t('comparisonExportWhite', { defaultValue: '白色' })
                        : color === 'black'
                          ? t('comparisonExportBlack', { defaultValue: '黑色' })
                          : t('comparisonExportTheme', { defaultValue: '主题色' });
                    return (
                      <Pressable
                        key={color}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: settings.borderColor === color }}
                        onPress={() => onChange({ ...settings, borderColor: color })}
                      >
                        <XStack
                          minH={36}
                          px={10}
                          gap={6}
                          items="center"
                          rounded={8}
                          bg={settings.borderColor === color ? '$color4' : '$color2'}
                        >
                          <View
                            width={14}
                            height={14}
                            rounded={7}
                            bg={resolveComparisonBorderColor(color, theme.primary.val)}
                            borderWidth={1}
                            borderColor="$color6"
                          />
                          <Text color={settings.borderColor === color ? '$primary' : '$color11'} fontSize="$footnote">
                            {label}
                          </Text>
                        </XStack>
                      </Pressable>
                    );
                  })}
                </XStack>
              </View>
            </View>
            <View gap={10}>
              <Text color="$color10" fontSize="$caption" fontWeight="600">
                {t('comparisonExportMetadata', { defaultValue: '元数据' })}
              </Text>
              <View bg="$color1" rounded={10} px={12} pb={12}>
                <ToggleRow
                  label={t('comparisonExportShowName', { defaultValue: '显示巡礼者名字' })}
                  checked={settings.showName}
                  onChange={(showName) => onChange({ ...settings, showName })}
                />
                <View gap={6} pointerEvents={saving || !settings.showName ? 'none' : 'auto'}>
                  <ThemeInput
                    disabled={saving || !settings.showName}
                    multiline={false}
                    numberOfLines={1}
                    value={settings.name}
                    maxLength={40}
                    autoCorrect={false}
                    placeholder={t('enterText', { defaultValue: '请输入' })}
                    accessibilityLabel={t('comparisonExportShowName')}
                    onChangeText={(name) => onChange({ ...settings, name })}
                  />
                </View>
              </View>
            </View>
            <View gap={10}>
              <Text color="$color10" fontSize="$caption" fontWeight="600">
                {t('comparisonExportContent', { defaultValue: '显示内容' })}
              </Text>
              <View bg="$color1" rounded={10} px={12}>
                {options.map((option) => (
                  <ToggleRow
                    key={option.field}
                    label={option.label}
                    checked={settings[option.field]}
                    onChange={(checked) => onChange({ ...settings, [option.field]: checked })}
                  />
                ))}
              </View>
            </View>
          </View>
        </ScrollView>
      </GestureHandlerRootView>
    </TrueSheet>
  );
}
