import { createV5Theme, defaultChildrenThemes, defaultConfig } from '@tamagui/config/v5';
import { animations } from '@tamagui/config/v5-reanimated';
import { Platform } from 'react-native';
import { createTamagui } from 'tamagui';

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

const themes = createV5Theme({
  childrenThemes: {
    ...defaultChildrenThemes,
  },
});

const config = createTamagui({
  ...defaultConfig,
  animations,
  themes,
  tokens: {
    ...defaultConfig.tokens,
    color: {
      primary: '#FB7299',
    },
  },
});

type AppConfig = typeof config;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config;
