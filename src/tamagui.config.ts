import { createV5Theme, defaultChildrenThemes, defaultConfig } from '@tamagui/config/v5';
import { animations } from '@tamagui/config/v5-reanimated';
import { Platform } from 'react-native';
import { createFont, createTamagui } from 'tamagui';

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

// Keep this scale intentionally small; reuse a semantic role before adding another size.
const semanticFontSizes = {
  caption: 10,
  footnote: 12,
  body: 14,
  subtitle: 16,
  title: 18,
  heading: 22,
} as const;

const semanticBodyLineHeights = {
  caption: 15,
  footnote: 17,
  body: 19,
  subtitle: 21,
  title: 23,
  heading: 27,
} as const;

const semanticHeadingLineHeights = {
  caption: 12,
  footnote: 14,
  body: 17,
  subtitle: 19,
  title: 22,
  heading: 26,
} as const;

const bodyFont = createFont({
  ...defaultConfig.fonts.body,
  size: {
    ...defaultConfig.fonts.body.size,
    ...semanticFontSizes,
  },
  lineHeight: {
    ...defaultConfig.fonts.body.lineHeight,
    ...semanticBodyLineHeights,
  },
});

const headingFont = createFont({
  ...defaultConfig.fonts.heading,
  size: {
    ...defaultConfig.fonts.heading.size,
    ...semanticFontSizes,
  },
  lineHeight: {
    ...defaultConfig.fonts.heading.lineHeight,
    ...semanticHeadingLineHeights,
  },
});

const themes = createV5Theme({
  childrenThemes: {
    ...defaultChildrenThemes,
  },
});

const config = createTamagui({
  ...defaultConfig,
  animations,
  themes,
  fonts: {
    ...defaultConfig.fonts,
    body: bodyFont,
    heading: headingFont,
  },
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
