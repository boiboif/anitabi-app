# GitHub Actions 发版与更新

本项目使用 GitHub Actions 构建 Android APK，使用 EAS Update 发布热更新。Android APK 不需要上传应用商店，用户从 GitHub Release 下载或由应用内整包更新流程安装。

## 首次配置

### GitHub Variables

在仓库 `Settings` → `Secrets and variables` → `Actions` → `Variables` 中配置：

- `EXPO_PROJECT_ID`：Expo 项目的 project ID。
- `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`：Mapbox token。
- `ANDROID_VERSION_CODE_OFFSET`：首次启用自动构建号时使用的基线，必须不小于迁移前已发布 APK 的最大 `versionCode`。不配置时默认为 `1000`；已有更新清单后不再需要手动调整。

### GitHub Secrets

在同一页面的 `Secrets` 中配置：

- `EXPO_TOKEN`：用于发布 EAS Update 的 Expo token。
- `ANDROID_KEYSTORE_BASE64`：现有 EAS 签名 keystore 的 Base64 内容。
- `ANDROID_KEYSTORE_PASSWORD`：旧 EAS 凭据文件中的 Android upload keystore password。
- `ANDROID_KEY_ALIAS`：旧 EAS 凭据文件中的 Android key alias。
- `ANDROID_KEY_PASSWORD`：旧 EAS 凭据文件中的 Android key password。
- `SENTRY_AUTH_TOKEN`：如果构建需要上传 Sentry source map，则配置；否则可以不配置。

