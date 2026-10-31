# 本地 OTA 与补充整包验证

`scripts/ota-test-server.mjs` 仅监听本机 `127.0.0.1`，不会发布 EAS Update、GitHub Release 或启动构建。它实现供测试包使用的 Expo Updates v1 响应，并从现有 APK 读取原始 Hermes bundle 与资源。APK 资源经过压缩、重命名时，脚本使用 Android SDK 的 `aapt2 dump resources` 只读解析真实路径，不修改 APK。

## 测试输入

准备原生运行时兼容的两个独立测试包 A、B，分别安装在不同测试包名下，以便同时保留两条更新链路。二者的原生版本相同、B 构建号更大，且 B 的构建时间晚于 A。为避免重合生产数据，不能使用正式包名。

测试构建的公共配置如下，具体构建步骤遵循项目单独授权：

| 输入                          | A                | B / OTA1         | OTA2             |
| ----------------------------- | ---------------- | ---------------- | ---------------- |
| `APP_CONTENT_REVISION`        | `a1111111`       | `b2222222`       | `c3333333`       |
| `EXPO_PUBLIC_OTA_TEST_MARKER` | `BASE`           | `OTA_ONE`        | `NEXT`           |
| 用户可见版本                  | `0.8.0-a1111111` | `0.8.0-b2222222` | `0.8.0-c3333333` |

`extra.contentRevision` 是内容版本的依据；OTA UUID 保留作诊断，不能再作为可见版本后缀。A 经 OTA1 更新后应与 B 新安装时显示完全相同的内容版本，尽管二者原生构建号、包名及 `Updates.updateId` 不同。

上表 A 为受控测试夹具，主动设置了 `APP_CONTENT_REVISION=a1111111`，因此显示带后缀的版本。实际普通正式整包不设置 `APP_CONTENT_REVISION`，只显示基础版本（例如 `v0.9.0`）；只有 OTA 发布及其配套整包构建显式注入来源 SHA。配置不再从 `GITHUB_SHA` 自动补充内容标识。此处保留 A 的显式标识，便于既有协议测试和历史设备证据继续核对实际加载的内容；它不代表普通整包的发布参数。

运行来源、原生构建号和完整 OTA ID 不在普通页面直接展示。诊断时连续点击“关于”页面标题 5 次打开详情弹窗，相邻点击超过 1 秒会重新计数。

测试包使用 `ANITABI_UPDATE_TEST_SERVER_URL=http://127.0.0.1:18790`。设备由验证者建立对应 ADB reverse；脚本不操作手机，也不会自动构建或安装。测试专用状态探针向服务器 `/reports` 上报当前原生构建号、完整更新 ID、`contentRevision`、实际 JS 内的 `bundleMarker`、版本展示字符串、更新检查与待重启状态。

OTA1 使用 B 内的原始 JS，时间设置在 A 内嵌更新与 B 内嵌更新之间，因此 A 可以应用它，B 新安装时不应再次提示应用同一内容。OTA2 必须提供通过 Expo SDK 58 导出的独立 JS 与导出元数据；只改变 manifest 或 UUID 不足以验证下一次代码更新。服务器要求 OTA2 的 launch asset SHA256 与 B 不同，并通过真机 `bundleMarker=NEXT` 证明实际执行了新 JS。

本地重复构建 A/B 时，不能只修改环境变量后复用所有 Gradle 输出。当前 RN bundle task 没有将 `EXPO_PUBLIC_*` 环境变量声明为输入，SDK 58 的 updates resource task 也可能复用上次生成的内嵌清单。每次切换测试包前，应使本项目 `android/app/build/generated/assets/react/release`、`android/app/build/generated/res/react/release` 和 `android/app/build/generated/assets/createReleaseUpdatesResources` 的生成输出失效；无需清理第三方库或全部原生编译缓存。最终必须从 APK 读取并核对 `assets/app.config`、`assets/app.manifest` 的更新 ID/时间与实际 JS marker/hash，确认 A/B 的 ID 不同且时间递增。CI 发布使用新的检出目录，不依赖本地这些增量输出。

## 服务与状态控制

```powershell
node scripts/ota-test-server.mjs --inspect-apk <A.apk>
node scripts/ota-test-server.mjs --base-apk <A.apk> --bundled-apk <B.apk> --port 18790
node scripts/ota-test-server.mjs --base-apk <A.apk> --bundled-apk <B.apk> --ota2-export <SDK58导出目录> --ota2-config <同环境的public-config.json>
```

