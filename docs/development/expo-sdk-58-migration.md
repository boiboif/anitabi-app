# Expo SDK 58 迁移记录

迁移日期：2026-10-16。分支：`expo-sdk-58`，基于 `6739d50`，保留迁移前的多语言依赖更新。

## 版本与依据

按 [Expo SDK 58 发布说明](https://expo.dev/changelog/sdk-58)、[版本文档](https://docs.expo.dev/versions/v58.0.0/) 和 `expo@58.0.12/bundledNativeModules.json` 对齐依赖：

| 依赖                    | 迁移后版本       |
| ----------------------- | ---------------- |
| Expo                    | 58.0.12          |
| React / React Native    | 19.3.0 / 0.88.0  |
| Expo Router             | 58.0.21          |
| Reanimated / Worklets   | 4.7.1 / 0.13.0   |
| Gesture Handler         | 3.3.0            |
| Sentry React Native     | 8.28.0           |
| i18next / react-i18next | 26.4.7 / 17.0.19 |

其余 Expo 包使用 SDK 58 推荐范围，具体锁定版本见 `yarn.lock`。Gesture Handler、SVG、view-shot 已恢复官方版本检查；FlashList 保持已有的 2.3.3（官方推荐 2.3.2），继续作为唯一 `expo.install.exclude` 项。

将 Router 的 `@expo/log-box` / `@expo/metro-runtime`、LogBox 的 `@expo/dom-webview`、FlashList 的 `@babel/runtime` 和 Worklets 的 `@babel/core` / `@react-native/metro-config` 必需 peer 显式声明，避免只依赖传递安装。

Node 使用 Expo 58 支持的版本，例如 22.13+（22.x）或 24.3+（24.x）。项目仍使用 CNG，原生工程不纳入 Git。迁移最初所在的 worktree 没有 `android/`、`ios/`；切回主工作目录后，该目录保留了 SDK 57 生成的 `android/`，需在下次原生构建前重新生成对应 SDK 58 的工程。

## 代码适配

- [FileSystem](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/) 的 `File.write()` 改为异步。备份、计划分享和地图缓存使用 `writeSync()`，保留“写完后再分享/提交缓存”和同步异常处理。图片格式探测改用 `readBytesSync()`，仍只读取文件头。已有异步复制继续 `await`；`File.md5` 虽已弃用但尚可用，保留原有同步缓存指纹流程。
- 按 [Router 57 → 58 指南](https://docs.expo.dev/router/migrate/sdk-57-to-58/) 从 `expo-router` 导入 `useIsFocused`、`usePreventRemove`。批量添加页第一次返回仍先退出作品内点位列表，再次返回才离开页面。
- 三处 Stack 显式设置 `headerTransparent: false`，保留原有内容起点，避免 SDK 58 的 iOS 默认透明标题栏改变页面布局。
- 按 [React Native 严格 TypeScript API](https://reactnative.dev/docs/strict-typescript-api) 使用实例类型或 `ComponentRef<typeof Component>` 标注原生 ref，保留原有测量和滚动调用，不关闭严格 API 检查。
- Tamagui 保持 2.7.7，其 ref 声明仍以 RN 的旧组件类型代替实例；在测量、输入聚焦的调用边界限定所需能力，未混入 Tamagui 3 迁移。图片触发器共用 ref 回调，样式原样传递，仅在 Tamagui 2 的类型边界适配；避免 `StyleSheet.flatten` 与 Expo 生成的 Web 类型扩展发生冲突。列表空 Footer 改为 `undefined`。
- 媒体库新函数签名遗漏 `accessPrivileges` 扩展字段，使用属性窄化保留 iOS 原有的完整读取授权判断及仅写入降级流程。AppState 初始值允许为空，去掉过窄注解，保留后台恢复逻辑。
- 保留 React Compiler、现有 Babel 生产环境 console 移除、Sentry Metro 配置和 `inlineRequires`。应用环境继续使用 `APP_VARIANT` / `EXPO_UPDATE_CHANNEL`，不依赖现在由 CLI 设置的 `NODE_ENV` 区分测试与生产。

## Windows Android 原生编译路径

首次在 Windows 构建 SDK 58 时，`:app:buildCMakeDebug[arm64-v8a]` 因 `RNGestureHandlerDetectorShadowNode.cpp.o` 的路径过长失败。生成的目标相对路径为 271 字符，完整路径为 336 字符。SDK 58 的 Expo Gradle 插件通过 [上游变更 #47791](https://github.com/expo/expo/pull/47791) 将 `CMAKE_OBJECT_PATH_MAX` 默认设为 `1024`，本机构建缓存也确认了该值；但 Android SDK CMake 3.22.1 附带的 Ninja 在该路径上仍报 260 字符限制。

新增 `with-android-cmake-path-limit` 配置插件，在 Windows 主机的 app CMake 参数中设置 `-DCMAKE_OBJECT_PATH_MAX=240`。Expo 插件明确支持由模块参数覆盖其默认值。按 [CMake 官方说明](https://cmake.org/cmake/help/v3.22/variable/CMAKE_OBJECT_PATH_MAX.html)，该参数会让 CMake 对过长的目标文件路径使用哈希缩短；其他主机保留默认参数。配置由 prebuild 注入，不修改 `node_modules` 或全局 Android 工具链。

重新执行 `yarn android` 时，现有脚本会先运行 prebuild，再编译；新 CMake 参数会改变构建配置。插件的重复应用、已有原生配置保留及签名插件组合均已通过独立检查，仍需实际重跑构建确认。日志中的跨 C:/D: 硬链接失败已回退到文件复制，不是本次中断原因。

## Android 测试/预览版本号与语言配置

[Android Test Build #38895433646](https://github.com/boiboif/anitabi-app/actions/runs/38895433646/job/116954662144) 使用提交 `85ff991`，在 `Generate Android project` 阶段失败，尚未进入 APK 编译。`expo-localization@58.0.4` 的 `setResourceConfigurations()` 只匹配数字和点组成的 `versionName`，无法处理工作流原有的 `0.7.0-test.35.1`；`0.7.0-preview.1` 同样会失败。该正则由 SDK 58 的[防重复配置变更 #48092](https://github.com/expo/expo/pull/48092) 引入。

按项目决定，不给依赖打补丁。测试、Android 发布、双端发布工作流统一将基础 `appVersion` 写入 `APP_NATIVE_VERSION`（当前为 `0.7.0`），热更新工作流也使用同一基础版本。测试包名称/包名、Release 标签、产物名称、发布清单的 `displayVersion` 和递增构建号保留各自的区分信息；`runtimeVersion` 的 `-sdk58` 兼容标识保留。

`expo-localization` 保持官方 58.0.4，保留其 `zh-Hans` 同时包含 `zh-rCN` 资源的修复。基础版本号可通过原插件的资源配置转换；完整 prebuild 与远程 APK 构建仍待重新运行确认。

## Android Release 二维码识别与 R8（2026-10-20）

同一台 Android 16 手机、同一张巡礼计划二维码图片：v0.7.0 正式包可从相册导入，SDK 58 的 Release 测试包报 `MLKit is not available on this device. Barcode scanning requires Google Play Services.`。设备已安装并启用 Google Play 商店和服务。

两份设备日志的差异是：旧包成功选择本地 `com.google.mlkit.dynamite.barcode` 模型；新包在冷启动时发现三个注册器缺少无参构造方法：

- `com.google.mlkit.common.internal.CommonComponentRegistrar`
- `com.google.mlkit.vision.barcode.internal.BarcodeRegistrar`
- `com.google.mlkit.vision.common.internal.VisionCommonRegistrar`

`ComponentDiscovery` 抛出 `NoSuchMethodException: <init> []` 后，实时 `BarcodeAnalyzer` 初始化也失败。`expo-camera` 的相册入口将初始化等多种异常统一转换成上述 Google 服务提示，不能仅凭弹窗判断服务是否缺失。

已对比 v0.7.0 锁定的 `expo-camera 57.0.6` 与当前 `58.0.11`：图片识别方法、扫码可用性检查和 bundled barcode-scanning 17.3.0 一致。直接读取设备上两份 APK 的全部 DEX，确认旧包三个注册器均有 public 无参构造方法，新包的三个类仍存在但构造方法已全部移除，与运行日志直接对应。

SDK 迁移的 AGP 从 8.12.0 升至 9.2.1。[AGP 9.0 变更说明](https://developer.android.com/build/releases/agp-9-0-0-release-notes)明确记录 `android.r8.strictFullModeForKeepRules` 默认改为 `true`，`-keep class A` 不再隐式保留默认构造方法。ML Kit 传递依赖的 `firebase-components 16.1.0` 恰好只有保留注册器类的旧规则；[Firebase 官方修复 #6044](https://github.com/firebase/firebase-android-sdk/pull/6044) 已补齐显式无参构造方法。[R8 官方说明](https://developer.android.com/topic/performance/app-optimization/full-mode#retain-the-default-constructor)也要求为这类反射实例化保留默认构造方法。

在 `app.config.ts` 的 `expo-build-properties.android.extraProguardRules` 中补充 Firebase 官方的两条规则，随 prebuild 写入项目自己的 `proguard-rules.pro`，继续启用 Release 混淆与资源压缩。规则仅保护组件注册器及其无参构造方法，不修改依赖源码。

修复包待重新构建并在同机验收：冷启动不再出现上述注册器错误、相机实时扫描可用、同一张图片可从相册导入。静态检查不能代替 Release 包复测；本次原生规则变更不能通过 OTA 生效。v0.8.0 正式发布继续暂停。

## 开发期警告跟踪（2026-10-16）

以下是 SDK 58 迁移后设备调试与 Metro 重载时发现的问题。上游版本结论以 2026-10-16 的核对结果为准；“代码已修复”不代表已经完成设备回归。

| 问题                                     | 来源                              | 当前处理与状态                                                           |
| ---------------------------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| 渲染期间调用 `navigation.isFocused()`    | 地图作品详情弹层                  | 项目代码已修复，保留事件回调的即时焦点检查；待设备回归                   |
| Reanimated 原生端忽略依赖数组            | 拖拽列表、卡片轮播                | 已删除项目内三处无效参数；待拖拽和滑动回归                               |
| 同一条 Reanimated 警告来自图片缩放       | `react-native-zoom-toolkit@5.1.1` | 官方最新版仍有旧写法，保留警告，等待上游修复                             |
| `router-store.js` 不存在，Metro 回退解析 | `@sentry/react-native@8.28.0`     | 已停用默认 `ExpoRouter` 运行时集成，静态解析警告仍可能出现，等待上游修复 |

项目决定：不为这些依赖添加补丁，不全局屏蔽警告，不通过降级 Expo 配套依赖或关闭 package exports 校验隐藏问题。未来升级前重新核对官方发布版本及具体修复。

### 渲染期间读取导航焦点

警告原文：

```text
navigation.isFocused() was called while rendering the screen 'index'. During render it can return a stale value, because focus state is updated after render. Use the useIsFocused() hook to read focus during render.
```

触发点为 [`bangumi-detail-sheet.tsx`](../../src/components/map/bangumi-detail-sheet.tsx) 的会话创建条件。此前弹层生命周期修复同时检查 `useIsFocused()` 和 `navigation.isFocused()`；SDK 58 下，后者在渲染期间可能仍读取上一次已提交的导航状态。

渲染条件现仅使用已有的 `useIsFocused()` 结果，事件回调仍保留 `navigation.isFocused()`，用于处理原生弹层事件到达时页面已经失焦的情况。未改变会话隔离、关闭动画完成后释放内容、返回页面恢复详情等语义。

现有 [`bangumi-detail-sheet-lifecycle.test.mjs`](../../scripts/tests/bangumi-detail-sheet-lifecycle.test.mjs) 增加“返回页面时渲染焦点先更新”和“原生打开回调到达前已失焦”两种场景，共 14/14 通过。设备上仍需验证：首页选择作品、进入其他页面再返回、快速关闭/重开、原生返回和跨页切换。

### Reanimated 原生动画依赖数组

警告原文：

```text
[Reanimated] Dependencies should only be used on the web and are always ignored on native. Check DevTools to see the offending code.
```

Reanimated 4.7.1 原生实现通过 Worklet 闭包跟踪依赖，显式数组会被忽略并触发开发期警告。[官方 `useAnimatedStyle` 文档](https://docs.swmansion.com/react-native-reanimated/docs/core/useAnimatedStyle/#dependencies) 说明该参数仅与未启用 Worklets Babel 插件的 Web 用法有关。

已移除 [`stable-reorderable-list.tsx`](../../src/components/ui/stable-reorderable-list.tsx) 中行透明度、插入位置指示器的两个数组，以及 [`swipeable-card-carousel.tsx`](../../src/components/ui/swipeable-card-carousel.tsx) 中页面位置样式的一个数组。保留动画计算、SharedValue、已有 React memoization、列表行身份与手势状态。全量 TypeScript 检查和相关文件 ESLint 检查通过；设备上需复测长按排序、边缘自动滚动、插入指示器、轮播左右滑动和只有两个卡片的往返切换。

图片预览仍可能报告同一警告，调用栈来自 Zoom Toolkit 的 `ResumableZoom` 内部 `useDerivedValue` / `useAnimatedStyle`。已安装的 **5.1.1** 在核对时也是 npm 最新版；其[官方源码](https://github.com/Glazzes/react-native-zoom-toolkit/blob/a1abef731056af6323ef94d6b387d87bb6f3e534/src/components/resumable/ResumableZoom.tsx)仍传入这些依赖数组，不能靠升级当前发布版消除。该警告本身不说明缩放失效。

按用户确认保持不打补丁，不修改 `node_modules` 或替换已使用的缩放实现。待官方修复版发布后再升级，确认原生端不再传入无效数组，并复测图片捏合、拖动、双击缩放、复位与关闭预览。

## Sentry 导航计时限制与 Metro 解析警告

警告中的关键内容：

```text
The package .../node_modules/expo-router contains an invalid package.json configuration.
.../expo-router/build/global-state/router-store.js ... this file does not exist.
Falling back to file-based resolution.
```

SDK 58 移除了旧导航容器接口与 `__unsafe_action__`。核对 `@sentry/react-native@8.28.0` 和当时最新稳定版 8.31.0 后，`expoRouterIntegration()` 仍依赖已不存在的 `expo-router/build/global-state/router-store`，无法恢复原有自动导航计时。此次移除旧导航 integration 和容器注册，并通过 `integrations` 回调过滤 Sentry 默认自动添加的 `ExpoRouter` 集成，保留其他默认集成、Sentry 初始化、JS 异常、原生崩溃配置、根组件包装、0.2 采样率与 `sendDefaultPii: false`。

这项过滤仅停用运行时集成。Sentry 的导出入口仍静态引用旧 `router-store` 路径，Metro 在解析依赖图时仍可能报告 `invalid package.json configuration` / `Falling back to file-based resolution`；其 `require` 位于 `try/catch` 中，Expo Metro 允许缺失的可选依赖，因此这条警告本身不代表安装损坏，也不等于构建失败。未关闭 package exports 校验、屏蔽日志或添加依赖补丁，待 Sentry 官方修复后移除过滤并恢复导航计时。

解析链为 Sentry 主入口 → tracing 导出入口 → Expo Router 集成/错误边界 → `expoRouterStore` → 已删除的 Router 内部路径。2026-10-16 核对的 [Sentry 8.31.0 官方源码](https://github.com/getsentry/sentry-react-native/blob/8.31.0/packages/core/src/js/tracing/expoRouterStore.ts#L50-L59)仍保留此引用，单独升级到该版本或重装当前依赖不能解决。运行时过滤已通过 TypeScript 和相关 ESLint 检查；未重新打包验证，不将检查通过表述为 Metro 警告已消失。

因此导航 transaction / 页面首次显示时间（TTID）暂时缺失。SDK 58 的 [性能观察 API](https://docs.expo.dev/router/reference/screen-tracking/) 不能直接替代这套原生计时；待 Sentry 正式适配后恢复，并验证导航事件只记录一次。未添加自制 tracing 或依赖私有路由接口的补丁。

## TrueSheet iOS 兼容性待验收

TrueSheet 保持稳定版 3.11.18。上游 [PR #896](https://github.com/lodev09/react-native-true-sheet/pull/896) 已确认 RN 0.88 的视图复用会重置隐藏状态，引发重开弹层后背景遮挡；当前 3.x 稳定版尚未包含修复。本项目 `bangumi-detail-sheet.tsx` 按会话挂卸载并设置背景，存在相同触发条件，但尚未在本项目设备上复现。

优先验证首页详情打开、关闭、重开同作品或其他作品、跳转后返回地图，以及底层地图显示和触摸。保持之前暂缓 v4 beta 的决定，不自动引入 beta 或原生补丁。该风险未验证前不能认定 iOS 已可发布。

## OTA 与原生包

应用基础版本仍为 `0.7.0`，runtime 改为 `0.7.0-sdk58`。旧 SDK 57 原生包的 runtime 是 `0.7.0`，不会收到新 SDK 的更新。Preview 展示后缀不参与 runtime。

必须先生成并验证 SDK 58 的开发客户端及发布包，再发布该 runtime 的 OTA。现有热更新工作流仅检查应用基础版本，不能证明服务器已有同 runtime 的原生包。发布流程见 [发版与更新](../releases/README.md)。

## Skills

对照 [Expo 官方 skills 仓库 `927dd7cc`](https://github.com/expo/skills/tree/927dd7cc2088ec2f0c73589fe2e94c3c973afc45) 核对现有 20 个 Expo/EAS skills，仅 `eas-observe` 从 1.1.0 更新为 1.2.0，并同步参考文档和 `skills-lock.json`。其余 19 个已与该官方版本一致。

官方 `expo-upgrade` 仍为 1.0.0，部分内容以 SDK 57 为背景；此次以 SDK 58 正式文档为准，不人为修改上游技能版本，也未因此给应用启用 Observe。

现有技能中的同步 `File.write()` 示例、`expo-router/react-navigation` 导入、`unstable-native-tabs` 入口和平台列表不支持虚拟化的概括均需结合 SDK 58 文档重新判断。`AGENTS.md` 已明确版本文档优先，避免后续照搬过时示例。

## 验证与设备回归

迁移初次适配的检查记录（警告修复后的增量验证见上文）：

- `yarn expo install --check`：通过，保留上述 FlashList 例外。
- `npx expo-doctor@latest`：20/20 通过。
- `yarn tsc --noEmit`：通过。
- `yarn lint`：0 错误，保留 `request.ts` 的 Axios 导入警告和 `tamagui.config.ts` 的空接口警告。
- 全部 `scripts/tests/*.test.mjs`：205/205 通过。
- 加载实际 i18n 初始化、Zustand 语言偏好和三份翻译资源，仅替换原生 Localization/MMKV 接口：语言切换、插值、回退、偏好写入及 React 19.3 的 `useTranslation` SSR 冒烟检查通过。未覆盖真机原生语言事件与真实 MMKV 持久化。
- `yarn icons:check`：10 个生成图标均匹配；依赖完整性检查通过。
- Expo public config 和 Metro 配置可加载；开发/测试变体禁用更新，Preview 展示后缀不改变 `0.7.0-sdk58` runtime。

迁移初次安装使用 `--ignore-scripts`；随后在主工作目录删除 `node_modules` 后，按用户要求执行了正常生命周期的 `yarn install --frozen-lockfile`，安装及 `yarn check --integrity` 均通过。迁移过程中未由代理执行 prebuild、打包、export、原生编译或发布；这些操作需按项目约定另行获得明确授权。上述检查不证明原生渲染、相机、动画或设备升级已通过。

使用新原生客户端回归：

- 中/英/日语言切换、持久化和重启恢复。
- 首页/计划地图、定位权限、旋转与 3D 俯仰下的点位计数、图标缓存和离线恢复。
- 计划批量添加的两级返回、硬件返回、深链和普通桌面恢复、嵌套页标题栏。
- TrueSheet 重复打开/关闭和跨页面切换，特别是 iOS 视图复用后的空白遮挡。
- 相机权限、拍摄、结果弹层动画、重拍保留缩放、图片预览/导出/相册/分享；结果页展示期间继续停止相机。
- iOS 27 可调整窗口下的旋转与方向行为；按页面设置的竖屏不能替代窗口尺寸适配验收。
- 备份导入导出、计划文件分享、下载更新；新旧 runtime 隔离和新包接收新 OTA。
- Sentry JS 错误和原生崩溃上报；自动导航计时按上述限制处理。

## 回退边界

迁移与此前的多语言依赖更新都留在新分支，原基线提交为 `6739d50`。需要回到 SDK 57 时，应保留当前工作树修改后切回原分支，并使用对应 lockfile 和 SDK 57 原生客户端；不能把 SDK 58 JavaScript 直接加载到旧客户端。尚未提交或发布时无需重写历史。
