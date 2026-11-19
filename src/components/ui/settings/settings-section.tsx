import { Children, type ReactNode } from 'react';
import { Text, View } from 'tamagui';

type SettingsSectionProps = {
  title?: string;
  children: ReactNode;
  hideTitleWhenSingle?: boolean;
};

export function SettingsSection({ title, children, hideTitleWhenSingle = false }: SettingsSectionProps) {
  const showTitle = title && (!hideTitleWhenSingle || Children.count(children) !== 1);

  return (
    <View gap="2-5">
      {showTitle ? (
        <Text fontSize="footnote" lineHeight="18px" fontWeight="600" color="color-11" px="0-5">
          {title}
        </Text>
      ) : null}
      <View bg="background" rounded={9} overflow="hidden" style={{ borderCurve: 'continuous' }}>
        <View px="13px">{children}</View>
      </View>
    </View>
  );
}
