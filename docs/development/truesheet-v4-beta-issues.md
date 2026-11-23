# TrueSheet v4 beta 升级暂缓

2026 年 10 月 10 日决定暂缓升级。当前开发分支 `feature/v0.7.0-testing` 继续使用 TrueSheet `3.11.18`；迁移代码、技能更新和迁移说明保存到 `codex/truesheet-v4-migration`。等待 v4 正式版后重新验证原生问题，再决定是否采用迁移。

## 打开详情期间返回导致原生闪退

- 版本：TrueSheet `4.0.0-beta.24`、Expo SDK 57、React Native `0.86.3`，Android 开发客户端。
- 复现：首页打开作品详情，弹层刚开始打开时按系统返回。
- logcat：2026-10-10 的 11:31:24、11:32:01、11:34:01 出现相同的 `NullPointerException`。

关键调用链：

```text
TrueSheetStateUpdater.nativeUpdateState
TrueSheetStateUpdater.updateContainerSize
TrueSheetView.updateState
TrueSheetView.viewControllerDidChangeSize
TrueSheetViewController.setStateDimensions
TrueSheetViewController.setupSheetDetents
TrueSheetViewController.coordinatorLayoutDidLayout
TrueSheetCoordinatorLayout.onLayout
```

原有返回保护在弹层打开期间清除 `openedBangumiDetailsId`，随即卸载宿主。React Native 删除视图时先销毁 Fabric state wrapper 内的原生状态，再执行 view drop；beta.24 的 drop 清理没有立即清空 wrapper，后续布局仍可能进入 JNI 的 `impl->cthis()->getState()`，绕过 React Native 正常 `updateState()` 的有效性检查。这条源代码路径与异常栈一致。

## 处理决定

应用侧曾尝试“请求关闭 → 等呈现完成后 dismiss → 原生关闭完成后卸载”的规避，并通过 6 项状态测试及静态检查。该方案没有修复库内部生命周期缺陷，且没有完成真机验收。按用户决定已撤回关闭请求状态、时序控制和对应测试，不保留应用兼容层，也不添加原生依赖 patch。

迁移分支保留原关闭逻辑，因此 beta.24 下的原生崩溃属于已知升级阻塞项。当前使用 v3 的开发分支只保留此问题记录，不合入迁移代码。

## 正式版复测

1. 核实 npm 已发布 v4 正式版本，并查看相关原生生命周期修复；不能把相邻 issue 或静态检查当作此问题已修复的证据。
2. 在迁移分支升级到明确的正式版本，继续使用原关闭逻辑，保持没有时序规避和 native patch。
3. 使用与依赖版本匹配的原生开发客户端。按项目约定，构建和 prebuild 需要单独授权。
4. 真机检查打开立即返回、打开中连续返回、顶部关闭、正常滑动关闭、路由失焦及切换作品；对照 logcat，确认没有同类原生 NPE。
5. 再执行迁移说明中的列表定位、吸顶、图片预览、键盘、安全区和 footer 验收。通过后才考虑合入；若正式版仍复现，继续暂缓，由用户决定下一步。

完整迁移说明保存在迁移分支的 `docs/development/truesheet-v4-migration.md`。本记录不代表已向上游提交 issue，也不代表已安排自动监控发布。
