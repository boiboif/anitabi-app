# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## React Compiler

- React Compiler is enabled in `app.config.ts` (`reactCompiler: true`). Rely on its automatic memoization by default; do not add `useMemo`, `useCallback`, or `React.memo` merely to stabilize references or prevent routine re-renders.
- Use manual memoization only when it provides specific control the compiler cannot infer or a demonstrated benefit, such as a required stable effect dependency or a semantic comparison of changing inputs. Keep dependencies complete and never rely on memoization for correctness.
- Do not remove existing manual memoization as a blanket cleanup. React recommends retaining it or testing carefully when changing it, because removal can change the compiler's output. See https://react.dev/learn/react-compiler and https://react.dev/blog/2025/10/07/react-compiler-1.

## UI Implementation

- For Expo UI, prefer Tamagui primitives and props (`XStack`, `YStack`, spacing tokens, color tokens, and variants) over React Native `StyleSheet.create`.
- Before writing or modifying anything related to Tamagui, including components, configuration, themes, tokens, styling, integrations, debugging, or upgrades, consult `docs/tamagui-llms.txt` for the relevant APIs, options, concepts, and usage examples, and use it as the project-local Tamagui reference.
- Use inline styles only when a value is dynamic or cannot be expressed with Tamagui props.
- Keep mobile typography compact and preserve a clear hierarchy; do not increase font sizes without a specific design reason.
- Do not start, restart, or verify a local development server after routine UI changes unless the user explicitly requests it.

## Build and Packaging Approval

- Before running any packaging, bundling, build, prebuild, native compilation, export, or build-oriented verification command, ask the user for explicit permission and wait for their response.
- This requirement includes commands such as `expo export`, `expo prebuild`, `expo run:android`, `expo run:ios`, Gradle/Xcode builds, EAS builds, documentation/site builds, and equivalent resource-intensive validation.
- A request to implement, fix, or verify a feature does not implicitly authorize a build. Prefer lightweight checks such as linting, targeted type checking, and focused tests when they are sufficient.
- Build permission applies only to the scope and duration explicitly authorized by the user. Ask again for later builds unless the user has clearly stated that subsequent build verification is allowed.
- If the user says they will perform validation themselves, do not run build or packaging commands; report the lightweight checks completed and leave build validation to them.
