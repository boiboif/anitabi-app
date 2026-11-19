import { animations } from '@tamagui/config/animations-reanimated';
import { colors, createV6Config, toV6Themes } from '@tamagui/config/v6';
import { themes as classicThemes } from '@tamagui/themes/v5';
import { Platform } from 'react-native';
import { createFont, createTamagui } from 'tamagui';

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const TopLevelPageTopPadding = Platform.select({ ios: 36, default: 8 }) ?? 8;
export const MaxContentWidth = 800;
export const PageHorizontalInset = 12;
export const PrimaryColor = '#FB7299';
// Shared with native navigation so headers and scene backgrounds match the page canvas.
export const PageBackground = {
  light: '#F7F7F7',
  dark: '#101010',
} as const;

const convertedThemes = toV6Themes(classicThemes);
const defaultConfig = createV6Config({
  themes: {
    ...convertedThemes,
    light: {
      ...convertedThemes.light,
      pageBackground: PageBackground.light,
      background: '#FFFFFF',
      tabBarIndicator: '#FCE8EE',
    },
    dark: {
      ...convertedThemes.dark,
      pageBackground: PageBackground.dark,
      background: '#1C1C1C',
      'background-hover': '#242424',
      'background-press': '#2A2A2A',
      'background-focus': '#242424',
      tabBarIndicator: '#492834',
    },
  },
  colorTokens: { ...colors.colorTokens, primary: PrimaryColor },
});

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

const config = createTamagui({
  ...defaultConfig,
  animations,
  fonts: {
    ...defaultConfig.fonts,
    body: bodyFont,
    heading: headingFont,
  },
  tokens: {
    ...defaultConfig.tokens,
    space: {
      ...defaultConfig.tokens.space,
      pageHorizontalInset: PageHorizontalInset,
    },
  },
});

type AppConfig = typeof config;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config;
