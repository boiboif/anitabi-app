import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { Text, View } from 'tamagui';


type HintRowProps = {
  title?: string;
  hint?: ReactNode;
};

export function HintRow({ title = 'Try editing', hint = 'app/index.tsx' }: HintRowProps) {
  return (
    <View style={styles.stepRow}>
      <Text fontSize={14} lineHeight={20} fontWeight="500">{title}</Text>
      <View bg="$color4" style={styles.codeSnippet}>
        <Text color="$color11">{hint}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  codeSnippet: {
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
});