`--ota2-export <目录>` 指向包含 `metadata.json` 的 SDK 58 导出目录，不能仅传一个推测路径的 JS 文件。读取器验证 `version: 0`、`bundler: metro`，按 `fileMetadata.android.bundle` 与 `assets[].path/ext` 精确读取文件；缺失 Android 元数据、资源文件或越界路径都会失败。`--ota2-config` 必须提供在同一环境取得的 `expo config --type public --json` 内容；脚本不会运行该命令或编造配置，它要求真实配置的 runtime 与 APK 一致，`extra.contentRevision` 与 `--ota2-revision` 一致。取得该配置及导出资源仍由验证者执行已授权的命令。

未提供有效 OTA2 source 时，服务器只提供 A/OTA1/B 场景，拒绝发布 OTA2。`--ota2-revision` 默认 `c3333333`；`--base-marker`、`--bundled-marker`、`--ota2-marker` 分别默认 `BASE`、`OTA_ONE`、`NEXT`。这些 marker 是断言的预期值，实际值必须由包内 JS 上报，不能用服务器元数据冒充。

`GET /admin/state` 返回更新 UUID、内容版本、marker、原生 A/B 信息及当前证据序号。`POST /admin/state` 可设置：

- `scenario`：`base`、`ota1`、`bundled`、`ota2`。
- `manifestFailures`、`assetFailures`、`assetInterruptions`：接下来指定次数的 HTTP 503 或资产截断。
- `assetCorruptions`：接下来指定次数的 C launch asset 响应仅翻转最后 1 字节，长度、manifest 声明 hash、原始资产和更新 UUID 均不变；不会损坏 OTA1、资源文件或磁盘导出文件。
- `assetDelayMs`：资产分块延迟。
- `activeRuntime`、`activeChannel`：模拟更新不匹配。

`bundled` 场景只将 `/releases/download.json` 推进到 B，`/releases/latest.json` 仍指向 A。`GET /admin/events?after=<序号>` 与 `/admin/reports?after=<序号>` 可限定本次操作的新证据，避免将上次检查结果当成本次通过。

## 验证与证据

```powershell
node scripts/verify-ota-device.mjs --plan
node scripts/verify-ota-device.mjs --scenario ota1
node scripts/verify-ota-device.mjs --check ota1-ready --after <返回的sequence>
```

校验脚本本身不会构建、安装、启动或清空 App。验证者先执行计划中的操作，再校验服务端新证据。故障场景应在 A 仍运行 OTA1、尚未成功下载 OTA2 时执行，以免缓存绕过故障注入。两客户端报告按各自原生包名和构建号筛选。

如需同时验证界面，先打开对应 App 的“我的”或“关于”页面，再附加 `--serial <设备> --surface profile` 或 `--surface about`。脚本采集当前 UI XML 与截图，并要求界面上出现完整预期内容版本。证据默认保存到 `.tmp/ota-validation`。

这些本地协议与脚本测试只证明受控输入下的行为；真实原生加载、版本展示和交互结果需以对应设备证据为准。

## OTA 资产完整性校验

在 A 仍运行 OTA1、尚未下载 C 时设置完整性故障，再在 A 中手动检查：

```powershell
node scripts/verify-ota-device.mjs --scenario ota2 --fault asset-corruption
node scripts/verify-ota-device.mjs --check asset-corruption --after <返回的sequence>
```

该故障不是 JS 崩溃注入：服务仍完整返回 C 的文件长度与原有 manifest，但响应体有 1 字节不同。SDK 58 原生 `verifySHA256AndWriteToFile` 会在 hash 不匹配时拒绝将临时文件提交为可用资产。服务事件保存 `corrupted`、`declaredHash` 和实际 `servedHash`，校验脚本要求这次确实完整传输了损坏 C，同时 A 的实际报告仍为 OTA1 / `b2222222` / `OTA_ONE`，且没有待重启状态。

清除故障后，在 A 中重新检查同一个 C 更新，再使用既有重试阶段：

```powershell
node scripts/verify-ota-device.mjs --scenario ota2
node scripts/verify-ota-device.mjs --check asset-retry --after <返回的sequence>
```

重试保持同一个更新 UUID 与声明 hash，返回未经修改的原始 C；脚本要求完成健康 launch asset 响应后才出现重启提示，实际重启后再核对 `c3333333` / `NEXT`。若采集到原生日志，应同时归档 `base64url-encoded SHA-256 did not match expected` 及对应请求边界。服务器模拟字节损坏和单元测试通过不等于此项真机已经通过。
