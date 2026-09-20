---
title: 在 iOS 上侧载安装
description: 使用 Sideloadly 为 Anitabi 未签名 IPA 签名并安装到 iPhone 或 iPad。
---

# 在 iOS 上侧载安装

Anitabi 的 GitHub Release 提供未签名 IPA。iOS 不能直接运行未签名应用，因此从“文件”App、浏览器或隔空投送打开 IPA 都无法直接完成安装。侧载工具会使用你自己的 Apple 账户为 IPA 临时签名，再将它安装到设备。

::: warning 使用前请了解
侧载不是 App Store 或 TestFlight 分发。Sideloadly 等侧载工具是第三方软件，与 Anitabi 或 Apple 没有关联。请只从官方网站下载工具，不要把 Apple 账户密码、验证码或恢复密钥提供给 Anitabi 项目维护者或其他人。
:::

## 准备工作

- 一台 Windows 或 macOS 电脑；
- 一台运行 iOS / iPadOS 16.4 或更高版本的 iPhone 或 iPad，以及可稳定传输数据的连接线；
- 一个已启用双重认证的 Apple 账户，免费账户也可以使用；
- 从 [Anitabi GitHub Releases](https://github.com/boiboif/anitabi-app/releases) 下载的 `anitabi-app-*-unsigned.ipa`；
- 从 [Sideloadly 官网](https://sideloadly.io/) 下载并安装 Sideloadly。

Windows 用户还需要安装 Sideloadly 所要求的桌面版 iTunes 和 iCloud。请按照 Sideloadly 官网的链接安装，不要使用 Microsoft Store 版本。

## 使用 Sideloadly 安装

1. 使用连接线将 iPhone 或 iPad 连接到电脑并解锁设备。
2. 如果设备询问“要信任此电脑吗？”，请选择“信任”并输入设备密码。
3. 打开 Sideloadly，确认设备名称已出现在设备列表中。
4. 将下载的 `*-unsigned.ipa` 拖入 Sideloadly，或点击 IPA 图标选择文件。
5. 输入用于签名的 Apple 账户邮箱，然后点击 **Start**。
6. 按照提示完成登录和双重认证，等待 Sideloadly 显示安装完成。
7. 如果设备要求启用开发者模式，请打开“设置 → 隐私与安全性 → 开发者模式”，按提示重新启动设备并确认开启。
8. 如果首次启动时提示开发者不受信任，请打开“设置 → 通用 → VPN 与设备管理”，选择对应的 Apple 账户并确认信任。
9. 返回主屏幕打开 Anitabi。

Apple 对本地安装的开发者应用要求启用开发者模式。开发者模式选项通常会在设备与电脑配对或首次尝试安装后出现，具体文字可能随 iOS 版本略有不同。参见 [Apple 的开发者模式说明](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)。

## 有效期、续签与更新

未加入 Apple Developer Program 的免费账户存在以下限制：

- 签名和 provisioning profile 通常只有 7 天有效期，到期后应用将无法打开；
- 每台设备最多同时安装 3 个使用免费账户签名的应用；
- 需要在到期前自动刷新，或到期后重新侧载同一个 IPA。

Sideloadly 可以在电脑与设备通过 USB 或同一网络连接时尝试自动刷新。更新 Anitabi 时，请使用与之前相同的 Apple 账户和 bundle ID 重新侧载新版 IPA，通常可以覆盖安装并保留本地数据。重要数据仍建议提前备份，不要在没有备份的情况下先删除旧版本。

以上免费账户限制来自 [Apple Developer 账户说明](https://developer.apple.com/help/account/basics/about-your-developer-account)，自动刷新方式请参阅 [Sideloadly FAQ](https://sideloadly.io/faq)。

## 使用其他侧载工具

如果你已经配置 SideStore、AltStore 或其他可信的侧载工具，也可以导入同一个未签名 IPA。它们同样会先使用你的 Apple 账户或开发者证书进行签名，并不能让 iOS 直接运行未签名程序。请以所用工具的官方文档为准。

## 常见问题

### 下载 IPA 后点击没有反应

这是正常现象。未签名 IPA 不能像 Android APK 一样直接安装，需要先通过侧载工具签名。

### 提示“无法验证 App”或“App 不再可用”

签名可能已经过期，或者设备暂时无法验证签名。请保持设备联网，使用原来的 Apple 账户重新侧载，并再次检查“VPN 与设备管理”中的信任状态。

### Sideloadly 找不到设备

确认设备已解锁并信任电脑，然后更换支持数据传输的连接线或 USB 接口。Windows 用户还应检查 iTunes 和 iCloud 是否为 Sideloadly 官网提供的桌面版本。

### 提示已达到应用数量上限

免费账户每台设备最多同时安装 3 个侧载应用。需要删除不再使用的侧载应用，或改用加入 Apple Developer Program 的账户。

### 覆盖安装失败

旧版本可能由另一个 Apple 账户或不同 bundle ID 签名。先备份应用内的重要数据，再删除旧版本并重新安装；删除应用会同时删除其本地数据。
