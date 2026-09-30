import { Children, type ReactNode } from 'react';
import { Text, View } from 'tamagui';

type SettingsSectionProps = {
  title: string;
  children: ReactNode;
  hideTitleWhenSingle?: boolean;
};

export function SettingsSection({ title, children, hideTitleWhenSingle = false }: SettingsSectionProps) {
  const showTitle = !hideTitleWhenSingle || Children.count(children) !== 1;

  return (
    <View gap="$2.5">
      {showTitle ? (
        <Text fontSize="$footnote" lineHeight={18} fontWeight="600" color="$color11" px="$1">
          {title}
        </Text>
      ) : null}
      <View bg="$backgroundHover" rounded="$4" overflow="hidden" style={{ borderCurve: 'continuous' }}>
        <View px="$3">{children}</View>
      </View>
    </View>
  );
}
