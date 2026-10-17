# Android 导航页头退出转场补丁（待真机验收）

适用版本：`react-native-screens@4.30.0`。

来源：[上游 PR #3777](https://github.com/software-mansion/react-native-screens/pull/3777)，固定提交
[`77ea9de22e2b33b9b73e4f4e56a174addac801a6`](https://github.com/software-mansion/react-native-screens/commit/77ea9de22e2b33b9b73e4f4e56a174addac801a6)。
该 PR 尚未合并；这里只移植三个 Android 文件的修复片段，适配 4.30.0 的文件路径和 import 上下文。

## 针对的问题

真机反复从大巡礼计划进入地图、返回后，日志出现
`ScreenStackHeaderConfigViewManager.removeViewAt` → `toolbar.addView` →
`The specified child already has a parent`，随后 ReactHost 销毁运行实例。
用户实际反馈的现象是停顿几秒后恢复；这次捕获的异常不能解释全部停顿。

退出动画期间，Android 可能已从父节点的子列表移除视图，却仍保留其 parent，直到
`endViewTransition` 完成。重新构造页头会再次添加该视图，引发异常。

补丁仅修改以下文件：

- `Screen.kt`：记录开始转场时的父子对，逆序结束；清理期间保留移除标记，并防止重入。
- `ScreenStack.kt`：保留现有动画 finalization blocker，在 fragment root 分离前完成后代转场。
- `ScreenStackHeaderConfig.kt`：自身或任意祖先 screen 正在移除时停止重建页头。

应用页面、导航动作、拖动、图片规则和动画配置均未修改。这份补丁针对上述致命异常，
尚不能证明它解决了所有内存压力或 Mapbox 销毁等待。

## 应用方式

`yarn install --frozen-lockfile` 的 `postinstall` 自动调用
`scripts/apply-react-native-screens-patch.cjs`，需要 Git 和 Node.js。
脚本校验精确版本，预检整份补丁后才应用；重复执行直接成功，不兼容时终止安装。
现有 GitHub 工作流先安装依赖，再运行 `expo prebuild --clean --no-install`，因此无需修改工作流。
不要使用 `--ignore-scripts` 跳过补丁后直接构建。

## 验收与移除

提交此实验补丁时未运行构建或设备验收，由用户在 GitHub 手动运行 **Android Test Build (Release APK)**，
选择本分支构建并安装。使用 1000 多点计划，从顶部按钮和点位入口分别反复进入地图，
约 500ms 后返回并立即再次进入，至少 10 轮；同时检查普通返回、页头按钮、滚动位置和地图操作。

验收时连续收集 logcat；避免高频运行完整 `dumpsys meminfo`，它会触发额外 GC 干扰测量。
需要同时确认没有上述 HeaderConfig 异常及后续 ReactHost 销毁，不能只凭短时间不卡顿判定通过。

回滚时回退本次补丁提交，并在全新依赖安装后重新构建。升级 Screens 时需重新审查此补丁，
上游发布包含等价修复的版本后再移除。
