# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.

Some official Expo skills still describe SDK 57 APIs. When they conflict with SDK 58 documentation, follow the versioned documentation; see `docs/development/expo-sdk-58-migration.md` for known differences.

## Fixes, History, and Design Intent

- Before fixing a problem, inspect the affected flow and relevant Git history (`git log`, `git blame`, and targeted commit diffs), along with nearby comments and documentation. Scale the investigation to the issue; for regressions, compare the previously working behavior with the change that introduced the problem.
- Understand why the old behavior existed and which requirements or prior fixes it protected. Distinguish evidence from inference; do not assume every historical implementation is still correct or every recent change was intentional.
- Evaluate the whole affected flow, including state ownership, lifecycle, persistence, callers, and user-visible behavior. Check whether the proposed fix would undermine another requirement or reintroduce a previously solved problem.
- Prefer the smallest coherent fix that addresses the cause and preserves established semantics. Compare restoring the intended behavior with adding compensating logic; avoid adding state, asynchronous recovery, or special cases merely to mask an unintended change.
- If a tradeoff materially changes behavior or depends on unclear product intent, explain it before making that change. Do not use routine implementation decisions as a reason to request unnecessary confirmation.
- Report the historical cause when established, why the chosen fix fits the current design, relevant tradeoffs, and what validation does and does not prove. If history does not establish a cause, say so rather than inventing one.
- Treat an unexplained recent change as unresolved intent, not proof that it is unnecessary. Before reverting it, check available conversation context and performance constraints as well as Git; ask for the missing reason if reverting could undo a material fix. For the comparison camera, keep the camera stopped while the result modal is visible because running it causes the result page's bottom-sheet animation to drop frames; preserve retake zoom separately.

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

## Third-Party Patch Approval

- Before performing any operation that creates, modifies, deletes, regenerates, or applies a patch to a third-party library, obtain the user's explicit approval and wait for their response.
- This requirement also covers directly editing third-party source code in `node_modules` or vendored dependencies, and running commands or scripts that perform these operations.
- A general request to implement, fix, upgrade, or verify something does not implicitly authorize third-party patching. Approval applies only to the explicitly authorized scope; obtain approval again before expanding that scope.

## Build and Packaging Approval

- Before running any packaging, bundling, build, prebuild, native compilation, export, or build-oriented verification command, ask the user for explicit permission and wait for their response.
- This requirement includes commands such as `expo export`, `expo prebuild`, `expo run:android`, `expo run:ios`, Gradle/Xcode builds, EAS builds, documentation/site builds, and equivalent resource-intensive validation.
- A request to implement, fix, or verify a feature does not implicitly authorize a build. Prefer lightweight checks such as linting, targeted type checking, and focused tests when they are sufficient.
- Build permission applies only to the scope and duration explicitly authorized by the user. Ask again for later builds unless the user has clearly stated that subsequent build verification is allowed.
- If the user says they will perform validation themselves, do not run build or packaging commands; report the lightweight checks completed and leave build validation to them.
