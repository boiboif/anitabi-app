---
title: 在 iOS 上侧载安装
description: 使用 Sideloadly 或 SideStore 在 iPhone、iPad 上安装 Anitabi，了解续签、更新及 LiveContainer 进阶方案。
---

# 在 iOS 上侧载安装

Anitabi 的 iOS 安装包以未签名 IPA 的形式发布，需要使用自己的 Apple 账户，通过侧载工具签名后安装。无需越狱，免费 Apple 账户也可以使用。

## 选择安装方式

| 方式                                        | 适合谁                               | 如何续签                                               |
| ------------------------------------------- | ------------------------------------ | ------------------------------------------------------ |
| [Sideloadly](#sideloadly)                   | 第一次侧载，或经常使用电脑           | 电脑通过 USB 或同一网络连接设备后刷新                  |
| [SideStore](#sidestore)                     | 希望日常在手机上续签                 | 首次用电脑安装，之后连接 Wi-Fi 并开启 LocalDevVPN 刷新 |
| [LiveContainer + SideStore](#livecontainer) | 已熟悉侧载、希望在容器中运行多个应用 | 通过 SideStore 刷新容器；需要额外配置                  |

第一次安装建议选择 **Sideloadly**。如果已经配置好 SideStore 或 AltStore，可直接导入下文下载的 IPA。

::: info 免费账户的限制
签名有效期为 **7 天**，过期后应用将无法打开，需要续签。每台设备最多同时安装 **3 个**免费签名应用，SideStore 本身也占一个名额。自动续签需要满足对应工具的运行条件，并不等于永久有效。详见 [Apple 账户限制](https://developer.apple.com/help/account/basics/about-your-developer-account)。
:::

::: warning 使用前请了解
侧载不是 App Store 或 TestFlight 分发。Sideloadly 等侧载工具是第三方软件，与 Anitabi 或 Apple 没有关联。请只从官方网站下载工具，不要把 Apple 账户密码、验证码或恢复密钥提供给 Anitabi 项目维护者或其他人。
:::

## 准备工作

- 一台 Windows 或 macOS 电脑；
- 一台运行 iOS / iPadOS 16.4 或更高版本的 iPhone 或 iPad，以及可稳定传输数据的连接线；
- 一个可正常登录并完成双重认证的 Apple 账户，记住用于签名的账户；
- 从 [Anitabi GitHub Releases](https://github.com/boiboif/anitabi-app/releases) 的 **Assets** 中下载的 `anitabi-app-*-unsigned.ipa`。不要下载 `Source code` 压缩包，也不要下载 Android 的 `.apk`。

IPA 不能像 Android APK 一样点击安装。Sideloadly 需要在电脑上选择文件；SideStore 和 LiveContainer 需要先把 IPA 存入手机的“文件”App，再从各自的导入入口选择它。

## 方法一：使用 Sideloadly {#sideloadly}

### 1. 安装电脑端工具

从 [Sideloadly 官网](https://sideloadly.io/) 下载对应的 Windows 或 macOS 版本。Windows 用户还需通过官网提供的链接安装桌面版 iTunes 和 iCloud，**不要使用 Microsoft Store 版本**。这是 Sideloadly 的要求；SideStore 所用的 iloader 请遵循它自己的安装说明。

### 2. 连接设备并安装 IPA

1. 用数据线连接 iPhone 或 iPad，解锁后在“要信任此电脑吗？”弹窗中选择“信任”，输入设备密码。
2. 打开 Sideloadly，确认 **iDevice** 中显示的是要安装的设备。
3. 点击左侧 IPA 图标，选择 `anitabi-app-*-unsigned.ipa`，也可以把文件拖入窗口。
4. 在 **Apple ID** 中填写用于签名的 Apple 账户邮箱，保留自动刷新选项，然后点击 **Start**。
5. 按提示输入账户密码和双重认证验证码。安装期间保持连接，直到显示 **Done.**。
6. 按照下方[首次启动设置](#first-launch)信任开发者并开启开发者模式，然后从主屏幕打开 Anitabi。

### 3. 配置自动续签

电脑需要开机并运行 **Sideloadly Daemon**，设备也必须能被电脑发现。通过 USB 连接即可刷新；希望通过 Wi-Fi 刷新时，先用数据线配对，再完成以下设置：

- **Windows**：在 iTunes 的设备摘要中勾选“通过 Wi-Fi 与此设备同步”，应用并同步。
- **macOS**：在 Finder 中选择设备，在“通用”中勾选“连接到 Wi-Fi 时显示此设备”，应用并同步。

之后让电脑与设备连接同一网络。若无法发现设备，先解锁亮屏或改用 USB。不要等到第 7 天才检查是否续签成功；长期不使用电脑时，改为手动连接并重新侧载。详见 [Sideloadly FAQ](https://sideloadly.io/faq)。

## 方法二：使用 SideStore {#sidestore}

SideStore 首次安装需要电脑；配置完成后，日常安装和续签可在手机上完成。以下按 [SideStore 官方安装文档](https://docs.sidestore.io/docs/installation/install)操作。

### 1. 安装 iloader 和 LocalDevVPN

1. 在电脑上从 [iloader 官网](https://iloader.app/)下载并安装工具。Windows 的 iTunes 等依赖请按 [SideStore 准备工作](https://docs.sidestore.io/docs/installation/prerequisites)配置。
2. 在 iPhone 或 iPad 上安装 [LocalDevVPN](https://apps.apple.com/app/localdevvpn/id6755608044)，允许添加 VPN 配置并连接。如果所在 App Store 地区无法下载，先查看 SideStore 官方文档中的可用获取方式，再选择是否使用此方案。
3. 让手机连接 **Wi-Fi**。仅有蜂窝网络不满足 SideStore 的要求；安装、更新、续签期间都需要连接 LocalDevVPN。

### 2. 安装并初始化 SideStore

1. 用数据线连接设备，解锁并信任电脑。
2. 打开 iloader，登录 Apple 账户，选中设备并点击 **Install SideStore (Stable)**。
3. 安装后，按照[首次启动设置](#first-launch)信任开发者并开启开发者模式。
4. 确认 Wi-Fi 和 LocalDevVPN 已连接，打开 SideStore，登录与 iloader 相同的 Apple 账户。
5. 在 **My Apps** 中点击 SideStore 右侧的剩余天数，先完成一次 SideStore 自身刷新。若提示撤销或创建签名证书，按官方流程选择 **Yes** 或 **Refresh Now**。刷新时可能返回主屏幕，等待数秒后重新打开。

### 3. 导入 Anitabi

1. 在手机上下载 IPA 并存入“文件”App，或从电脑传入后存入“文件”。
2. 打开 SideStore 的 **My Apps**，点击 **+**，选择 `anitabi-app-*-unsigned.ipa` 并等待安装完成。
3. 返回主屏幕打开 Anitabi。日常续签时，在 Wi-Fi 和 LocalDevVPN 连接状态下打开 **My Apps → Refresh All**，确认 SideStore 和 Anitabi 的剩余有效期均已更新。

LocalDevVPN 用于 SideStore 的安装和刷新流程，无需为了日常打开 Anitabi 而一直开启。如果 SideStore 自身已过期无法启动，需要重新连接电脑，用 iloader 恢复安装。

## 进阶：LiveContainer + SideStore {#livecontainer}

LiveContainer 将应用导入容器中运行，导入的应用不各自占用普通侧载名额；**容器本身仍需签名和续签**。它与直接安装到主屏幕的运行方式不同，本指南尚未验证 Anitabi 在容器内的完整兼容性，第一次安装建议使用前两种方式。

### 1. 安装集成版本

按照前面 SideStore 的准备步骤安装最新版 iloader、LocalDevVPN 并连接设备。在 iloader 中选择 **LiveContainer+SideStore**，然后完成[首次启动设置](#first-launch)。集成版本整体占用一个侧载名额，无需先安装独立版 SideStore。

### 2. 配置内置 SideStore 和证书

1. 保持 Wi-Fi 和 LocalDevVPN 已连接，打开 LiveContainer，从 **Apps** 页进入内置 SideStore。
2. 在 SideStore 设置中登录用于签名的 Apple 账户。如果沿用了旧配置且显示已登录，先退出账户再重新登录。
3. 在 **My Apps** 中点击 **Refresh All**，完成刷新后退出内置 SideStore，再次打开 LiveContainer。
4. 在 LiveContainer 设置中点击 **Import Certificate from SideStore**（从 SideStore 导入证书）并确认。按钮变为 **Remove Certificate** 表示导入成功，也可以使用 **JIT-Less Mode Diagnose** 检查配置。

### 3. 导入并运行 Anitabi

回到 **LiveContainer 的 Apps 页**，点击 **+**，选择“文件”中的 Anitabi IPA，导入后从容器内的应用列表打开。这里应在 LiveContainer 中导入；如果在内置 SideStore 中直接安装 Anitabi，它仍然会占用普通侧载名额。

后续通过内置 SideStore 的 **Refresh All** 续签容器。证书导入或运行出现问题时，参阅 [LiveContainer + SideStore 官方教程](https://livecontainer.github.io/docs/installation/lc_sidestore)和[容器应用常见问题](https://livecontainer.github.io/docs/faq/using-guest-apps)。

## 首次启动设置 {#first-launch}

### 信任开发者

打开“设置 → 通用 → VPN 与设备管理”，在“开发者 App”下选择用于签名的 Apple 账户，点击“信任”并确认。较新的 iOS 版本可能显示“允许并重新启动”，按系统提示完成即可。

### 开启开发者模式

Anitabi 支持的 iOS / iPadOS 版本均需要为这类开发者签名应用开启开发者模式：打开“设置 → 隐私与安全性 → 开发者模式”，开启后按提示重启，解锁并再次确认开启。

若找不到这一项，先连接电脑、完成配对并尝试安装，再返回设置查看。信任电脑、信任开发者和开启开发者模式是不同操作，不能互相替代。参见 [Apple 开发者模式说明](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)。

## 更新与保留数据

**续签**延长当前应用的可用时间；**更新安装包**需要导入新版 IPA，侧载工具的刷新不会更新安装包。Anitabi 支持的兼容热更新仍按应用内提示生效，无需为此重新导入 IPA。

1. 更新或更换安装方式前，在 Anitabi“我的 → 备份与恢复 → 导出备份”中保存重要数据；如需保留巡礼记录和照片，确认将它们包含在备份中，并将备份保存到应用以外的位置。
2. 从 [GitHub Releases](https://github.com/boiboif/anitabi-app/releases) 下载新版 `*-unsigned.ipa`。
3. 使用原来的安装工具、Apple 账户和应用标识（bundle ID）覆盖安装，不要随意更改标识，也不要先删除旧版。Sideloadly 中仍需保留自动刷新选项；SideStore 中重新用 **+** 导入新版 IPA。

相同账户和应用标识下通常可以保留本地数据，但不代替备份。直接侧载与 LiveContainer 使用不同的数据容器，切换方式时不要假定数据会自动迁移。应用已过期打不开时，先尝试原账户覆盖续签，恢复访问后再备份。

## 常见问题

### 下载 IPA 后点击没有反应

这是正常现象。请在 Sideloadly、SideStore 或 LiveContainer 中导入文件，不能在浏览器或“文件”App 中直接点击安装。

### 提示“不受信任的开发者”或需要开发者模式

按照[首次启动设置](#first-launch)操作。若“VPN 与设备管理”中没有对应账户，先确认工具已报告安装成功。

### 提示“无法验证 App”或“App 不再可用”

先检查签名是否过期，保持设备联网并检查开发者信任状态。使用原工具和原 Apple 账户重新刷新或覆盖安装；若 SideStore 也打不开，先用电脑恢复 SideStore。不要因为过期就直接删除 Anitabi，以免丢失本地数据。

### Sideloadly 找不到设备

确认设备已解锁并信任电脑，然后更换支持数据传输的连接线或 USB 接口。Windows 用户还应检查 iTunes 和 iCloud 是否为 Sideloadly 官网提供的桌面版本。

### SideStore 无法安装或刷新

确认设备连接的是 Wi-Fi，且 LocalDevVPN 已连接，暂时断开可能冲突的其他 VPN。若提示配对文件失效，尤其是更新或重置 iOS 后，需要重新连接电脑并按 [SideStore 配对文件恢复指引](https://docs.sidestore.io/docs/advanced/pairing-file)恢复配对。

### 提示已达到应用数量或 App ID 上限

- **已安装应用上限**：免费账户每台设备最多同时安装 3 个侧载应用，SideStore 也计入其中。先备份，再移除不再使用的侧载应用。
- **App ID 上限**：免费账户最多注册 10 个短期 App ID，7 天后到期；应用扩展也可能占用标识。删除应用不会立即释放这些 App ID，需要等待到期。不要通过反复修改 bundle ID 重试。

### 覆盖安装失败

先核对是否使用同一 Apple 账户和 bundle ID，并查看工具的具体错误。只有在备份已保存、确认可以恢复后，才考虑删除旧版重装；删除应用也会删除其本地数据。

本文参考 [Kazumi 的 iOS 安装指南](https://kazumi.app/docs/misc/how-to-install-in-ios/)，并结合上述工具的官方文档整理。工具界面与系统提示可能随版本变化，请以官方最新说明为准。
