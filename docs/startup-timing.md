# 启动优化复盘（2026-10-02）

以下数据来自合并前的临时埋点测试包。埋点和地图渲染探针已从最终代码中移除，保留这份历史记录供后续优化参考。

测试对象：`codex/startup-timing-test` 的 `1d07e05` test APK，Android 设备 `25060RK16C`。
[GitHub Actions 构建](https://github.com/boiboif/anitabi-app/actions/runs/37025594649)成功；正式包 `bbf.anitabiapp` 未参与测试。

已授权定位且有缓存时，同一设备连续 5 次 `am force-stop` 后冷启动：

| 指标 | 中位数 | 5 次范围 | 口径 |
| --- | ---: | ---: | --- |
| 启动请求到原生开屏消失 | 783 ms | 756–819 ms | Android `ActivityTaskManager: START` 到 `WindowManager: wms.hideSurface` 隐藏本包 Splash Screen |
| 启动请求到首个可见点位 | 1188 ms | 1166–1203 ms | 同一 `START` 到 `first-visible-map-point` 的 JS 回调；这是点位绘制完成时间的上界 |
| 图标裁剪缓存读取 | 3 ms | 3–4 ms | `sprite-crop-cache-hit` 的 `durationMs`，411 个图标 |

`START` 是系统收到 `am start -W` 请求后的日志事件，不含手指触屏到系统分发启动请求的延迟，因此不能直接与手动秒表结果相减。

全新安装（无地图和图标缓存）分别验证了允许与拒绝定位：地图初始化和 `map-cache-read hit=false` 均发生在权限请求前；两条路径最终都有可见地图点位，411 个图标裁剪后均记录 `sprite-crop-cache-saved`。允许定位路径的第二次冷启动直接记录 `sprite-crop-cache-hit`，无重复裁剪。全新安装还生成了演示计划。首次点位时间包含网络和权限弹窗停留，不应与上述已缓存冷启动数字直接比较。

本次有效的做法：

1. 用系统 Splash Screen 隐藏事件确认真实终点；`hideAsync()` 请求、Activity `Displayed`、截图和肉眼观察不是同一个时间点。重复测量时保持设备、缓存和网络条件一致。
2. 让根视图先布局并请求隐藏开屏，再读取和解析约 1355 万字符的地图缓存；移除开屏后的额外蓝色遮罩动画，延后非首屏模块。
3. 首屏先提交当前缩放级别可见的 1344 个点位，再提交全部 51903 个点位；随机点候选和图片点位索引也延后到需要时计算。
4. 番剧图标裁剪结果按 sprite 指纹和 ID 顺序持久缓存；异步复制期间保留 `File` 对象引用，并在首次写盘偶发失败时重试。清单最后写入，避免下次启动读取不完整缓存。
5. 在全新安装时，先启动地图数据，再弹出定位权限对话框；否则对话框可能暂停 `requestAnimationFrame`，拖延地图数据初始化。
6. TrueSheet 延迟加载在同机对比中没有明显收益，已撤回。只保留实测有效且副作用可控的改动。

验证范围是这一台 Android 设备的启动、地图首点、图标缓存、定位允许/拒绝与首装演示计划。其他页面和更新下载流程未做完整端到端回归。
