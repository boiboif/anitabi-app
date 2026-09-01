# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## UI Implementation

- For Expo UI, prefer Tamagui primitives and props (`XStack`, `YStack`, spacing tokens, color tokens, and variants) over React Native `StyleSheet.create`.
- Before writing or modifying anything related to Tamagui, including components, configuration, themes, tokens, styling, integrations, debugging, or upgrades, consult `docs/tamagui-llms.txt` for the relevant APIs, options, concepts, and usage examples, and use it as the project-local Tamagui reference.
- Use inline styles only when a value is dynamic or cannot be expressed with Tamagui props.
- Keep mobile typography compact and preserve a clear hierarchy; do not increase font sizes without a specific design reason.
- Do not start, restart, or verify a local development server after routine UI changes unless the user explicitly requests it.
