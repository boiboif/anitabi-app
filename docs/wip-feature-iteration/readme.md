# WIP：功能迭代与图片预览

> 临时交接记录：保存 2026-09-27 本次对话的需求、决定、进展和后续工作。
> **本次迭代完成并验收后，必须删除本文件；目录没有其他内容时可一并删除。**
> 项目根目录的 `README.md` 是正式项目说明，不要因清理本记录而删除或覆盖。

## 分支与提交

- 分支：`feature-iteration-image-preview`。
- 本次提交为 **WIP**，用于保存睡前进度；不表示图片预览已经通过设备验收。
- 用户计划次日继续，当前没有安排自动任务。

## 本次对话需求与完成情况

### 1. 首页选中 marker 置顶

用户要求：首页 marker 被选中、popup card 打开时，选中的 marker 应处于最高层级，参考巡礼计划地图的做法。

已修改 `src/components/map-container.tsx`：

- 首页 popup 的 `MarkerView` 增加 `isSelected`，与巡礼计划地图保持一致。
- 增加由番剧 ID 和点位 ID 组成的 key，切换选中点位时更新独立 marker。
- 实际重叠场景仍需在设备上检查。

### 2. 巡礼计划导入同时收藏

用户要求：导入计划时提供“导入同时收藏”选项，默认勾选。

开始本次工作时，工作区已存在相关未提交实现，本次保留、检查，并一起纳入 WIP 提交：

- `src/app/plans/import.tsx`：默认勾选，可取消；确认导入后按选项批量收藏。
- `src/store/use-favorite-points.ts`：新增 `addFavorites`，跳过已收藏项和重复项，只写入一次存储。
- `src/i18n/translations/{zh,en,ja}.ts`：中文、英文、日文文案。
- 文件、二维码、链接导入共用该确认页。
- 实际导入流程仍需在设备上检查。

### 3. 图片预览组件

用户先要求描述微信聊天点击图片预览的交互，不立即开发；随后明确：先做独立组件，业务接入位置以后讨论。

讨论的目标体验：

- 从被点击图片的位置展开到黑色背景全屏，关闭时收回。
- 单击退出、双击缩放、双指缩放、放大后拖动。
- 原始尺寸下下拉关闭，背景随拖动渐隐，不够距离则回弹。
- 多图左右切换和页码，单图不显示页码。
- 缩略图先展示，再加载高清图；失败可重试。
- 长按菜单及保存到相册作为后续完整组件能力。

最初列举了 `react-native-image-viewing`，用户指出其长期未更新。随后重新核查维护情况：

- `react-native-zoom-toolkit`：5.1.1，2026-08-30 发布，提供 Gallery 和缩放基础。
- `react-native-zoom-reanimated`：1.6.0，2026-09-15 发布，作为备选，文档说明支持 Gesture Handler 2 / 3。
- 近期发布不等于已确认适配本项目，需要实际验证。

最终同意：先用 **`react-native-zoom-toolkit` 做独立验证组件**，验证后再正式完善和讨论业务接入。用户授权开始开发。

## 图片预览当前实现

- 固定新增依赖 `react-native-zoom-toolkit` 5.1.1；未升级现有 Gesture Handler 3.3.0、Reanimated 4.5.1、Worklets 0.10.1。
- `src/components/image-preview.tsx`：独立受控 `ImagePreview`，支持初始索引、图片列表、可选缩略图位置、关闭/切图/长按回调。
- 使用 `expo-image` 展示缩略图与高清图，支持缓存、加载指示和失败重试。
- 由 Gallery 提供缩放、拖动和切图；垂直拖动回调用于下拉关闭与背景透明度。
- 展开/收回支持 `contain` 布局的缩略图容器；没有有效位置或缩略图已离屏时淡入淡出。
- 关闭使用单独的图片快照，避免图库松手回弹干扰关闭动画。
- 单击、关闭按钮、Android 返回键可关闭；每次重新打开重置会话。
- 长按目前只有回调，**尚未实现保存到相册**。
- **尚未接入首页、点位详情、巡礼计划等业务页面**，接入位置等待后续讨论。

## 演示与明日继续入口

- 演示页：`src/app/image-preview-demo.tsx`，路由 `/image-preview-demo`。
- 仅开发模式可访问；发行模式重定向到首页。
- 示例使用 Picsum 网络图片，包含横图、竖图、长图、单图和故意加载失败场景。
- 长按会弹出回调提示。
- Android 开发变体启动后可执行：

```powershell
adb shell am start -a android.intent.action.VIEW -d "anitabiapp-dev://image-preview-demo"
```

- 正式变体的开发会话使用 `anitabiapp://image-preview-demo`，测试变体使用 `anitabiapp-test://image-preview-demo`。
- 详细验收步骤：`docs/image-preview-validation.md`。

## 已执行的检查与限制

- TypeScript：`tsc --noEmit --pretty false` 通过。
- 改动相关文件 ESLint 通过。
- 新增组件和演示页 Prettier 检查通过。
- `git diff --check` 通过。
- 已查看 Expo SDK 57 版本文档和项目本地 Tamagui 参考，未增加例行手动 memoization。
- 已检查 Gesture Handler 3 对旧版 Gesture API 的兼容入口，但**没有实际运行设备验证手势与动画**。
- 未运行构建、打包、prebuild、export 或开发服务器。

安装过程说明：Yarn 在连接依赖阶段因现有 ESLint 原生依赖 `.node` 文件被占用而中断。新增图库包已写入 `node_modules`；之后只补齐了 `package.json` 和对应锁文件记录，并核实包的运行文件、类型文件及依赖版本，静态检查通过。未停止正在运行的进程。后续如果安装环境异常，应先检查依赖安装状态，勿把此次 Yarn 命令记为完整成功。

## 下一步待办

1. 在 Android/iOS 上按验证文档检查缩放、左右切图、下拉回弹/关闭、源位置过渡、安全区和状态栏恢复。
2. 检查连续打开关闭、不同初始索引、快速操作和图片加载失败，修复实际发现的问题。
3. 根据真实设备结果决定保留 zoom-toolkit 或评估备选；静态检查不代表交互已验收。
4. 验证通过后，讨论完整组件的长按菜单、保存到相册及图片尺寸/裁切适配。
5. 再与用户讨论业务接入位置；不要自动接入地图或点位页面。
6. 验证首页 marker 重叠场景，以及导入收藏勾选/取消、已有收藏去重等流程。
7. 迭代验收完成后清理开发演示/临时记录，**删除本 `readme.md`**。演示页和验证文档是否保留按最终迭代安排决定。

## 后续工作约束

- 遵守 `AGENTS.md`：编写代码前查阅 Expo 57 精确版本文档；涉及 Tamagui 时查阅 `docs/tamagui-llms.txt`。
- 使用 React Compiler 默认自动 memoization。
- 用户没有授权构建或打包，相关命令必须先明确询问并等待许可。
- 常规 UI 修改不要自行启动、重启或验证开发服务器。
- 用户随后要求去掉分支名中的 `codex/` 并推送到远程；未要求创建 PR 或发布。