`keystore/@codehero_bbf__anitabi-app-keystore.bak.jks` 是之前 EAS 使用的签名文件，应继续复用它。不要生成新 keystore，也不要将 `.jks`、凭据 Markdown 文件或密码提交到 Git。可以在本地 PowerShell 7 中直接将文件内容写入 GitHub Secret，Base64 不会保存到仓库：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('.\keystore\@codehero_bbf__anitabi-app-keystore.bak.jks')) | gh secret set ANDROID_KEYSTORE_BASE64
```

随后从本地凭据文件中分别设置 `ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS` 和 `ANDROID_KEY_PASSWORD`。三个字段分别对应 keystore 密码、alias 和 key 密码，不要默认假设它们相同。执行 `gh secret set` 前需先通过 `gh auth login` 登录有仓库写权限的 GitHub 账号。

`ANDROID_VERSION_CODE_OFFSET` 的选择很重要。工作流读取 production 和 preview 更新清单中的最大 `buildNumber`，并使用以下规则生成真正写入 APK 的 Android `versionCode`：

```text
versionCode = max(ANDROID_VERSION_CODE_OFFSET, latest.buildNumber, preview.buildNumber) + 1
```

因此 production 和 preview 共用一个严格递增的 Android 构建号序列，同一个 `versionName` 也可以发布多个构建。客户端会优先比较 `buildNumber`，而不是只比较 `version`。首次迁移时，应将 offset 设为不小于旧 EAS APK 的最大 versionCode；之后每次成功发布都会自动 `+1`。

## 整包发版

整包发布由 GitHub Actions 完成。先在 `app.config.ts` 修改 `version`，提交到 `main`，再进入 GitHub 的 `Actions` → `Android Release` → `Run workflow`，选择 `production` 或 `preview`，填写更新说明。工作流会自动读取 `app.config.ts` 中的版本号，计算 Android `versionCode`、构建签名 APK、创建 GitHub Release，并生成对应的 `latest.json` 或 `preview.json`。

production 发版流程如下：

1. 确保代码已合并到 `main`，并从 `main` 分支运行 `Android Release`。
2. 选择 `production`，填写 `release_notes`。Actions 输入框是单行控件，需要换行时输入字面量 `\n`，例如 `修复地图加载问题\n优化图片缓存\n调整更新提示`；工作流会将其转换成 GitHub Release 和应用内更新说明中的真实换行。版本号不在 Actions 页面填写，以 `app.config.ts` 的 `version` 为准。
3. 需要强制更新时勾选 `mandatory`；也可以填写 `min_supported_version` 或 `min_supported_build_number`。
4. Actions 使用旧 EAS keystore 构建签名 APK，创建 `v<version>` GitHub Release。
5. Actions 自动生成并提交 `docs/releases/latest.json`。客户端随后可发现该 APK。

`preview` 使用独立的 EAS `preview` channel、GitHub prerelease tag 和 `docs/releases/preview.json`，不会影响 production 用户。工作流会查询当前版本已有的 `v<version>-preview.N` Release，取最大 `N` 后自动 `+1`。当前已有 `preview.1` 到 `preview.8` 时，下一次会生成 `preview.9`。preview 序号仅用于 Release 名称，与 Android `versionCode` 相互独立。

production 始终使用精确 tag `v<version>`，例如 `v0.0.1`。如果同名 GitHub Release 或 Git tag 已存在，工作流会在 Android 构建前直接报错；正式发版前必须先修改 `app.config.ts` 的 `version`。

`version` 是用户看到的 Android `versionName`；`buildNumber` 是 Android `versionCode`。客户端整包更新优先比较 `buildNumber`，因此同一个 `version` 也可以发布多个构建。

手动生成清单的命令仍然可用。GitHub Release 创建完成后运行：

```bash
yarn release:manifest --from-github --version 0.0.2 --build-number 1002
```

脚本会读取对应的 `v<version>` GitHub Release，自动获取标题、Release Notes 和 APK 下载地址，然后生成 `docs/releases/latest.json`。

也可以在 GitHub Release 创建前手动提供更新说明：

```bash
yarn release:manifest --notes "修复地图加载问题并优化图片缓存"
yarn release:manifest --notes-file ./release-notes.md
```

强制更新：

```bash
yarn release:manifest --from-github --mandatory
```

仅强制过旧版本更新：

```bash
yarn release:manifest --from-github --min-supported-version 0.0.1
yarn release:manifest --from-github --min-supported-build-number 1001
```

可通过 `yarn release:manifest --help` 查看全部参数。生成后：

1. 检查生成的 `docs/releases/latest.json`。`buildNumber` 对应 Android `versionCode`，整包更新优先比较它。
2. 提交该文件到 `main` 分支。
3. 如果旧版本低于 `minSupportedVersion`，应用会按强制更新处理。

应用启动后会根据构建时写入的更新频道读取对应清单：production 使用本仓库 `main` 分支的 `docs/releases/latest.json`，preview 使用 `docs/releases/preview.json`。清单地址由 `app.config.ts` 根据 `EXPO_UPDATE_CHANNEL` 自动生成，不需要额外配置 GitHub Variable。

## 热更新

热更新只适用于 JavaScript、资源和配置中不涉及原生代码的改动。进入 `Actions` → `EAS Hot Update` → `Run workflow`，选择目标 channel 并填写更新说明。原生版本以当前 `app.config.ts` 的 `version` 和已安装 APK 为准。工作流会执行：

```bash
npx eas-cli@21.8.0 update --channel production --environment production --platform android --message "更新说明" --non-interactive
```

工作流只能从 `main` 分支运行，并会在发布前检查 `app.config.ts` 的 `version` 是否与目标 channel 最新整包清单中的 `version` 相同。由于 `runtimeVersion` 使用 `appVersion` 策略，版本不一致时热更新无法被已安装 APK 接收，工作流会直接报错。应先发布对应版本整包，再发布该版本的热更新。

`preview` 和 `production` 分别使用独立的 EAS channel、EAS environment 和整包更新清单。工作流会自动创建首次使用的 EAS channel；Preview 热更新固定注入 `docs/releases/preview.json`，Production 热更新使用 `docs/releases/latest.json`，不会互相串线。当前只发布 Android Update。

应用启动时静默检查并下载 EAS Update，下载完成后提示重启生效。修改原生依赖、权限、Expo config plugin、Android/iOS 原生配置或需要变更 `versionCode` 时，必须走整包发版。

整包更新当前针对 Android arm64-v8a APK，覆盖绝大多数现代 Android 真机，不支持仅有 32 位 CPU 的旧设备。Android 首次安装或从旧 EAS APK 升级时，必须使用同一 applicationId 和同一签名 keystore；复用上述旧 EAS keystore 可以保持升级兼容。iOS 不能由应用直接安装 IPA；如果未来需要 iOS 整包更新，应将 `releaseUrl` 指向可分发页面或 TestFlight。
