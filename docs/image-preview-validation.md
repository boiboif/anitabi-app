# 图片预览验证组件

使用 `react-native-zoom-toolkit` 5.1.1 和项目已有的 `expo-image`。

## 演示入口

开发模式下打开 `/image-preview-demo`。演示页没有加入业务菜单；生产模式访问该路由会返回首页。

已连接 Android 设备并自行启动开发应用后，可通过深链接打开：

```powershell
adb shell am start -a android.intent.action.VIEW -d "anitabiapp-dev://image-preview-demo"
```

生产变体的开发会话使用 `anitabiapp://image-preview-demo`，测试变体使用 `anitabiapp-test://image-preview-demo`。页面依赖 `__DEV__`，发行版无法打开。

示例图片来自 Picsum，需要网络。演示包含横图、竖图、长图、单图和故意失败的图片。

## 设备验收

- 点击不同缩略图：从对应位置展开，初始页码正确。
- 单击、关闭按钮、Android 返回键：退出一次，回到演示页。
- 双击图片不同位置：围绕点击位置放大，再次双击恢复。
- 双指缩放后拖动：边界正常，拖动不会意外触发关闭。
- 左右快滑和慢拖：切换图片，页码正确，切图后缩放重置。
- 原始尺寸下轻拉并松手：回弹；向下拖动足够距离或快速下拉：关闭，背景随距离变淡。
- 切到另一张图片后关闭：回到该图片对应的缩略图位置；缩略图已离开屏幕时淡出。
- 单图入口：不显示页码，使用淡入淡出。
- 失败入口：保留缩略图，展示重试；重试仍会失败，因为使用了不存在的域名。
- 长按：弹出回调提示；当前验证阶段不保存到相册。
- 连续打开、退出：初始页码、缩放和加载状态不沿用上一会话。
- iOS 和 Android 分别确认安全区、状态栏及退出后恢复情况。

## 组件接口

`src/components/image-preview.tsx` 导出 `ImagePreview`、`PreviewImage`、`ImagePreviewBounds` 和 `ImagePreviewProps`。

- `images`：每项包含唯一 `id`、大图 `uri`、可选 `thumbnailUri` 和原始 `width` / `height`（正数）。
- `visible`、`initialIndex`、`onClose`：控制显示、初始图片和关闭。收到 `onClose` 后调用方关闭组件。
- `getSourceBounds(index)`：可选，返回对应缩略图容器的窗口坐标；当前支持 `contain` 布局。没有位置时淡入淡出。返回的位置应仍在屏幕内。
- `onIndexChange`、`onLongPress`：提供后续接入回调。

图片列表在一次预览会话中应保持不变；重新打开会重置图库状态。组件目前提供验证所需的长按回调，保存到相册和业务入口留待下一阶段。

## 当前验证范围

已检查安装包的接口和 Gesture Handler 3 对旧版 Gesture API 的兼容入口。静态检查不能证明真实设备上的动画流畅度和手势表现；以上设备验收仍需运行应用完成。
